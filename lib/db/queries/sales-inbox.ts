import "server-only";

// ============================================================================
// SALES INBOX · lectura
//
// Todo ocurre EN SERVIDOR: paginación, filtros, búsqueda y orden. La pantalla
// anterior se traía 500 leads enteros al navegador (357 KB) y filtraba allí,
// con un techo silencioso que a 50 leads/semana se alcanzaba en dos meses.
//
// La fuente es la vista `lead_inbox_facts` (migración 0142), que ya trae el
// estado comercial derivado de hechos: así se puede filtrar por "nuevos" sin
// descargar la base entera.
//
// ⚠️ ALCANCE. Antes los leads se leían con el cliente de servicio y SIN filtro:
// todo el mundo veía los 322, daba igual su scope. Ahora se aplica
// `resolveViewScope("solicitudes")` — 'own'/'team' ven los suyos y los que no
// tienen dueño (la cola sin asignar es de todos, o nadie la trabajaría).
// ============================================================================

import { createAdminClient } from "../admin";
import { resolveViewScope } from "./view-scope";
import { checkPermission } from "@/lib/auth/guard";
import {
  attentionScore,
  deriveAttention,
  deriveCommercialState,
  deriveFollowUpState,
  deriveLastActivityAt,
  needsAttention,
  type FollowUpState,
  type LeadFacts,
} from "@/lib/sales-inbox/derive";
import {
  GROUP_PAGE_SIZE,
  type CommercialState,
  type LeadGroup,
  type LeadOperation,
  type InboxCounts,
  type InboxFilters,
  type LeadListItem,
} from "@/lib/sales-inbox/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

const VIEW = "lead_inbox_facts";

/** Columnas de la vista que necesita una FILA de la lista. Nada más: el
 *  mensaje completo y el resto del detalle solo se piden al abrir el lead. */
const LIST_COLUMNS = [
  "id",
  "name",
  "phone",
  "is_international",
  "property_title",
  "matched_property_id",
  // Un lead puede estar emparejado a una ficha de Idealista SIN fila en
  // `properties` (las "inspo", que son la mayoría de esta cartera). Sin esta
  // columna la bandeja los enseñaba a todos como "sin ficha" aunque estuvieran
  // perfectamente emparejados — y /admin/idealista sí los contaba.
  "matched_listing_id",
  "assigned_to",
  "client_id",
  "next_action_at",
  "created_at",
  "legacy_status",
  "lead_type",
  "wa_conversation_id",
  "wa_outbound",
  "wa_inbound",
  "wa_first_outbound_at",
  "wa_last_message_at",
  "wa_awaiting_reply",
  "activity_last_at",
  "activity_has_touch",
  "activity_answered_call",
  "duplicate_phone",
  "last_activity_at",
  "commercial_state",
  "avatar_url",
  "lead_operation",
].join(", ");

export type InboxScope = {
  restriction: "own_only" | "team" | "all" | "assigned_only" | "none";
  userId: string | null;
};

/** Traduce la fila de la vista al retrato que consumen las derivaciones. */
function factsOf(r: any): LeadFacts {
  return {
    createdAt: r.created_at,
    legacyStatus: r.legacy_status ?? null,
    assignedTo: r.assigned_to ?? null,
    clientId: r.client_id ?? null,
    nextActionAt: r.next_action_at ?? null,
    matchedPropertyId: r.matched_property_id ?? null,
    matchedListingId: r.matched_listing_id ?? null,
    name: r.name ?? null,
    phone: r.phone ?? null,
    whatsapp: {
      conversationId: r.wa_conversation_id ?? null,
      outbound: Number(r.wa_outbound ?? 0),
      inbound: Number(r.wa_inbound ?? 0),
      firstOutboundAt: r.wa_first_outbound_at ?? null,
      lastMessageAt: r.wa_last_message_at ?? null,
      awaitingReply: Boolean(r.wa_awaiting_reply),
    },
    // La lista no baja el historial entero; para derivar basta con saber SI
    // hubo contacto registrado y si alguna llamada se cogió, que la vista ya
    // resume. El detalle completo se pide al abrir el lead.
    activity: [
      ...(r.activity_has_touch
        ? [{ kind: "call", outcome: null, createdAt: r.activity_last_at }]
        : []),
      ...(r.activity_answered_call
        ? [{ kind: "call", outcome: "answered", createdAt: r.activity_last_at }]
        : []),
    ],
    duplicatePhone: Boolean(r.duplicate_phone),
    clientCandidate: false, // se resuelve al abrir el lead, no por fila
  };
}

