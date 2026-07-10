import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { verifyExtensionToken } from "@/lib/services/idealista/extension-token";
import { suggestLeadType } from "@/lib/services/idealista/lead-classifier";

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

type IncomingLead = {
  conversationId?: unknown;
  name?: unknown;
  phone?: unknown;
  phoneCountry?: unknown;
  isInternational?: unknown;
  message?: unknown;
  profile?: { bullets?: unknown; presentacion?: unknown } | null;
  propertyTitle?: unknown;
  propertyPrice?: unknown;
  propertyType?: unknown;
  idealistaCode?: unknown;
  propertyRef?: unknown;
  messageDate?: unknown;
};

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 5000) : null;
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
    return Response.json({ error: "Error de base de datos" }, { status: 500, headers: corsHeaders() });
  }
  const existingByConversation = new Map<string, any>(
    (existingRows ?? []).map((row: any) => [row.conversation_id, row]),
  );

  // Match best-effort de propiedades por la referencia de agencia (Ref. bc386):
  // primero contra idealista_listings.reference_code (la ref con la que se
  // publicó el anuncio), con fallback a properties.bc_reference.
  const refs = [...new Set([...incoming.values()].map((l) => l.property_ref?.toLowerCase()).filter((r): r is string => !!r))];
  const propertyIdByRef = new Map<string, string>();
  if (refs.length > 0) {
    const { data: listings } = await db
      .from("idealista_listings")
      .select("property_id, reference_code")
      .not("property_id", "is", null)
      .not("reference_code", "is", null);
    for (const l of listings ?? []) {
      const code = String(l.reference_code).toLowerCase();
      if (refs.includes(code) && !propertyIdByRef.has(code)) propertyIdByRef.set(code, l.property_id);
    }
    const { data: props } = await db.from("properties").select("id, bc_reference");
    for (const p of props ?? []) {
      const code = String(p.bc_reference ?? "").toLowerCase();
      if (code && refs.includes(code) && !propertyIdByRef.has(code)) propertyIdByRef.set(code, p.id);
    }
  }

  const now = new Date().toISOString();
  const rows: any[] = [];
  const results: { conversationId: string; action: "inserted" | "updated" }[] = [];

  for (const lead of incoming.values()) {
    const existing = existingByConversation.get(lead.conversation_id);
    const isDetail = source === "detail";

    // Merge: la captura de lista solo rellena huecos y nunca pisa el detalle;
    // la captura de detalle sobreescribe mensaje/perfil y marca detail_captured.
    const merged: Record<string, unknown> = {
      conversation_id: lead.conversation_id,
      name: lead.name ?? existing?.name ?? "",
      phone: lead.phone ?? existing?.phone ?? null,
      phone_country: lead.phone_country ?? existing?.phone_country ?? null,
      is_international: lead.is_international ?? existing?.is_international ?? false,
      property_title: lead.property_title ?? existing?.property_title ?? null,
      property_price: lead.property_price ?? existing?.property_price ?? null,
      property_type: lead.property_type ?? existing?.property_type ?? null,
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

    // Match de propiedad (solo si aún no hay match)
    const ref = (merged.property_ref as string | null)?.toLowerCase();
    merged.matched_property_id = existing?.matched_property_id ?? (ref ? propertyIdByRef.get(ref) ?? null : null);

    rows.push(merged);
    results.push({ conversationId: lead.conversation_id, action: existing ? "updated" : "inserted" });
  }

  const { error: upsertError } = await db.from("idealista_leads").upsert(rows, { onConflict: "conversation_id" });
  if (upsertError) {
    console.error("idealista-leads upsert error:", upsertError);
    return Response.json({ error: "Error guardando leads" }, { status: 500, headers: corsHeaders() });
  }

  return Response.json(
    {
      ok: true,
      inserted: results.filter((r) => r.action === "inserted").length,
      updated: results.filter((r) => r.action === "updated").length,
      results,
    },
    { headers: corsHeaders() },
  );
}

function normalizeLead(raw: IncomingLead) {
  const conversationId = asText(raw.conversationId);
  if (!conversationId || !/^\d+$/.test(conversationId)) return null;
  return {
    conversation_id: conversationId,
    name: asText(raw.name),
    phone: asText(raw.phone),
    phone_country: asText(raw.phoneCountry)?.slice(0, 8) ?? null,
    is_international: typeof raw.isInternational === "boolean" ? raw.isInternational : null,
    message: asText(raw.message),
    profile: asProfile(raw.profile ?? null),
    property_title: asText(raw.propertyTitle),
    property_price: asText(raw.propertyPrice),
    property_type: asText(raw.propertyType),
    idealista_code: asText(raw.idealistaCode),
    property_ref: asText(raw.propertyRef),
    message_date: asText(raw.messageDate),
  };
}
