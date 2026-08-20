import "server-only";

// ============================================================================
// PROPERTIES WORKSPACE · lectura
//
// Todo en SERVIDOR: paginación, búsqueda, filtros y orden sobre la vista
// `property_workspace_facts` (migración 0143). La pantalla anterior bajaba el
// catálogo entero — 1.335 propiedades con `select("*")` MÁS 16.549 filas de
// foto, ≈4,3 MB por carga — y filtraba en el navegador.
//
// La lista pide una proyección ligera (la portada como URL, nunca el join de
// fotos); el detalle se pide al seleccionar. El Health y la atención se
// derivan en `lib/properties-workspace/derive.ts` sobre estos hechos.
// ============================================================================

import { createAdminClient } from "../admin";
import { checkPermission } from "@/lib/auth/guard";
import {
  deriveAttention,
  deriveHealth,
  derivePublicationBlockers,
  needsAttention,
  type PropertyFacts,
} from "@/lib/properties-workspace/derive";
import {
  normalizeAmenities,
  normalizePropertyType,
  type NormalizedAmenities,
  type NormalizedType,
} from "@/lib/properties-workspace/normalize";
import {
  STALE_SYNC_DAYS,
  type PropertyListItem,
  type PublicationBlocker,
  type WorkspaceCounts,
  type WorkspaceFilters,
} from "@/lib/properties-workspace/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

const VIEW = "property_workspace_facts";

/** Columnas de la fila de lista. El `description` completo NO viaja aquí:
 *  solo hace falta saber si existe, y `has_description` es más barato que
 *  arrastrar 1.400 caracteres por fila. */
const LIST_COLUMNS = [
  "id",
  "slug",
  "title",
  "zone",
  "bc_reference",
  "operation",
  "price",
  "currency",
  "bedrooms",
  "bathrooms",
  "square_meters",
  "property_type",
  "property_type_override",
  "status",
  "published_web",
  "country",
  "source",
  "address",
  "latitude",
  "longitude",
  "cover_photo_url",
  "last_synced_at",
  "updated_at",
  "photo_count",
  "video_count",
  "plan_count",
  "selection_clients",
  "selection_count",
  "shortlist_count",
  "must_visit_count",
  "upcoming_stops",
  "next_stop_at",
  "application_count",
  "share_opens",
  "pending_visit_requests",
  "interest_signals",
  // solo para derivar (no se proyecta): existencia de descripción
  "description",
].join(", ");

function factsOf(r: any): PropertyFacts {
  return {
    title: r.title ?? null,
    description: r.description ?? null,
    price: Number(r.price ?? 0),
    bedrooms: Number(r.bedrooms ?? 0),
    bathrooms: Number(r.bathrooms ?? 0),
    squareMeters: r.square_meters === null ? null : Number(r.square_meters),
    propertyType: r.property_type ?? null,
    propertyTypeOverride: r.property_type_override ?? null,
    status: r.status,
    publishedWeb: Boolean(r.published_web),
    source: r.source,
    address: r.address ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    lastSyncedAt: r.last_synced_at ?? null,
    photoCount: Number(r.photo_count ?? 0),
    hasCover: Boolean(r.cover_photo_url),
    videoCount: Number(r.video_count ?? 0),
    planCount: Number(r.plan_count ?? 0),
    interestSignals: Number(r.interest_signals ?? 0),
    upcomingStops: Number(r.upcoming_stops ?? 0),
  };
}