function toListItem(r: any, now: Date, staffNames: Map<string, string>): LeadListItem {
  const facts = factsOf(r);
  const reasons = deriveAttention(facts, now);
  return {
    id: r.id,
    name: r.name ?? null,
    phone: r.phone ?? null,
    isInternational: Boolean(r.is_international),
    source: "idealista",
    createdAt: r.created_at,
    propertyTitle: r.property_title ?? null,
    matchedPropertyId: r.matched_property_id ?? null,
    matchedListingId: r.matched_listing_id ?? null,
    assignedTo: r.assigned_to ?? null,
    assignedName: r.assigned_to ? (staffNames.get(r.assigned_to) ?? null) : null,
    clientId: r.client_id ?? null,
    nextActionAt: r.next_action_at ?? null,
    state: deriveCommercialState(facts),
    operation: (r.lead_operation as LeadOperation | null) ?? null,
    whatsapp: facts.whatsapp,
    reasons,
    score: attentionScore(reasons, r.created_at, now),
    lastActivityAt: deriveLastActivityAt(facts) ?? r.last_activity_at ?? null,
    avatarUrl: r.avatar_url ?? null,
  };
}

/**
 * Aplica el alcance por cartera. La cola SIN ASIGNAR queda visible para todos
 * a propósito: si solo la viera quien ya la tiene asignada, no la trabajaría
 * nadie.
 */
function applyScope(q: any, scope: InboxScope) {
  if (scope.restriction === "all") return q;
  if (!scope.userId) return q;
  return q.or(`assigned_to.eq.${scope.userId},assigned_to.is.null`);
}

/** Filtros que SÍ se pueden expresar en SQL. Los de atención van aparte. */
function applyFilters(q: any, f: InboxFilters, userId: string | null) {
  if (f.state) q = q.eq("commercial_state", f.state);
  if (f.leadType) q = q.eq("lead_type", f.leadType);
  if (f.international !== undefined) q = q.eq("is_international", f.international);
  // "Sin ficha" significa sin NINGUNA de las dos: ni propiedad nuestra ni
  // anuncio de Idealista. Antes solo miraba la primera y metía en la cola a
  // leads que sí estaban emparejados.
  if (f.unmatchedProperty) {
    q = q.is("matched_property_id", null).is("matched_listing_id", null);
  }

  // Venta / alquiler. `eq` NO: dejaría fuera los 'mixed' —hilos que preguntan
  // por las dos cosas— sin avisar de nada. Y "sin determinar" es una elección
  // explícita, no el residuo de las otras dos.
  if (f.operation === "unknown") q = q.is("lead_operation", null);
  else if (f.operation === "sale") q = q.in("lead_operation", ["sale", "mixed"]);
  else if (f.operation === "rent") q = q.in("lead_operation", ["rent", "mixed"]);

  if (f.assignedTo === "me" && userId) q = q.eq("assigned_to", userId);
  else if (f.assignedTo === "none") q = q.is("assigned_to", null);
  else if (f.assignedTo) q = q.eq("assigned_to", f.assignedTo);

  switch (f.view) {
    case "new":
      q = q.eq("commercial_state", "new");
      break;
    case "follow-up":
      q = q.not("next_action_at", "is", null);
      break;
    case "my-leads":
      if (userId) q = q.eq("assigned_to", userId);
      break;
    case "unassigned":
      q = q.is("assigned_to", null);
      break;
    default:
      break;
  }

  const term = f.search?.trim();
  if (term) {
    // Los teléfonos se guardan como los escribe la gente ("+34 612 34 56 78"),
    // así que buscar "612345678" no encontraba nada. `phone_digits` (columna
    // generada) resuelve el caso sin pedirle al agente que teclee espacios.
    const digits = term.replace(/\D/g, "");
    const like = `%${term.replace(/[%,]/g, " ")}%`;
    const clauses = [
      `name.ilike.${like}`,
      `property_title.ilike.${like}`,
      `message.ilike.${like}`,
      `idealista_conversation_id.ilike.${like}`,
    ];
    if (digits.length >= 3) clauses.push(`phone_digits.ilike.%${digits}%`);
    q = q.or(clauses.join(","));
  }

  return q;
}

