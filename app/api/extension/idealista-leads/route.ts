import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { verifyExtensionToken } from "@/lib/services/idealista/extension-token";
import { suggestLeadType } from "@/lib/services/idealista/lead-classifier";
import { isPersistedLeadImage, persistIdealistaLeadImage } from "@/lib/services/idealista/persist-lead-image";
import { matchPropertyByAddress } from "@/lib/services/idealista/lead-property-match";
import { autoMergeLeadsByPhone } from "@/lib/sales-inbox/auto-merge";
import { ADMIN_ROLES } from "@/lib/db/auth-helpers";
import { sendNewLeadsAdminEmail } from "@/lib/email/lead-notification";

// Ingesta de leads del inbox de Idealista enviados por la extensión de Chrome.
// Público a propósito (lo llama la extensión desde idealista.com); la seguridad
// la da el token Bearer de larga duración (HMAC, ver extension-token.ts).
const ALLOWED_ORIGIN = "https://www.idealista.com";
const MAX_LEADS = 100;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

type IncomingProperty = {
  title?: unknown;
  price?: unknown;
  type?: unknown;
  imageUrl?: unknown;
  date?: unknown;
};

type IncomingLead = {
  conversationId?: unknown;
  name?: unknown;
  phone?: unknown;
  phoneCountry?: unknown;
  avatarUrl?: unknown;
  isInternational?: unknown;
  message?: unknown;
  profile?: { bullets?: unknown; presentacion?: unknown } | null;
  propertyTitle?: unknown;
  propertyPrice?: unknown;
  propertyType?: unknown;
  propertyImageUrl?: unknown;
  properties?: unknown;
  idealistaCode?: unknown;
  propertyRef?: unknown;
  messageDate?: unknown;
};

function asText(value: unknown, maxLength = 5000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

// Los contactos nacionales de idealista.com no llevan prefijo de país
// (ej. "664 36 92 01"); los internacionales sí lo traen desde la extensión
// (ej. "+39 366 400 5565"). Si no hay "+", asumimos España.
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  return `+34 ${trimmed}`;
}

function asProfile(value: IncomingLead["profile"]): { bullets: string[]; presentacion: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const bullets = Array.isArray(value.bullets)
    ? value.bullets.filter((b): b is string => typeof b === "string" && b.trim() !== "").map((b) => b.trim().slice(0, 500)).slice(0, 30)
    : [];
  const presentacion = asText(value.presentacion);
  if (bullets.length === 0 && !presentacion) return null;
  return { bullets, presentacion };
}

type NormalizedProperty = {
  title: string | null;
  price: string | null;
  type: string | null;
  imageUrl: string | null;
  date: string | null;
};

// Un mismo contacto puede preguntar por varias propiedades distintas en un
// mismo hilo del inbox — se guardan todas, no solo la primera. `date` es la
// fecha/hora en la que se preguntó por ESA propiedad en concreto (distinta
// de message_date, que es la del último mensaje del hilo completo).
function asProperties(value: unknown): NormalizedProperty[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is IncomingProperty => !!p && typeof p === "object")
    .map((p) => ({
      title: asText(p.title, 300),
      price: asText(p.price, 100),
      type: asText(p.type, 100),
      imageUrl: asText(p.imageUrl, 1000),
      date: asText(p.date, 100),
    }))
    .filter((p) => p.title || p.price || p.imageUrl)
    .slice(0, 30);
}

function propertyKey(p: NormalizedProperty): string {
  return p.title || p.imageUrl || "";
}