function toListItem(r: any, now: Date): PropertyListItem {
  const facts = factsOf(r);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title ?? "—",
    zone: r.zone ?? "",
    bcReference: r.bc_reference ?? "",
    operation: r.operation,
    price: Number(r.price ?? 0),
    currency: r.currency ?? null,
    bedrooms: Number(r.bedrooms ?? 0),
    bathrooms: Number(r.bathrooms ?? 0),
    squareMeters: r.square_meters === null ? null : Number(r.square_meters),
    normalizedType: normalizePropertyType(r.property_type, r.property_type_override),
    status: r.status,
    publishedWeb: Boolean(r.published_web),
    country: r.country,
    coverUrl: r.cover_photo_url ?? null,
    photoCount: Number(r.photo_count ?? 0),
    hasVideo: Number(r.video_count ?? 0) > 0,
    hasPlan: Number(r.plan_count ?? 0) > 0,
    interestClients: Number(r.selection_clients ?? 0),
    mustVisitCount: Number(r.must_visit_count ?? 0),
    upcomingStops: Number(r.upcoming_stops ?? 0),
    nextStopAt: r.next_stop_at ?? null,
    applicationCount: Number(r.application_count ?? 0),
    shareOpens: Number(r.share_opens ?? 0),
    lastSyncedAt: r.last_synced_at ?? null,
    updatedAt: r.updated_at,
    health: deriveHealth(facts, now),
    attention: deriveAttention(facts, now),
  };
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

function staleCutoff(now: Date): string {
  return new Date(now.getTime() - STALE_SYNC_DAYS * 86_400_000).toISOString();
}

function applyView(q: any, f: WorkspaceFilters, now: Date) {
  switch (f.view) {
    case "available":
      return q.eq("status", "available").is("archived_at", null);
    case "archived":
      return q.not("archived_at", "is", null);
    case "client-interest":
      return q.gt("interest_signals", 0).is("archived_at", null);
    case "upcoming-viewings":
      return q.gt("upcoming_stops", 0).is("archived_at", null);
    case "needs-attention":
      // Acotado en SQL a lo que PUEDE reclamar (disponibles); la regla fina se
      // aplica en memoria, igual que en la Sales Inbox.
      return q.eq("status", "available").is("archived_at", null);
    case "all":
    default:
      return q.is("archived_at", null);
  }
}

function applyFilters(q: any, f: WorkspaceFilters, now: Date) {
  if (f.operation) q = q.eq("operation", f.operation);
  if (f.zone) q = q.eq("zone", f.zone);
  if (f.agencyId) q = q.eq("agency_id", f.agencyId);
  if (f.bedrooms !== undefined) q = q.gte("bedrooms", f.bedrooms);
  if (f.bathrooms !== undefined) q = q.gte("bathrooms", f.bathrooms);
  if (f.priceMin !== undefined) q = q.gte("price", f.priceMin);
  if (f.priceMax !== undefined) q = q.lte("price", f.priceMax);
  if (f.sqmMin !== undefined) q = q.gte("square_meters", f.sqmMin);
  if (f.sqmMax !== undefined) q = q.lte("square_meters", f.sqmMax);
  if (f.publishedWeb !== undefined) q = q.eq("published_web", f.publishedWeb);
  if (f.hasPhotos === true) q = q.gt("photo_count", 0);
  if (f.hasPhotos === false) q = q.eq("photo_count", 0);
  if (f.hasVideo === true) q = q.gt("video_count", 0);
  if (f.hasPlan === true) q = q.gt("plan_count", 0);
  if (f.missingAddress) q = q.is("address", null);
  if (f.missingCoords) q = q.is("latitude", null);
  if (f.staleSync) q = q.eq("source", "scrape").lt("last_synced_at", staleCutoff(now));
  if (f.source) q = q.eq("source", f.source);

  const term = f.search?.trim();
  if (term) {
    const like = `%${term.replace(/[%,]/g, " ")}%`;
    q = q.or(
      [
        `title.ilike.${like}`,
        `bc_reference.ilike.${like}`,
        `property_reference.ilike.${like}`,
        `external_id.ilike.${like}`,
        `address.ilike.${like}`,
        `zone.ilike.${like}`,
      ].join(","),
    );
  }
  return q;
}

function applySort(q: any, f: WorkspaceFilters) {
  switch (f.sort) {
    case "updated":
      return q.order("updated_at", { ascending: false });
    case "price-desc":
      return q.order("price", { ascending: false });
    case "price-asc":
      return q.order("price", { ascending: true });
    case "synced":
      return q.order("last_synced_at", { ascending: true, nullsFirst: false });
    case "interest":
      return q
        .order("interest_signals", { ascending: false })
        .order("updated_at", { ascending: false });
    case "viewing":
      return q.order("next_stop_at", { ascending: true, nullsFirst: false });
    case "newest":
    default:
      return q.order("created_at", { ascending: false });
  }
}