function applySort(q: any, f: InboxFilters) {
  switch (f.sort) {
    case "oldest":
      return q.order("created_at", { ascending: true });
    case "activity":
      return q.order("last_activity_at", { ascending: false, nullsFirst: false });
    case "due":
      return q.order("next_action_at", { ascending: true, nullsFirst: false });
    case "newest":
    default:
      return q.order("created_at", { ascending: false });
  }
}

export type InboxPage = {
  items: LeadListItem[];
  /** Agrupando por propiedad: los pisos de esta página, con sus consultas. */
  groups: LeadGroup[];
  total: number;
  page: number;
  pageSize: number;
  /** true si la vista se ordena/filtra por atención (paginación aproximada). */
  attentionMode: boolean;
};

/** Techo del modo agrupado y del de atención. Ver la nota de `getInboxPage`. */
const SCAN_LIMIT = 2000;

/**
 * Una página de la bandeja.
 *
 * Dos regímenes:
 *
 *  · **Vistas normales** — el filtro y el orden se resuelven íntegros en SQL y
 *    la paginación es exacta.
 *
 *  · **"Necesitan atención"** — la regla combina cinco señales, dos de ellas
 *    con ventana temporal. Expresarla entera en SQL la volvería ilegible, que
 *    es justo lo que el sprint pide evitar. Se acota primero en SQL a lo que
 *    PUEDE necesitar atención (nada cerrado, y con techo duro), y se ordena y
 *    pagina en memoria sobre ese conjunto. Con 322 leads son ~300 filas
 *    ligeras; el techo de 2.000 lo mantiene acotado a escala.
 */