// Merge de detalle: unión de lo ya guardado + lo nuevo, dedup por título
// (o imagen si no hay título), preservando el orden de aparición. Una
// propiedad ya conocida NO se pisa con la nueva captura, pero sí se
// completan sus huecos (imageUrl/date/price/type en null) — la primera vez
// que se vio una propiedad puede no haber tenido foto cargada todavía
// (lazy-load) o no traer fecha, y sin este relleno esos campos se quedaban
// en null para siempre aunque una captura posterior sí los trajera.
function mergeProperties(existing: NormalizedProperty[], incoming: NormalizedProperty[]): NormalizedProperty[] {
  // Todas las existentes se preservan tal cual entran (incluida alguna rareza
  // sin título ni imagen que no se puede indexar por key — igual que antes).
  const merged: NormalizedProperty[] = existing.map((p) => ({ ...p }));
  const indexByKey = new Map<string, number>();
  merged.forEach((p, i) => {
    const key = propertyKey(p);
    if (key && !indexByKey.has(key)) indexByKey.set(key, i);
  });
  for (const p of incoming) {
    const key = propertyKey(p);
    if (!key) continue; // sin título ni imagen no hay con qué identificarla
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(p);
    } else {
      const prev = merged[idx];
      merged[idx] = {
        title: prev.title ?? p.title,
        price: prev.price ?? p.price,
        type: prev.type ?? p.type,
        imageUrl: prev.imageUrl ?? p.imageUrl,
        date: prev.date ?? p.date,
      };
    }
  }
  return merged.slice(0, 30);
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token || !verifyExtensionToken(token)) {
    return Response.json({ error: "Token inválido o expirado" }, { status: 401, headers: corsHeaders() });
  }

  let body: { source?: unknown; leads?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: corsHeaders() });
  }

  const source = body.source === "detail" ? "detail" : "list";
  if (!Array.isArray(body.leads) || body.leads.length === 0) {
    return Response.json({ error: "leads es requerido" }, { status: 400, headers: corsHeaders() });
  }
  if (body.leads.length > MAX_LEADS) {
    return Response.json({ error: `Máximo ${MAX_LEADS} leads por petición` }, { status: 400, headers: corsHeaders() });
  }

  // Normalizar entrada y descartar leads sin conversationId
  const incoming = new Map<string, NonNullable<ReturnType<typeof normalizeLead>>>();
  for (const raw of body.leads as IncomingLead[]) {
    const lead = normalizeLead(raw);
    if (lead) incoming.set(lead.conversation_id, lead);
  }
  if (incoming.size === 0) {
    return Response.json({ error: "Ningún lead con conversationId válido" }, { status: 400, headers: corsHeaders() });
  }

  const db = createAdminClient() as any;
  const conversationIds = [...incoming.keys()];

  const { data: existingRows, error: selectError } = await db
    .from("idealista_leads")
    .select("*")
    .in("conversation_id", conversationIds);
  if (selectError) {
    console.error("idealista-leads select error:", selectError);
    return Response.json(
      { error: "Error de base de datos", detail: selectError.message, code: selectError.code },
      { status: 500, headers: corsHeaders() },
    );
  }
  const existingByConversation = new Map<string, any>(
    (existingRows ?? []).map((row: any) => [row.conversation_id, row]),
  );

  // Match best-effort de propiedades. Dos vías, según lo que haya capturado
  // la extensión en el modal de detalle del anuncio:
  // 1) Ref. bc386 (referencia de agencia) contra idealista_listings.reference_code,
  //    con fallback a properties.bc_reference.
  // 2) Cod. 12345678 (id del anuncio en idealista.com) contra
  //    idealista_listings.idealista_property_id — se rellena solo al publicar
  //    el anuncio desde SmartBC, así que solo empareja fichas publicadas por
  //    nosotros mismos.
  const refs = [...new Set([...incoming.values()].map((l) => l.property_ref?.toLowerCase()).filter((r): r is string => !!r))];
  const codes = [...new Set([...incoming.values()].map((l) => l.idealista_code).filter((c): c is string => !!c))];
  const propertyIdByRef = new Map<string, string>();
  const propertyIdByCode = new Map<string, string>();
  // Igual que arriba pero contra el id de la propia ficha de Idealista, no
  // contra properties.id — la mayoría de fichas de este negocio son "inspo"
  // con reference_code (BC-xxxx) y SIN property_id, así que el match de
  // arriba nunca las puede alcanzar.
  const listingIdByRef = new Map<string, string>();
  const listingIdByCode = new Map<string, string>();
  if (refs.length > 0 || codes.length > 0) {
    const { data: listings } = await db
      .from("idealista_listings")
      .select("id, property_id, reference_code, idealista_property_id");
    for (const l of listings ?? []) {
      if (l.reference_code) {
        const code = String(l.reference_code).toLowerCase();
        if (refs.includes(code) && !listingIdByRef.has(code)) listingIdByRef.set(code, l.id);
        if (l.property_id && refs.includes(code) && !propertyIdByRef.has(code)) propertyIdByRef.set(code, l.property_id);
      }
      if (l.idealista_property_id) {
        const id = String(l.idealista_property_id);
        if (codes.includes(id) && !listingIdByCode.has(id)) listingIdByCode.set(id, l.id);
        if (l.property_id && codes.includes(id) && !propertyIdByCode.has(id)) propertyIdByCode.set(id, l.property_id);
      }
    }
    const { data: props } = await db.from("properties").select("id, bc_reference");
    for (const p of props ?? []) {
      const code = String(p.bc_reference ?? "").toLowerCase();
      if (code && refs.includes(code) && !propertyIdByRef.has(code)) propertyIdByRef.set(code, p.id);
    }
  }

  // Fallback por dirección + precio: muchos hilos de Idealista no traen ni
  // referencia ni código de anuncio (solo aparecen si se abrió el detalle).
  // Se arman dos listas de candidatas una sola vez y solo si hace falta: las
  // propiedades propias (properties) y las fichas de Idealista (idealista_
  // listings), que tienen su propia dirección/precio independientemente de
  // si están linkeadas a una fila de properties.
  const needsAddressFallback = [...incoming.values()].some(
    (l) => !l.property_ref && !l.idealista_code && l.property_title,
  );
  let addressCandidates: { id: string; street: string | null; zone: string | null; price: number | null }[] = [];
  let listingAddressCandidates: { id: string; street: string | null; zone: string | null; price: number | null }[] = [];
  if (needsAddressFallback) {
    const { data: ownProps } = await db
      .from("properties")
      .select("id, address, zone, price")
      .not("bc_reference", "is", null)
      .is("archived_at", null);
    addressCandidates = (ownProps ?? []).map((p: any) => ({
      id: p.id,
      street: p.address ?? null,
      zone: p.zone ?? null,
      price: p.price ?? null,
    }));

    const { data: ownListings } = await db
      .from("idealista_listings")
      .select("id, address_street, address_city, operation, price, total_rental_price")
      .is("archived_at", null);
    listingAddressCandidates = (ownListings ?? []).map((l: any) => ({
      id: l.id,
      street: l.address_street ?? null,
      zone: l.address_city ?? null,
      price: (l.operation === "rent" ? l.total_rental_price : l.price) ?? null,
    }));
  }

  const now = new Date().toISOString();
  const rows: any[] = [];
  const results: { conversationId: string; action: "inserted" | "updated" }[] = [];

  for (const lead of incoming.values()) {
    const existing = existingByConversation.get(lead.conversation_id);
    const isDetail = source === "detail";

    // Foto de portada: si la que ya teníamos guardada es una copia permanente
    // nuestra, se conserva tal cual (no se pisa con el hotlink que vuelva a
    // mandar la extensión). Si no, se intenta re-alojar ahora; si falla, cae
    // al hotlink de Idealista para no perder la referencia.
    const existingImageUrl: string | null = existing?.property_image_url ?? null;
    let propertyImageUrl: string | null;
    if (isPersistedLeadImage(existingImageUrl)) {
      propertyImageUrl = existingImageUrl;
    } else {
      const candidateImageUrl = lead.property_image_url ?? existingImageUrl;
      propertyImageUrl = candidateImageUrl
        ? ((await persistIdealistaLeadImage(db, lead.conversation_id, "cover", candidateImageUrl))?.url ??
          candidateImageUrl)
        : null;
    }

    // Mismo criterio que la portada para cada propiedad del hilo: se
    // recorren TODAS las del merge (no solo las nuevas), porque
    // mergeProperties ahora puede rellenar el imageUrl de una propiedad ya
    // conocida que antes no lo tenía (ver comentario ahí) — ese hotlink
    // recién completado también hay que re-alojarlo. Para las que ya son
    // una copia permanente nuestra, isPersistedLeadImage la salta gratis.
    const existingProperties = (existing?.properties as NormalizedProperty[]) ?? [];
    const mergedProperties = mergeProperties(existingProperties, lead.properties);
    for (let i = 0; i < mergedProperties.length; i++) {
      const p = mergedProperties[i];
      if (p.imageUrl && !isPersistedLeadImage(p.imageUrl)) {
        const persisted = await persistIdealistaLeadImage(db, lead.conversation_id, `p${i}`, p.imageUrl);
        if (persisted) p.imageUrl = persisted.url;
      }
    }

    // Merge: la captura de lista solo rellena huecos y nunca pisa el detalle;
    // la captura de detalle sobreescribe mensaje/perfil y marca detail_captured.
    const merged: Record<string, unknown> = {
      conversation_id: lead.conversation_id,
      name: lead.name ?? existing?.name ?? "",
      phone: lead.phone ?? existing?.phone ?? null,
      phone_country: lead.phone_country ?? existing?.phone_country ?? null,
      avatar_url: lead.avatar_url ?? existing?.avatar_url ?? null,
      is_international: lead.is_international ?? existing?.is_international ?? false,
      property_title: lead.property_title ?? existing?.property_title ?? null,
      property_price: lead.property_price ?? existing?.property_price ?? null,
      property_type: lead.property_type ?? existing?.property_type ?? null,
      property_image_url: propertyImageUrl,
      // Unión: el mismo contacto puede preguntar por varias propiedades a lo
      // largo del hilo (ver mergeProperties), nunca se pisa lo ya guardado.
      properties: mergedProperties,
      message_date: lead.message_date ?? existing?.message_date ?? null,
      updated_at: now,
    };

    if (isDetail) {
      merged.message = lead.message ?? existing?.message ?? null;
      merged.profile = lead.profile ?? existing?.profile ?? null;
      merged.idealista_code = lead.idealista_code ?? existing?.idealista_code ?? null;
      merged.property_ref = lead.property_ref ?? existing?.property_ref ?? null;
      merged.detail_captured = true;
      merged.source_page = "detail";
    } else {
      const detailCaptured = !!existing?.detail_captured;
      merged.message = detailCaptured ? existing.message : (existing?.message ?? lead.message ?? null);
      merged.profile = detailCaptured ? existing.profile : (existing?.profile ?? lead.profile ?? null);
      merged.idealista_code = existing?.idealista_code ?? lead.idealista_code ?? null;
      merged.property_ref = existing?.property_ref ?? lead.property_ref ?? null;
      merged.detail_captured = detailCaptured;
      merged.source_page = existing?.source_page ?? "list";
    }

    // Campos gestionados por el admin: nunca se tocan desde la ingesta
    merged.status = existing?.status ?? "nuevo";
    merged.lead_type = existing?.lead_type ?? null;
    merged.country = existing?.country ?? "es";
    if (existing?.created_at) merged.created_at = existing.created_at;

    // Sugerencia de tipo: solo mientras el admin no haya confirmado un tipo
    if (!merged.lead_type) {
      const profile = merged.profile as { bullets?: string[]; presentacion?: string | null } | null;
      const suggestion = suggestLeadType([
        merged.name as string,
        merged.message as string | null,
        profile?.presentacion,
        ...(profile?.bullets ?? []),
      ]);
      merged.suggested_type = suggestion.type;
      merged.suggestion_keywords = suggestion.keywords;
    } else {
      merged.suggested_type = existing?.suggested_type ?? null;
      merged.suggestion_keywords = existing?.suggestion_keywords ?? [];
    }

    // Match de propiedad (solo si aún no hay match): primero por referencia
    // de agencia, luego por código de anuncio de idealista.com, y si tampoco
    // hay eso (lo más común: la mayoría de hilos no traen ni ref ni código),
    // por dirección + precio del propio inbox.
    const ref = (merged.property_ref as string | null)?.toLowerCase();
    const code = merged.idealista_code as string | null;
    merged.matched_property_id =
      existing?.matched_property_id ??
      (ref ? propertyIdByRef.get(ref) : undefined) ??
      (code ? propertyIdByCode.get(code) : undefined) ??
      matchPropertyByAddress(
        merged.property_title as string | null,
        merged.property_price as string | null,
        addressCandidates,
      );

    // Igual pero contra la ficha de Idealista directamente (ver comentario
    // más arriba): cubre las fichas "inspo" sin property_id, que son la
    // mayoría de lo que hay preparado hoy.
    merged.matched_listing_id =
      existing?.matched_listing_id ??
      (ref ? listingIdByRef.get(ref) : undefined) ??
      (code ? listingIdByCode.get(code) : undefined) ??
      matchPropertyByAddress(
        merged.property_title as string | null,
        merged.property_price as string | null,
        listingAddressCandidates,
      );

    rows.push(merged);
    results.push({ conversationId: lead.conversation_id, action: existing ? "updated" : "inserted" });
  }

  const { error: upsertError } = await db.from("idealista_leads").upsert(rows, { onConflict: "conversation_id" });
  if (upsertError) {
    console.error("idealista-leads upsert error:", upsertError);
    return Response.json(
      { error: "Error guardando leads", detail: upsertError.message, code: upsertError.code },
      { status: 500, headers: corsHeaders() },
    );
  }

  // Unificación automática de la misma persona (escribió y además llamó:
  // Idealista da otro conversation_id a la llamada). Acotada a los teléfonos
  // de ESTA tanda, no a la tabla entera. Best-effort: si falla, la ingesta
  // responde OK igual y simplemente quedan los dos leads a la vista, que es
  // como estaba antes. Ver lib/sales-inbox/merge.ts para la regla y la
  // segunda revisión por nombre que puede bloquearla.
  let mergeSummary: { merged: number; blocked: number } = { merged: 0, blocked: 0 };
  try {
    const phones = rows
      .map((r) => (typeof r.phone === "string" ? r.phone : null))
      .filter((p): p is string => !!p);
    mergeSummary = await autoMergeLeadsByPhone(phones);
  } catch (err) {
    console.error("idealista-leads auto-merge error:", err);
  }

  // Aviso a los admins: un único correo por tanda cuando entran clientes
  // NUEVOS (no actualizaciones de leads ya conocidos) — "Capturar todas"
  // puede traer decenas de golpe, así que se agrupan en un solo digest en
  // vez de mandar un correo por lead. Best-effort, mismo patrón que el
  // auto-merge de arriba: si falla, la ingesta responde OK igual.
  try {
    const insertedIds = new Set(
      results.filter((r) => r.action === "inserted").map((r) => r.conversationId),
    );
    if (insertedIds.size > 0) {
      const newLeads = rows
        .filter((r) => insertedIds.has(r.conversation_id))
        .map((r) => ({
          name: (r.name as string | null) || null,
          propertyTitle: (r.property_title as string | null) ?? null,
          propertyPrice: (r.property_price as string | null) ?? null,
          phone: (r.phone as string | null) ?? null,
        }));
      const { data: admins } = await db
        .from("profiles")
        .select("email")
        .in("role", ADMIN_ROLES)
        .not("email", "is", null);
      const adminEmails: string[] = [];
      for (const a of admins ?? []) {
        const email = (a as any).email as string | null;
        if (email && !adminEmails.includes(email)) adminEmails.push(email);
      }
      const emailResults = await Promise.all(
        adminEmails.map((email) => sendNewLeadsAdminEmail({ to: email, leads: newLeads, country: "es" })),
      );
      emailResults.forEach((r, i) => {
        if (!r.success) console.error("idealista-leads admin notify error:", adminEmails[i], r.error);
      });
    }
  } catch (err) {
    console.error("idealista-leads admin notify error:", err);
  }

  return Response.json(
    {
      ok: true,
      inserted: results.filter((r) => r.action === "inserted").length,
      updated: results.filter((r) => r.action === "updated").length,
      // Para que la extensión pueda decir "2 unificados" y, sobre todo, para
      // que quede rastro en los logs de qué se fusionó y qué se bloqueó.
      mergedLeads: mergeSummary.merged,
      mergeBlocked: mergeSummary.blocked,
      results,
    },
    { headers: corsHeaders() },
  );
}

function normalizeLead(raw: IncomingLead) {
  // Las conversaciones usan el id numérico; las llamadas perdidas del inbox
  // llegan como "call_<id>" para no colisionar con una conversación del
  // mismo número.
  const conversationId = asText(raw.conversationId);
  if (!conversationId || !/^(call_)?\d+$/.test(conversationId)) return null;
  return {
    conversation_id: conversationId,
    name: asText(raw.name),
    phone: normalizePhone(asText(raw.phone)),
    phone_country: asText(raw.phoneCountry)?.slice(0, 8) ?? null,
    avatar_url: asText(raw.avatarUrl, 1000),
    is_international: typeof raw.isInternational === "boolean" ? raw.isInternational : null,
    message: asText(raw.message, 50000),
    profile: asProfile(raw.profile ?? null),
    property_title: asText(raw.propertyTitle, 300),
    property_price: asText(raw.propertyPrice, 100),
    property_type: asText(raw.propertyType, 100),
    property_image_url: asText(raw.propertyImageUrl, 1000),
    properties: asProperties(raw.properties),
    idealista_code: asText(raw.idealistaCode),
    property_ref: asText(raw.propertyRef),
    message_date: asText(raw.messageDate),
  };
}