export type WorkspacePage = {
  items: PropertyListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const EMPTY_PAGE: WorkspacePage = { items: [], total: 0, page: 1, pageSize: 40 };

/** Techo del modo "necesitan atención" (regla derivada en memoria). Con 687
 *  disponibles es exacto; por encima de 2.000 habría que llevarla a SQL. */
const SCAN_LIMIT = 2000;

export async function getWorkspacePage(
  filters: WorkspaceFilters,
  country: string,
): Promise<WorkspacePage> {
  const gate = await checkPermission("properties", "view");
  if (!gate.ok) return EMPTY_PAGE;

  const now = new Date();
  const attentionMode = filters.view === "needs-attention" || filters.sort === "attention";

  if (!attentionMode) {
    let q = db().from(VIEW).select(LIST_COLUMNS, { count: "exact" }).eq("country", country);
    q = applyView(q, filters, now);
    q = applyFilters(q, filters, now);
    q = applySort(q, filters);
    const from = (filters.page - 1) * filters.pageSize;
    const { data, count, error } = await q.range(from, from + filters.pageSize - 1);
    if (error) {
      console.error("[getWorkspacePage]", error.message);
      return { ...EMPTY_PAGE, page: filters.page, pageSize: filters.pageSize };
    }
    return {
      items: (data ?? []).map((r: any) => toListItem(r, now)),
      total: count ?? 0,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  // ── Modo atención: acotar en SQL, derivar y ordenar en memoria ──
  let q = db().from(VIEW).select(LIST_COLUMNS).eq("country", country);
  q = applyView(q, { ...filters, view: "needs-attention" }, now);
  q = applyFilters(q, filters, now);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(SCAN_LIMIT);
  if (error) {
    console.error("[getWorkspacePage attention]", error.message);
    return { ...EMPTY_PAGE, page: filters.page, pageSize: filters.pageSize };
  }

  const all = (data ?? [])
    .map((r: any) => toListItem(r, now))
    .filter((x: PropertyListItem) =>
      filters.view === "needs-attention" ? needsAttention(x.attention) : true,
    )
    .sort(
      (a: PropertyListItem, b: PropertyListItem) =>
        b.attention.operational.length - a.attention.operational.length ||
        new Date(a.lastSyncedAt ?? a.updatedAt).getTime() -
          new Date(b.lastSyncedAt ?? b.updatedAt).getTime(),
    );

  const from = (filters.page - 1) * filters.pageSize;
  return {
    items: all.slice(from, from + filters.pageSize),
    total: all.length,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/** Cinco counts con `head: true` + el de atención sobre el conjunto acotado. */
export async function getWorkspaceCounts(country: string): Promise<WorkspaceCounts> {
  const gate = await checkPermission("properties", "view");
  if (!gate.ok) {
    return { all: 0, available: 0, needsAttention: 0, clientInterest: 0, upcomingViewings: 0, archived: 0 };
  }
  const base = () => db().from(VIEW).select("id", { count: "exact", head: true }).eq("country", country);

  const [all, available, interest, upcoming, archived, attention] = await Promise.all([
    base().is("archived_at", null),
    base().eq("status", "available").is("archived_at", null),
    base().gt("interest_signals", 0).is("archived_at", null),
    base().gt("upcoming_stops", 0).is("archived_at", null),
    base().not("archived_at", "is", null),
    getWorkspacePage(
      { view: "needs-attention", page: 1, pageSize: 1, sort: "attention" },
      country,
    ),
  ]);

  return {
    all: (all as any).count ?? 0,
    available: (available as any).count ?? 0,
    needsAttention: attention.total,
    clientInterest: (interest as any).count ?? 0,
    upcomingViewings: (upcoming as any).count ?? 0,
    archived: (archived as any).count ?? 0,
  };
}

// ─── Detalle de una propiedad ────────────────────────────────────────────────

export type ClientInterestEntry = {
  clientId: string;
  clientName: string;
  /** Señales combinadas de la MISMA persona, deduplicadas por client_id. */
  selection: {
    status: string;
    addedAt: string;
    clientRating: number;
    clientRank: number | null;
  } | null;
  shortlist: {
    decision: string;
    rank: number | null;
    decidedAt: string | null;
    comment: string | null;
  } | null;
  upcomingStops: Array<{
    at: string | null;
    confirmation: string;
    itineraryTitle: string | null;
    itineraryId: string;
    itineraryDate: string | null;
  }>;
  visitRequest: { status: string; requestedAt: string } | null;
  application: { id: string; status: string; submittedAt: string | null; documents: number } | null;
};

export type PropertySmartLinks = {
  totalLinks: number;
  totalOpens: number;
  lastOpenedAt: string | null;
  links: Array<{
    id: string;
    token: string;
    label: string | null;
    expiresAt: string | null;
    opens: number;
    lastOpenedAt: string | null;
  }>;
};

export type PropertyEngagement = {
  /** Eventos del shortlist / Private Book atribuidos por el token opaco.
   *  Empieza a contar desde esta versión: no hay histórico anterior. */
  events: Record<string, number>;
  total: number;
};

export type PropertyHistoryEntry = {
  id: string;
  kind: "price" | "status" | "published_web";
  oldValue: string | null;
  newValue: string | null;
  currency: string | null;
  actorName: string | null;
  createdAt: string;
};

export type PropertyWorkspaceDetail = {
  item: PropertyListItem;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  subzone: string | null;
  source: string;
  sourceUrl: string | null;
  externalId: string | null;
  agency: { id: string; name: string; slug: string } | null;
  owner: { name: string | null; phone: string | null; email: string | null };
  rawType: string | null;
  typeOverride: NormalizedType | null;
  amenities: NormalizedAmenities;
  publicationBlockers: PublicationBlocker[];
  photos: Array<{ id: string; url: string; isCover: boolean; position: number }>;
  videos: Array<{ id: string; url: string; fileName: string | null }>;
  plans: Array<{ id: string; url: string; fileName: string | null }>;
  interest: ClientInterestEntry[];
  smartLinks: PropertySmartLinks;
  engagement: PropertyEngagement;
  history: PropertyHistoryEntry[];
  internalNotes: string | null;
};

export async function getPropertyWorkspaceDetail(
  id: string,
): Promise<PropertyWorkspaceDetail | null> {
  const gate = await checkPermission("properties", "view");
  if (!gate.ok) return null;

  const now = new Date();
  const { data: row } = await db().from(VIEW).select("*").eq("id", id).maybeSingle();
  if (!row) return null;

  const [
    { data: raw },
    { data: photos },
    { data: media },
    { data: selections },
    { data: shortItems },
    { data: stops },
    { data: visits },
    { data: apps },
    { data: shares },
    { data: history },
    engagement,
  ] = await Promise.all([
    db()
      .from("properties")
      .select("features, features_manual, owner_name, owner_phone, owner_email, internal_notes, subzone, agencies(id, name, slug)")
      .eq("id", id)
      .maybeSingle(),
    db()
      .from("property_photos")
      .select("id, url, is_cover, position")
      .eq("property_id", id)
      .order("position", { ascending: true }),
    db()
      .from("property_media")
      .select("id, url, type, file_name")
      .eq("property_id", id),
    db()
      .from("client_property_selections")
      .select("client_id, status, added_at, client_rating, client_rank, profiles!client_property_selections_client_id_fkey(id, full_name, email)")
      .eq("property_id", id)
      .neq("status", "discarded"),
    db()
      .from("client_shortlist_items")
      .select("decision, rank, decided_at, client_comment, client_shortlists!inner(client_id, status, profiles!client_shortlists_client_id_fkey(full_name, email))")
      .eq("property_id", id)
      .neq("client_shortlists.status", "archived"),
    db()
      .from("viewing_stops")
      .select(
        `id, scheduled_at, confirmation_status,
         client_property_selections!inner(property_id, client_id, profiles!client_property_selections_client_id_fkey(full_name, email)),
         viewing_itineraries!inner(id, title, status, scheduled_date)`,
      )
      .eq("client_property_selections.property_id", id)
      .in("viewing_itineraries.status", ["draft", "published"]),
    db()
      .from("visit_requests")
      .select("client_id, status, requested_at, profiles!visit_requests_client_id_fkey(full_name, email)")
      .eq("property_id", id),
    db()
      .from("property_applications")
      .select("id, client_id, status, submitted_at, profiles!property_applications_client_id_fkey(full_name, email), property_application_documents(count)")
      .eq("property_id", id),
    db()
      .from("property_shares")
      .select("id, token, label, expires_at, property_share_opens(opened_at)")
      .eq("property_id", id),
    db()
      .from("property_history")
      .select("id, kind, old_value, new_value, currency, created_at, actor_id")
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    getPropertyEngagement(row.analytics_token),
  ]);

  // ── Interés, deduplicado por persona ──
  const byClient = new Map<string, ClientInterestEntry>();
  const entry = (clientId: string, name: string | null): ClientInterestEntry => {
    let e = byClient.get(clientId);
    if (!e) {
      e = {
        clientId,
        clientName: name ?? "—",
        selection: null,
        shortlist: null,
        upcomingStops: [],
        visitRequest: null,
        application: null,
      };
      byClient.set(clientId, e);
    }
    return e;
  };
  const nameOf = (p: any): string | null => {
    const prof = Array.isArray(p) ? p[0] : p;
    return prof?.full_name || prof?.email || null;
  };

  for (const s of (selections ?? []) as any[]) {
    const e = entry(s.client_id, nameOf(s.profiles));
    e.selection = {
      status: s.status,
      addedAt: s.added_at,
      clientRating: Number(s.client_rating ?? 0),
      clientRank: s.client_rank ?? null,
    };
  }
  for (const it of (shortItems ?? []) as any[]) {
    const sl = Array.isArray(it.client_shortlists) ? it.client_shortlists[0] : it.client_shortlists;
    if (!sl?.client_id) continue;
    const e = entry(sl.client_id, nameOf(sl.profiles));
    // La decisión más reciente/fuerte de esa persona sobre este piso.
    const stronger =
      !e.shortlist ||
      (it.decision === "must_visit" && e.shortlist.decision !== "must_visit");
    if (stronger) {
      e.shortlist = {
        decision: it.decision,
        rank: it.rank ?? null,
        decidedAt: it.decided_at ?? null,
        comment: it.client_comment ?? null,
      };
    }
  }
  for (const st of (stops ?? []) as any[]) {
    const sel = Array.isArray(st.client_property_selections)
      ? st.client_property_selections[0]
      : st.client_property_selections;
    const iti = Array.isArray(st.viewing_itineraries)
      ? st.viewing_itineraries[0]
      : st.viewing_itineraries;
    if (!sel?.client_id) continue;
    const e = entry(sel.client_id, nameOf(sel.profiles));
    e.upcomingStops.push({
      at: st.scheduled_at ?? null,
      confirmation: st.confirmation_status,
      itineraryTitle: iti?.title ?? null,
      itineraryId: iti?.id,
      itineraryDate: iti?.scheduled_date ?? null,
    });
  }
  for (const v of (visits ?? []) as any[]) {
    const e = entry(v.client_id, nameOf(v.profiles));
    e.visitRequest = { status: v.status, requestedAt: v.requested_at };
  }
  for (const a of (apps ?? []) as any[]) {
    const e = entry(a.client_id, nameOf(a.profiles));
    e.application = {
      id: a.id,
      status: a.status,
      submittedAt: a.submitted_at ?? null,
      documents: a.property_application_documents?.[0]?.count ?? 0,
    };
  }

  // ── SmartLinks: totales sin inventar quién abrió ──
  const links = ((shares ?? []) as any[]).map((s) => {
    const opens = (s.property_share_opens ?? []) as Array<{ opened_at: string }>;
    const last = opens.reduce<string | null>(
      (acc, o) => (!acc || o.opened_at > acc ? o.opened_at : acc),
      null,
    );
    return {
      id: s.id,
      token: s.token,
      label: s.label ?? null,
      expiresAt: s.expires_at ?? null,
      opens: opens.length,
      lastOpenedAt: last,
    };
  });
  const smartLinks: PropertySmartLinks = {
    totalLinks: links.length,
    totalOpens: links.reduce((n, l) => n + l.opens, 0),
    lastOpenedAt: links.reduce<string | null>(
      (acc, l) => (!acc || (l.lastOpenedAt && l.lastOpenedAt > acc) ? l.lastOpenedAt : acc),
      null,
    ),
    links,
  };

  const mediaRows = (media ?? []) as any[];
  const agency = raw?.agencies
    ? Array.isArray(raw.agencies)
      ? raw.agencies[0]
      : raw.agencies
    : null;

  const facts = factsOf(row);
  const typeOverride = row.property_type_override;

  return {
    item: toListItem(row, now),
    description: row.description ?? null,
    address: row.address ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    subzone: raw?.subzone ?? null,
    source: row.source,
    sourceUrl: row.source_url ?? null,
    externalId: row.external_id ?? null,
    agency: agency ? { id: agency.id, name: agency.name, slug: agency.slug } : null,
    owner: {
      name: raw?.owner_name ?? null,
      phone: raw?.owner_phone ?? null,
      email: raw?.owner_email ?? null,
    },
    rawType: row.property_type ?? null,
    typeOverride: typeOverride ?? null,
    amenities: normalizeAmenities(raw?.features ?? [], raw?.features_manual ?? []),
    publicationBlockers: derivePublicationBlockers(facts),
    photos: ((photos ?? []) as any[]).map((p) => ({
      id: p.id,
      url: p.url,
      isCover: Boolean(p.is_cover),
      position: p.position,
    })),
    videos: mediaRows
      .filter((m) => m.type === "video")
      .map((m) => ({ id: m.id, url: m.url, fileName: m.file_name ?? null })),
    plans: mediaRows
      .filter((m) => m.type === "plan")
      .map((m) => ({ id: m.id, url: m.url, fileName: m.file_name ?? null })),
    interest: [...byClient.values()],
    smartLinks,
    engagement,
    history: ((history ?? []) as any[]).map((h) => ({
      id: h.id,
      kind: h.kind,
      oldValue: h.old_value ?? null,
      newValue: h.new_value ?? null,
      currency: h.currency ?? null,
      actorName: null, // el trigger no conoce al actor; limitación documentada
      createdAt: h.created_at,
    })),
    internalNotes: raw?.internal_notes ?? null,
  };
}

/**
 * Engagement del shortlist / Private Book, atribuido por el token OPACO que la
 * migración 0143 dio a cada propiedad. Los eventos anteriores a esta versión
 * llevaban solo la posición ({"order": 3}) y NO se reconstruyen: reordenar
 * invalida esa inferencia, y un histórico inventado es peor que ninguno.
 */
async function getPropertyEngagement(token: string | null): Promise<PropertyEngagement> {
  if (!token) return { events: {}, total: 0 };
  try {
    const { data } = await db()
      .from("page_events")
      .select("event_type")
      .eq("data->>pt", token)
      .limit(5000);
    const events: Record<string, number> = {};
    for (const e of (data ?? []) as Array<{ event_type: string }>) {
      events[e.event_type] = (events[e.event_type] ?? 0) + 1;
    }
    return { events, total: (data ?? []).length };
  } catch {
    return { events: {}, total: 0 };
  }
}

/** Zonas y agencias para los filtros — pequeñas y cacheables por render. */
export async function getWorkspaceFilterOptions(country: string): Promise<{
  zones: string[];
  agencies: Array<{ id: string; name: string; slug: string }>;
}> {
  const [{ data: zones }, { data: agencies }] = await Promise.all([
    db().from("properties").select("zone").eq("country", country).is("archived_at", null),
    db().from("agencies").select("id, name, slug").order("name"),
  ]);
  return {
    zones: [...new Set(((zones ?? []) as any[]).map((z) => z.zone).filter(Boolean))].sort() as string[],
    agencies: ((agencies ?? []) as any[]).map((a) => ({ id: a.id, name: a.name, slug: a.slug })),
  };
}