export async function getInboxPage(filters: InboxFilters): Promise<InboxPage> {
  const gate = await checkPermission("solicitudes", "view");
  if (!gate.ok) {
    return { items: [], groups: [], total: 0, page: 1, pageSize: filters.pageSize, attentionMode: false };
  }

  const scopeRaw = await resolveViewScope("solicitudes");
  const scope: InboxScope = {
    restriction: scopeRaw.restriction as InboxScope["restriction"],
    userId: scopeRaw.userId,
  };
  if (scope.restriction === "none") {
    return { items: [], groups: [], total: 0, page: 1, pageSize: filters.pageSize, attentionMode: false };
  }

  const now = new Date();
  const staffNames = await getStaffNames();
  const attentionMode =
    filters.view === "needs-attention" || filters.sort === "attention";

  // Agrupar por piso recorre el mismo conjunto acotado que el modo atención.
  if (filters.grouping === "property") {
    return groupByProperty(filters, scope, now, staffNames);
  }

  if (!attentionMode) {
    let q = db().from(VIEW).select(LIST_COLUMNS, { count: "exact" });
    q = applyScope(q, scope);
    q = applyFilters(q, filters, scope.userId);
    q = applySort(q, filters);

    const from = (filters.page - 1) * filters.pageSize;
    const { data, count, error } = await q.range(from, from + filters.pageSize - 1);
    if (error) {
      console.error("[getInboxPage]", error.message);
      return { items: [], groups: [], total: 0, page: filters.page, pageSize: filters.pageSize, attentionMode };
    }
    return {
      items: (data ?? []).map((r: any) => toListItem(r, now, staffNames)),
      groups: [],
      total: count ?? 0,
      page: filters.page,
      pageSize: filters.pageSize,
      attentionMode,
    };
  }

  // ── Modo atención ──
  let q = db()
    .from(VIEW)
    .select(LIST_COLUMNS)
    .not("commercial_state", "in", "(converted,discarded)");
  q = applyScope(q, scope);
  q = applyFilters(q, { ...filters, view: "all" }, scope.userId);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) {
    console.error("[getInboxPage attention]", error.message);
    return { items: [], groups: [], total: 0, page: filters.page, pageSize: filters.pageSize, attentionMode };
  }

  const all = (data ?? [])
    .map((r: any) => toListItem(r, now, staffNames))
    .filter((x: LeadListItem) =>
      filters.view === "needs-attention" ? needsAttention(x.reasons) : true,
    )
    .sort((a: LeadListItem, b: LeadListItem) => b.score - a.score);

  const from = (filters.page - 1) * filters.pageSize;
  return {
    items: all.slice(from, from + filters.pageSize),
    groups: [],
    total: all.length,
    page: filters.page,
    pageSize: filters.pageSize,
    attentionMode,
  };
}

/**
 * La bandeja agrupada por piso.
 *
 * En producción, 332 consultas se reparten en 27 propiedades y una sola
 * concentra 61: agrupar convierte una lista interminable en una lista de pisos
 * con su demanda debajo.
 *
 * Los grupos se ordenan por la consulta MÁS RECIENTE, así que el piso que está
 * tirando ahora sube solo — igual que un hilo de correo al que acaban de
 * contestar.
 *
 * ⚠️ Se agrupa en memoria sobre un conjunto acotado (`SCAN_LIMIT`). Con 332
 * leads es exacto; por encima habría que llevar la agregación a SQL. El techo
 * está anotado a propósito para que no pase inadvertido.
 */
async function groupByProperty(
  filters: InboxFilters,
  scope: InboxScope,
  now: Date,
  staffNames: Map<string, string>,
): Promise<InboxPage> {
  let q = db().from(VIEW).select(LIST_COLUMNS + ", property_image_url");
  q = applyScope(q, scope);
  q = applyFilters(q, filters, scope.userId);
  if (filters.view === "needs-attention") {
    q = q.not("commercial_state", "in", "(converted,discarded)");
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) {
    console.error("[groupByProperty]", error.message);
    return { items: [], groups: [], total: 0, page: filters.page, pageSize: GROUP_PAGE_SIZE, attentionMode: false };
  }

  const rows = (data ?? []) as any[];
  const byKey = new Map<string, LeadGroup>();

  for (const r of rows) {
    const item = toListItem(r, now, staffNames);
    if (filters.view === "needs-attention" && !needsAttention(item.reasons)) continue;

    // Ficha propia primero; si no, el ANUNCIO de Idealista (las "inspo", que
    // en esta cartera son la mayoría y antes caían aquí sin agrupar); y solo
    // como último recurso el título del anuncio, que es lo único que queda
    // cuando el lead no está emparejado con nada.
    const title = (r.property_title ?? "").trim();
    const key = r.matched_property_id
      ? `p:${r.matched_property_id}`
      : r.matched_listing_id
        ? `l:${r.matched_listing_id}`
        : title
          ? `t:${title.toLowerCase()}`
          : "t:";

    const g = byKey.get(key);
    if (g) {
      g.leads.push(item);
      g.count += 1;
      if (item.state === "new") g.newCount += 1;
      if (needsAttention(item.reasons)) g.attentionCount += 1;
      if (new Date(item.createdAt) > new Date(g.lastLeadAt)) g.lastLeadAt = item.createdAt;
    } else {
      byKey.set(key, {
        key,
        propertyId: r.matched_property_id ?? null,
        listingId: r.matched_listing_id ?? null,
        slug: null,
        title: title || null,
        zone: null,
        reference: null,
        price: null,
        operation: null,
        status: null,
        // La foto del anuncio de Idealista, ya realojada en nuestro bucket por
        // la ingesta. Si la ficha tiene portada propia, la pisa más abajo.
        coverUrl: r.property_image_url ?? null,
        leads: [item],
        count: 1,
        lastLeadAt: item.createdAt,
        newCount: item.state === "new" ? 1 : 0,
        attentionCount: needsAttention(item.reasons) ? 1 : 0,
      });
    }
  }

  const ordered = [...byKey.values()].sort(
    (a, b) => new Date(b.lastLeadAt).getTime() - new Date(a.lastLeadAt).getTime(),
  );

  const from = (filters.page - 1) * GROUP_PAGE_SIZE;
  const page = ordered.slice(from, from + GROUP_PAGE_SIZE);

  // Solo se piden los datos de las fichas VISIBLES: sin esto sería un N+1
  // sobre todas las propiedades del listado. Dos consultas porque hay dos
  // procedencias posibles, no porque haya dos modelos.
  const propertyIds = page.map((g) => g.propertyId).filter((x): x is string => Boolean(x));
  const listingIds = page
    .filter((g) => !g.propertyId)
    .map((g) => g.listingId)
    .filter((x): x is string => Boolean(x));

  if (propertyIds.length) {
    const { data: props } = await db()
      .from("properties")
      .select("id, slug, title, zone, property_reference, price, operation, status, cover_photo_url")
      .in("id", propertyIds);
    const map = new Map<string, any>((props ?? []).map((p: any) => [p.id, p]));
    for (const g of page) {
      const p = g.propertyId ? map.get(g.propertyId) : null;
      if (!p) continue;
      g.slug = p.slug ?? null;
      g.title = p.title ?? g.title;
      g.zone = p.zone ?? null;
      g.reference = p.property_reference ?? null;
      g.price = p.price === null ? null : Number(p.price);
      g.operation = p.operation ?? null;
      g.status = p.status ?? null;
      // Si la ficha no tiene portada se conserva la del anuncio, que ya se
      // puso al construir el grupo.
      g.coverUrl = p.cover_photo_url ?? g.coverUrl;
    }
  }

  if (listingIds.length) {
    const { data: listings } = await db()
      .from("idealista_listings")
      .select("id, reference_code, inspo_title, address_street, address_city, operation, price, total_rental_price")
      .in("id", listingIds);
    const map = new Map<string, any>((listings ?? []).map((l: any) => [l.id, l]));
    for (const g of page) {
      const l = g.listingId && !g.propertyId ? map.get(g.listingId) : null;
      if (!l) continue;
      g.title = l.inspo_title ?? l.address_street ?? g.title;
      g.zone = l.address_city ?? null;
      g.reference = l.reference_code ?? null;
      // El precio que vale es el de SU operación: en una ficha de alquiler,
      // `price` está a 0 por construcción (ver inspo-mapper).
      const raw = l.operation === "rent" ? l.total_rental_price : l.price;
      g.price = raw === null || raw === undefined ? null : Number(raw);
      g.operation = l.operation ?? null;
      // `idealista_state` (draft/published) NO es un estado de propiedad: no se
      // mete aquí para no inventar una traducción que significa otra cosa.
      g.status = null;
    }
  }

  // Dentro de cada piso, lo más reciente arriba.
  for (const g of page) {
    g.leads.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  return {
    items: page.flatMap((g) => g.leads),
    groups: page,
    total: ordered.length,
    page: filters.page,
    pageSize: GROUP_PAGE_SIZE,
    attentionMode: false,
  };
}

/**
 * Las cifras del encabezado. Cinco `count` con `head: true`: no traen filas,
 * solo el número, así que salen baratas.
 */
export async function getInboxCounts(): Promise<InboxCounts> {
  const gate = await checkPermission("solicitudes", "view");
  if (!gate.ok) {
    return { needsAttention: 0, new: 0, followUp: 0, myLeads: 0, unassigned: 0, all: 0 };
  }
  const scopeRaw = await resolveViewScope("solicitudes");
  const scope: InboxScope = {
    restriction: scopeRaw.restriction as InboxScope["restriction"],
    userId: scopeRaw.userId,
  };

  const base = () => applyScope(db().from(VIEW).select("id", { count: "exact", head: true }), scope);

  const [newCount, followUp, myLeads, unassigned, all] = await Promise.all([
    base().eq("commercial_state", "new"),
    base().not("next_action_at", "is", null),
    scope.userId ? base().eq("assigned_to", scope.userId) : Promise.resolve({ count: 0 }),
    base().is("assigned_to", null),
    base(),
  ]);

  // "Necesitan atención" no se puede contar en SQL sin reescribir la regla
  // entera; se cuenta sobre el mismo conjunto acotado que usa la vista.
  const attention = await getInboxPage({
    view: "needs-attention",
    grouping: "none",
    page: 1,
    pageSize: 1,
    sort: "attention",
  });

  return {
    needsAttention: attention.total,
    new: (newCount as any).count ?? 0,
    followUp: (followUp as any).count ?? 0,
    myLeads: (myLeads as any).count ?? 0,
    unassigned: (unassigned as any).count ?? 0,
    all: (all as any).count ?? 0,
  };
}

// ─── Nombres del equipo ──────────────────────────────────────────────────────

let staffCache: { at: number; names: Map<string, string> } | null = null;

/** Resolver los nombres de una vez evita un N+1 por fila de la lista. */
async function getStaffNames(): Promise<Map<string, string>> {
  if (staffCache && Date.now() - staffCache.at < 60_000) return staffCache.names;
  const names = new Map<string, string>();
  try {
    const { data } = await db()
      .from("profiles")
      .select("id, full_name, email")
      .neq("role", "client");
    for (const p of data ?? []) {
      names.set(p.id, p.full_name || p.email || "—");
    }
  } catch {
    /* sin nombres, la lista enseña "asignado" sin decir a quién */
  }
  staffCache = { at: Date.now(), names };
  return names;
}

// ─── Detalle de un lead ──────────────────────────────────────────────────────

export type LeadActivityEntry = {
  id: string;
  kind: string;
  outcome: string | null;
  body: string | null;
  authorName: string | null;
  createdAt: string;
};

export type LeadPropertyContext = {
  /**
   * De dónde sale la ficha. `listing` es un anuncio de Idealista SIN fila en
   * `properties` (las "inspo"): existe, tiene referencia y precio, y hasta
   * ahora la bandeja lo enseñaba como "todavía no es ficha nuestra".
   */
  source: "property" | "listing";
  id: string;
  /** Solo las fichas propias tienen slug; la ruta del panel va por slug. */
  slug: string | null;
  title: string | null;
  reference: string | null;
  price: number | null;
  operation: string | null;
  status: string | null;
  zone: string | null;
  coverUrl: string | null;
};

export type LeadClientRef = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
};

export type LeadDetail = {
  id: string;
  name: string | null;
  phone: string | null;
  isInternational: boolean;
  message: string | null;
  profileBullets: string[];
  profilePresentation: string | null;
  propertyTitle: string | null;
  propertyPrice: string | null;
  propertyImageUrl: string | null;
  properties: Array<{ title: string | null; price: string | null; imageUrl: string | null }>;
  idealistaThreadUrl: string;
  leadType: string | null;
  suggestedType: string | null;
  createdAt: string;
  assignedTo: string | null;
  assignedName: string | null;
  clientId: string | null;
  convertedAt: string | null;
  nextActionAt: string | null;
  nextActionNote: string | null;
  /** Vencido / hoy / más adelante. Se calcula aquí para que el navegador no
   *  tenga que comparar relojes al hidratar. */
  followUp: FollowUpState;
  state: CommercialState;
  reasons: ReturnType<typeof deriveAttention>;
  whatsapp: LeadListItem["whatsapp"];
  activity: LeadActivityEntry[];
  property: LeadPropertyContext | null;
  linkedClient: LeadClientRef | null;
  /** Otros leads de la misma persona (mismo teléfono). */
  duplicates: Array<{ id: string; createdAt: string; propertyTitle: string | null }>;
  /** Foto de perfil del contacto en Idealista (`idealista_leads.avatar_url`,
   *  migración 0083; la expone la vista desde la 0159). NULL = sin foto. */
  avatarUrl: string | null;
};

/** El hilo de Idealista de una conversación. Las llamadas perdidas usan CALL_. */
function idealistaThreadUrl(conversationId: string): string {
  return conversationId.startsWith("call_")
    ? `https://www.idealista.com/inbox/CALL_${conversationId.slice(5)}`
    : `https://www.idealista.com/inbox/CONVERSATION_${conversationId}`;
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  const gate = await checkPermission("solicitudes", "view");
  if (!gate.ok) return null;

  const { data: row } = await db()
    .from(VIEW)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  // El alcance también protege el DETALLE: sin esto, una URL directa saltaría
  // la cartera aunque la lista sí la respete.
  const scopeRaw = await resolveViewScope("solicitudes");
  if (
    scopeRaw.restriction !== "all" &&
    scopeRaw.userId &&
    row.assigned_to &&
    row.assigned_to !== scopeRaw.userId
  ) {
    return null;
  }

  const [{ data: rawLead }, { data: acts }, staffNames] = await Promise.all([
    db().from("idealista_leads").select("profile, properties").eq("id", id).maybeSingle(),
    db()
      .from("lead_activity")
      .select("id, kind, outcome, body, created_at, author_id")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    getStaffNames(),
  ]);

  const [property, linkedClient, duplicates] = await Promise.all([
    // La ficha propia manda; si no la hay, el anuncio de Idealista.
    row.matched_property_id
      ? getPropertyContext(row.matched_property_id)
      : row.matched_listing_id
        ? getListingContext(row.matched_listing_id)
        : null,
    row.client_id ? getClientRef(row.client_id) : null,
    getDuplicates(id, row.phone_digits ?? ""),
  ]);

  const facts = factsOf(row);
  facts.activity = (acts ?? []).map((a: any) => ({
    kind: a.kind,
    outcome: a.outcome ?? null,
    createdAt: a.created_at,
  }));
  facts.clientCandidate = false;

  const profile = rawLead?.profile ?? null;

  return {
    id: row.id,
    name: row.name ?? null,
    phone: row.phone ?? null,
    isInternational: Boolean(row.is_international),
    message: row.message ?? null,
    profileBullets: Array.isArray(profile?.bullets) ? profile.bullets : [],
    profilePresentation: profile?.presentacion ?? null,
    propertyTitle: row.property_title ?? null,
    propertyPrice: row.property_price ?? null,
    propertyImageUrl: row.property_image_url ?? null,
    properties: Array.isArray(rawLead?.properties)
      ? rawLead.properties.map((p: any) => ({
          title: p?.title ?? null,
          price: p?.price ?? null,
          imageUrl: p?.imageUrl ?? p?.image_url ?? null,
        }))
      : [],
    idealistaThreadUrl: idealistaThreadUrl(row.idealista_conversation_id ?? ""),
    leadType: row.lead_type ?? null,
    suggestedType: row.suggested_type ?? null,
    createdAt: row.created_at,
    assignedTo: row.assigned_to ?? null,
    assignedName: row.assigned_to ? (staffNames.get(row.assigned_to) ?? null) : null,
    clientId: row.client_id ?? null,
    convertedAt: row.converted_at ?? null,
    nextActionAt: row.next_action_at ?? null,
    nextActionNote: row.next_action_note ?? null,
    followUp: deriveFollowUpState(row.next_action_at ?? null),
    state: deriveCommercialState(facts),
    reasons: deriveAttention(facts),
    whatsapp: facts.whatsapp,
    activity: (acts ?? []).map((a: any) => ({
      id: a.id,
      kind: a.kind,
      outcome: a.outcome ?? null,
      body: a.body ?? null,
      authorName: a.author_id ? (staffNames.get(a.author_id) ?? null) : null,
      createdAt: a.created_at,
    })),
    property,
    linkedClient,
    duplicates,
    avatarUrl: row.avatar_url ?? null,
  };
}

async function getPropertyContext(propertyId: string): Promise<LeadPropertyContext | null> {
  try {
    const { data } = await db()
      .from("properties")
      .select("id, slug, title, property_reference, price, operation, status, zone, cover_photo_url")
      .eq("id", propertyId)
      .maybeSingle();
    if (!data) return null;
    return {
      source: "property",
      id: data.id,
      slug: data.slug,
      title: data.title ?? null,
      reference: data.property_reference ?? null,
      price: data.price === null ? null : Number(data.price),
      operation: data.operation ?? null,
      status: data.status ?? null,
      zone: data.zone ?? null,
      coverUrl: data.cover_photo_url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * La ficha cuando el lead está emparejado a un ANUNCIO de Idealista sin fila
 * en `properties`. En esta cartera es el caso mayoritario: son fichas "inspo",
 * con referencia BC-xxxx y precio propios, y tratarlas como "sin ficha" hacía
 * que la bandeja diera por perdidos leads que estaban bien emparejados.
 */
async function getListingContext(listingId: string): Promise<LeadPropertyContext | null> {
  try {
    const { data } = await db()
      .from("idealista_listings")
      .select(
        "id, reference_code, inspo_title, address_street, address_city, operation, price, total_rental_price",
      )
      .eq("id", listingId)
      .maybeSingle();
    if (!data) return null;
    // El precio que vale es el de SU operación: en una ficha de alquiler
    // `price` está a 0 por construcción (ver inspo-mapper).
    const raw = data.operation === "rent" ? data.total_rental_price : data.price;
    return {
      source: "listing",
      id: data.id,
      slug: null,
      title: data.inspo_title ?? data.address_street ?? null,
      reference: data.reference_code ?? null,
      price: raw === null || raw === undefined ? null : Number(raw),
      operation: data.operation ?? null,
      // `idealista_state` (draft/published) no es un estado de propiedad: no se
      // traduce aquí para no darle un significado que no tiene.
      status: null,
      zone: data.address_city ?? null,
      coverUrl: null,
    };
  } catch {
    return null;
  }
}

async function getClientRef(clientId: string): Promise<LeadClientRef | null> {
  try {
    const { data } = await db()
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", clientId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      fullName: data.full_name || data.email,
      email: data.email,
      phone: data.phone ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Otras consultas de la misma persona. **No se fusiona nada**: dos
 * conversaciones distintas pueden ser dos intenciones legítimas (dos pisos
 * distintos), y fusionarlas destruiría información.
 */
async function getDuplicates(
  leadId: string,
  phoneDigits: string,
): Promise<LeadDetail["duplicates"]> {
  if (phoneDigits.length < 9) return [];
  try {
    const tail = phoneDigits.slice(-9);
    const { data } = await db()
      .from(VIEW)
      .select("id, created_at, property_title, phone_digits")
      .neq("id", leadId)
      .like("phone_digits", `%${tail}`)
      .order("created_at", { ascending: false })
      .limit(10);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      createdAt: r.created_at,
      propertyTitle: r.property_title ?? null,
    }));
  } catch {
    return [];
  }
}
