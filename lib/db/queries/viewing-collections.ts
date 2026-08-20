import "server-only";
import { createAdminClient } from "../admin";
import { createClient } from "../server";
import { resolveViewScope, getAssignedClientIds } from "./view-scope";
import { checkPermission } from "@/lib/auth/guard";
import {
  toPublicViewingCollection,
  type RawCollectionData,
  type RawPublicProperty,
  type RawPublicStop,
} from "@/lib/viewing-collections/to-public";
import type { PublicCollectionResult } from "@/lib/viewing-collections/public-contract";
import { compareStopsByDay } from "@/lib/viewing-collections/order";
import {
  DEFAULT_VC_SETTINGS,
  deriveShareState,
  type CollectionAnalytics,
  type CollectionShareView,
  type ItineraryReadiness,
  type ItineraryWithStops,
  type SelectionWithProperty,
  type StopWithSelection,
  type ViewingCollectionsSettings,
} from "@/lib/viewing-collections/types";

// ============================================================================
// Feature flag
// ============================================================================

export async function getViewingCollectionsSettings(): Promise<ViewingCollectionsSettings> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "viewing_collections")
      .maybeSingle();
    const v = (data?.value ?? {}) as Record<string, unknown>;
    return {
      enabled: v.enabled !== false,
      defaultExpiryDays:
        typeof v.default_expiry_days === "number"
          ? v.default_expiry_days
          : DEFAULT_VC_SETTINGS.defaultExpiryDays,
      maxExpiryDays:
        typeof v.max_expiry_days === "number"
          ? v.max_expiry_days
          : DEFAULT_VC_SETTINGS.maxExpiryDays,
      allowRenewal: v.allow_renewal !== false,
    };
  } catch {
    return DEFAULT_VC_SETTINGS;
  }
}

// ============================================================================
// Superficie pública · /v/[token]
// ============================================================================

// Columnas EXPLÍCITAS en todos los niveles. Nunca select("*").
// NO se seleccionan jamás: owner_name, owner_phone, owner_email,
// internal_notes, source_url, external_id, cover_photo_url, agent_notes, ni
// property_shares.label (contiene nombres de personas).
const PUBLIC_COLLECTION_SELECT = `
  id,
  token,
  expires_at,
  revoked_at,
  viewing_itineraries!inner (
    title,
    scheduled_date,
    window_start,
    window_end,
    timezone,
    country,
    language,
    status,
    client:profiles!viewing_itineraries_client_id_fkey ( full_name ),
    agent:profiles!viewing_itineraries_created_by_fkey ( full_name, email, phone, avatar_url ),
    viewing_stops (
      id,
      position,
      scheduled_at,
      time_pending,
      duration_minutes,
      confirmation_status,
      address_visibility,
      exact_address_override,
      hidden_from_client,
      created_at,
      property_shares ( token ),
      client_property_selections!inner (
        client_rating,
        properties!inner (
          slug, title, title_rent, property_type,
          zone, subzone, address,
          bedrooms, bathrooms, square_meters,
          price, rent_price, currency, operation, operations,
          status, archived_at, bc_reference,
          latitude, longitude, country,
          last_synced_at, updated_at, analytics_token,
          property_photos ( url, position, is_cover )
        )
      )
    )
  )
`;

// Mismo árbol que la query pública, pero partiendo del itinerario. Se
// mantiene sincronizado a mano con PUBLIC_COLLECTION_SELECT: si añades una
// columna allí, añádela aquí — o el preview del agente y lo que ve el cliente
// dejarán de coincidir, que es justo lo que el preview debe evitar.
const PREVIEW_ITINERARY_SELECT = `
  client_id,
  title,
  scheduled_date,
  window_start,
  window_end,
  timezone,
  country,
  language,
  status,
  client:profiles!viewing_itineraries_client_id_fkey ( full_name ),
  agent:profiles!viewing_itineraries_created_by_fkey ( full_name, email, phone, avatar_url ),
  viewing_stops (
    position,
    scheduled_at,
    time_pending,
    duration_minutes,
    confirmation_status,
    address_visibility,
    exact_address_override,
    hidden_from_client,
    created_at,
    property_shares ( token ),
    client_property_selections!inner (
      properties!inner (
        slug, title, title_rent, property_type,
        zone, subzone, address,
        bedrooms, bathrooms, square_meters,
        price, rent_price, currency, operation, operations,
        status, archived_at, bc_reference,
        latitude, longitude, country,
        last_synced_at, updated_at,
        property_photos ( url, position, is_cover )
      )
    )
  )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function shapeRawCollection(row: any): RawCollectionData | null {
  const itinerary = Array.isArray(row.viewing_itineraries)
    ? row.viewing_itineraries[0]
    : row.viewing_itineraries;
  if (!itinerary) return null;

  const pickOne = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const stops: RawPublicStop[] = (itinerary.viewing_stops ?? [])
    .map((s: any): RawPublicStop | null => {
      const sel = pickOne<any>(s.client_property_selections);
      const prop = pickOne<any>(sel?.properties);
      if (!prop) return null;
      const share = pickOne<any>(s.property_shares);
      return {
        id: s.id,
        client_rating: sel?.client_rating ?? 0,
        position: s.position,
        scheduled_at: s.scheduled_at,
        time_pending: s.time_pending ?? false,
        duration_minutes: s.duration_minutes,
        confirmation_status: s.confirmation_status,
        address_visibility: s.address_visibility,
        exact_address_override: s.exact_address_override ?? null,
        hidden_from_client: s.hidden_from_client,
        created_at: s.created_at,
        smartLinkToken: share?.token ?? null,
        property: prop as RawPublicProperty,
      };
    })
    .filter(Boolean) as RawPublicStop[];

  return {
    itinerary: {
      title: itinerary.title,
      scheduled_date: itinerary.scheduled_date,
      window_start: itinerary.window_start,
      window_end: itinerary.window_end,
      timezone: itinerary.timezone,
      country: itinerary.country,
      language: itinerary.language,
    },
    clientFullName: pickOne<any>(itinerary.client)?.full_name ?? null,
    agent: pickOne<any>(itinerary.agent) ?? null,
    stops,
    expiresAt: row.expires_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Resuelve un token público. Service role, SOLO en servidor: el visitante no
 * está autenticado, así que la RLS no aplica y la seguridad la da esta query
 * (columnas explícitas) más la proyección.
 *
 * Una sola lectura para toda la colección: PostgREST resuelve el árbol
 * completo por FK en una petición.
 *
 * La rama de fallo nunca dice por qué falló.
 */
export async function getPublicCollectionByToken(
  token: string,
): Promise<PublicCollectionResult> {
  if (!token || token.length < 16) return { ok: false };

  const settings = await getViewingCollectionsSettings();
  if (!settings.enabled) return { ok: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data, error } = await supabase
    .from("viewing_collection_shares")
    .select(PUBLIC_COLLECTION_SELECT)
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { ok: false };

  if (data.revoked_at) return { ok: false };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false };

  const itinerary = Array.isArray(data.viewing_itineraries)
    ? data.viewing_itineraries[0]
    : data.viewing_itineraries;
  if (!itinerary) return { ok: false };
  if (!["published", "completed"].includes(itinerary.status)) {
    return { ok: false };
  }

  const shaped = shapeRawCollection(data);
  if (!shaped) return { ok: false };

  return {
    ok: true,
    shareId: data.id,
    collection: toPublicViewingCollection(shaped),
  };
}

/**
 * Previsualización para el agente: la MISMA proyección que ve el cliente,
 * resuelta por id de itinerario en vez de por token, y autorizada por sesión
 * de staff en vez de por secreto compartido.
 *
 * Funciona con el itinerario en borrador — es justo su razón de ser: ver el
 * resultado antes de publicar. No registra aperturas ni analítica.
 */
export async function getPreviewCollection(
  itineraryId: string,
): Promise<PublicCollectionResult> {
  const perm = await checkPermission("viewing_collections", "view");
  if (!perm.ok) return { ok: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data, error } = await supabase
    .from("viewing_itineraries")
    .select(PREVIEW_ITINERARY_SELECT)
    .eq("id", itineraryId)
    .maybeSingle();

  if (error || !data) return { ok: false };

  // El scope (own/team/all) decide si este agente puede ver a este cliente.
  const allowed = await canAccessClient(data.client_id);
  if (!allowed) return { ok: false };

  const shaped = shapeRawCollection({
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    viewing_itineraries: data,
  });
  if (!shaped) return { ok: false };

  return {
    ok: true,
    shareId: "",
    collection: toPublicViewingCollection(shaped),
  };
}

/**
 * Traduce el `order` que ve el cliente (1..N) al id de la parada.
 *
 * Existe porque la proyección pública NO expone ni un UUID, así que el
 * navegador solo puede nombrar una residencia por su puesto en la jornada. La
 * traducción usa el MISMO filtro y el MISMO comparador que la proyección
 * (`compareStopsByDay`, que vive aparte justo para esto): si aquí se ordenara
 * de otra forma, el cliente valoraría la residencia de al lado.
 *
 * Devuelve null si el token no vale, ha caducado, o ese puesto no existe.
 */
export async function resolveStopIdByPublicOrder(
  token: string,
  order: number,
): Promise<string | null> {
  if (!Number.isInteger(order) || order < 1) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("viewing_collection_shares")
    .select(PUBLIC_COLLECTION_SELECT)
    .eq("token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  const shaped = shapeRawCollection(data);
  if (!shaped) return null;

  const visible = shaped.stops
    .filter((s) => s.hidden_from_client === false)
    .sort(compareStopsByDay);

  return visible[order - 1]?.id ?? null;
}

/** Apertura registrada en servidor: no la bloquea un ad-blocker. */
export async function recordCollectionOpen(params: {
  shareId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  await supabase.from("viewing_collection_opens").insert({
    share_id: params.shareId,
    ip: params.ip,
    user_agent: params.userAgent,
  });
}

// ============================================================================
// Panel
// ============================================================================

const PORTAL_URL = (
  process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.bcousinoprop.com"
).replace(/\/+$/, "");

export function collectionUrl(token: string): string {
  return `${PORTAL_URL}/v/${token}`;
}

function hashStrings(parts: string[]): string {
  const s = parts.join("|");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function coverUrl(prop: any): string | null {
  const photos = (prop?.property_photos ?? []) as Array<{
    url: string;
    position: number;
  }>;
  if (photos.length === 0) return null;
  const sorted = photos.slice().sort((a, b) => a.position - b.position);
  const v = hashStrings([
    ...sorted.map((p) => p.url),
    prop.last_synced_at ?? prop.updated_at ?? "",
  ]);
  return `/p/${prop.slug}/0?v=${v}`;
}

function toPropertySummary(prop: any) {
  return {
    id: prop.id,
    slug: prop.slug,
    title: prop.title,
    zone: prop.zone,
    subzone: prop.subzone ?? null,
    bedrooms: prop.bedrooms,
    bathrooms: prop.bathrooms,
    squareMeters: prop.square_meters ?? null,
    price: Number(prop.price),
    currency: prop.currency ?? null,
    operation: prop.operation,
    status: prop.status,
    isArchived: Boolean(prop.archived_at) || prop.status === "archived",
    bcReference: prop.bc_reference ?? null,
    // Solo para el PANEL: el editor la enseña como referencia de lo que hay
    // en la ficha. Al cliente nunca le llega desde aquí (ver to-public.ts).
    address: prop.address ?? null,
    coverPhotoUrl: coverUrl(prop),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SELECTION_PROPERTY_SELECT = `
  id, slug, title, zone, subzone, bedrooms, bathrooms, square_meters,
  price, currency, operation, status, archived_at, bc_reference, address,
  last_synced_at, updated_at,
  property_photos ( url, position )
`;

/**
 * Comprueba si el usuario actual puede operar sobre este cliente, según el
 * scope del recurso (own/team/all). Mismo puente que usa getVisitRequests: el
 * dueño efectivo de un cliente es su asesor asignado.
 */
export async function canAccessClient(clientId: string): Promise<boolean> {
  const { restriction, userId } = await resolveViewScope("viewing_collections");
  if (restriction === "none") return false;
  if (restriction === "all" || !userId) return true;
  const ids = await getAssignedClientIds(userId);
  return ids.includes(clientId);
}

/** La selección de un cliente, con insignias derivadas. */
export async function getClientSelection(
  clientId: string,
): Promise<SelectionWithProperty[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [selRes, stopRes, favRes] = await Promise.all([
    admin
      .from("client_property_selections")
      .select(`*, properties!inner ( ${SELECTION_PROPERTY_SELECT} )`)
      .eq("client_id", clientId)
      // El orden lo fija el agente arrastrando. `nullsFirst: false` evita que
      // Postgres suba arriba las filas sin posición, que es su default en ASC.
      .order("position", { ascending: true, nullsFirst: false })
      .order("added_at", { ascending: true }),
    admin
      .from("viewing_stops")
      .select(
        `selection_id, confirmation_status,
         viewing_itineraries!inner ( id, title, scheduled_date, status, client_id )`,
      )
      .eq("viewing_itineraries.client_id", clientId),
    admin.from("favorites").select("property_id").eq("client_id", clientId),
  ]);

  if (selRes.error) {
    console.error("getClientSelection:", selRes.error.message);
    return [];
  }

  const favorites = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((favRes.data ?? []) as any[]).map((f) => f.property_id),
  );

  const stopsBySelection = new Map<
    string,
    Array<{ title: string; status: string; confirmation: string }>
  >();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (stopRes.data ?? []) as any[]) {
    const it = Array.isArray(s.viewing_itineraries)
      ? s.viewing_itineraries[0]
      : s.viewing_itineraries;
    if (!it) continue;
    const list = stopsBySelection.get(s.selection_id) ?? [];
    list.push({
      title: it.title || it.scheduled_date || "Itinerario",
      status: it.status,
      confirmation: s.confirmation_status,
    });
    stopsBySelection.set(s.selection_id, list);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((selRes.data ?? []) as any[]).map((row) => {
    const prop = Array.isArray(row.properties)
      ? row.properties[0]
      : row.properties;
    const stops = stopsBySelection.get(row.id) ?? [];
    const live = stops.filter(
      (s) => s.status !== "cancelled" && s.status !== "archived",
    );
    return {
      ...row,
      property: toPropertySummary(prop),
      badges: {
        inItinerary: live.length > 0,
        itineraryTitles: Array.from(new Set(live.map((s) => s.title))),
        visited: stops.some((s) => s.confirmation === "completed"),
        isClientFavorite: favorites.has(prop.id),
      },
    } as SelectionWithProperty;
  });
}

// Query del PANEL (staff). Aquí `*` es correcto y necesario: el agente ve las
// notas internas y todos los campos de gestión. La query PÚBLICA es
// PUBLIC_COLLECTION_SELECT, arriba, y esa sí lista columnas una a una.
const ITINERARY_SELECT = `
  *,
  viewing_stops (
    *,
    client_property_selections!inner (
      *,
      properties!inner ( ${SELECTION_PROPERTY_SELECT} )
    ),
    property_shares ( id, token, label ),
    visit_requests ( id, status, requested_at )
  ),
  viewing_collection_shares ( * )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function computeReadiness(
  itinerary: any,
  stops: StopWithSelection[],
): ItineraryReadiness {
  const visible = stops.filter((s) => !s.hidden_from_client);
  const blockers: ItineraryReadiness["blockers"] = [];
  const warnings: ItineraryReadiness["warnings"] = [];

  if (!itinerary.scheduled_date) blockers.push({ kind: "no_date" });
  if (visible.length === 0) blockers.push({ kind: "no_stops" });

  // Una parada cancelada o rechazada se conserva visible a propósito (para que
  // el cliente entienda el cambio de plan) y no tiene ni debe tener hora. Solo
  // se exige hora a las que van a ocurrir — igual que publish_viewing_itinerary.
  const withoutTime = visible.filter(
    (s) =>
      !s.scheduled_at &&
      // Declarada "hora por confirmar": es una decisión del agente, no un
      // olvido, y el cliente la lee como tal. No bloquea (ver migración 0131).
      !s.time_pending &&
      !["cancelled", "declined"].includes(s.confirmation_status),
  ).length;
  if (withoutTime > 0) {
    blockers.push({ kind: "stops_without_time", count: withoutTime });
  }

  const archived = visible
    .filter((s) => s.selection.property.isArchived)
    .map((s) => s.selection.property.title);
  if (archived.length > 0) {
    blockers.push({ kind: "archived_properties", titles: archived });
  }

  const nonAvailable = visible
    .filter(
      (s) =>
        !s.selection.property.isArchived &&
        s.selection.property.status !== "available",
    )
    .map((s) => s.selection.property.title);
  if (nonAvailable.length > 0) {
    warnings.push({ kind: "non_available_properties", titles: nonAvailable });
  }

  const unconfirmed = visible.filter(
    (s) => !["confirmed", "completed"].includes(s.confirmation_status),
  ).length;
  if (unconfirmed > 0) {
    warnings.push({ kind: "unconfirmed_stops", count: unconfirmed });
  }

  // Solapes: se avisan, no bloquean. Un agente puede tener motivos (dos pisos
  // en el mismo portal).
  const timed = visible
    .filter((s) => s.scheduled_at)
    .map((s) => ({
      start: new Date(s.scheduled_at as string).getTime(),
      end:
        new Date(s.scheduled_at as string).getTime() +
        (s.duration_minutes ?? 30) * 60000,
    }))
    .sort((a, b) => a.start - b.start);
  let overlaps = 0;
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].start < timed[i - 1].end) overlaps++;
  }
  if (overlaps > 0) warnings.push({ kind: "overlaps", count: overlaps });

  return { canPublish: blockers.length === 0, blockers, warnings };
}

function shapeItinerary(
  row: any,
  opensByShare: Map<string, { count: number; last: string | null }>,
  opensByPropertyShare: Map<string, number>,
): ItineraryWithStops {
  const stops: StopWithSelection[] = (row.viewing_stops ?? [])
    .map((s: any): StopWithSelection => {
      const sel = Array.isArray(s.client_property_selections)
        ? s.client_property_selections[0]
        : s.client_property_selections;
      const prop = Array.isArray(sel?.properties)
        ? sel.properties[0]
        : sel?.properties;
      const share = Array.isArray(s.property_shares)
        ? s.property_shares[0]
        : s.property_shares;
      const vr = Array.isArray(s.visit_requests)
        ? s.visit_requests[0]
        : s.visit_requests;
      return {
        ...s,
        selection: {
          ...sel,
          property: toPropertySummary(prop),
          badges: {
            inItinerary: true,
            itineraryTitles: [],
            visited: s.confirmation_status === "completed",
            isClientFavorite: false,
          },
        },
        visitRequest: vr
          ? { id: vr.id, status: vr.status, requestedAt: vr.requested_at }
          : null,
        smartLink: share
          ? {
              id: share.id,
              token: share.token,
              label: share.label ?? null,
              opensCount: opensByPropertyShare.get(share.id) ?? 0,
            }
          : null,
      };
    })
    // El MISMO orden que verá el cliente (ver lib/viewing-collections/order.ts):
    // por hora, y las que aún no la tienen, al final. Si el panel ordenara por
    // su cuenta, el agente vería una jornada y el cliente otra.
    .sort(compareStopsByDay);

  const shares = (row.viewing_collection_shares ?? []) as any[];
  const active =
    shares
      .filter((sh) => deriveShareState(sh) === "active")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  const activeShare: CollectionShareView | null = active
    ? {
        ...active,
        state: deriveShareState(active),
        opensCount: opensByShare.get(active.id)?.count ?? 0,
        lastOpenedAt: opensByShare.get(active.id)?.last ?? null,
        url: collectionUrl(active.token),
      }
    : null;

  return {
    ...row,
    stops,
    activeShare,
    readiness: computeReadiness(row, stops),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function loadOpens(
  shareIds: string[],
): Promise<Map<string, { count: number; last: string | null }>> {
  const map = new Map<string, { count: number; last: string | null }>();
  if (shareIds.length === 0) return map;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("viewing_collection_opens")
    .select("share_id, opened_at")
    .in("share_id", shareIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (data ?? []) as any[]) {
    const e = map.get(o.share_id) ?? { count: 0, last: null };
    e.count++;
    if (!e.last || o.opened_at > e.last) e.last = o.opened_at;
    map.set(o.share_id, e);
  }
  return map;
}

async function loadPropertyShareOpens(
  shareIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (shareIds.length === 0) return map;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("property_share_opens")
    .select("share_id")
    .in("share_id", shareIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (data ?? []) as any[]) {
    map.set(o.share_id, (map.get(o.share_id) ?? 0) + 1);
  }
  return map;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function shapeMany(rows: any[]): Promise<ItineraryWithStops[]> {
  const collShareIds: string[] = [];
  const propShareIds: string[] = [];
  for (const r of rows) {
    for (const sh of r.viewing_collection_shares ?? []) collShareIds.push(sh.id);
    for (const s of r.viewing_stops ?? []) {
      const share = Array.isArray(s.property_shares)
        ? s.property_shares[0]
        : s.property_shares;
      if (share?.id) propShareIds.push(share.id);
    }
  }
  const [opens, propOpens] = await Promise.all([
    loadOpens(collShareIds),
    loadPropertyShareOpens(propShareIds),
  ]);
  return rows.map((r) => shapeItinerary(r, opens, propOpens));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getClientItineraries(
  clientId: string,
): Promise<ItineraryWithStops[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("viewing_itineraries")
    .select(ITINERARY_SELECT)
    .eq("client_id", clientId)
    .neq("status", "archived")
    .order("scheduled_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getClientItineraries:", error.message);
    return [];
  }
  return shapeMany(data ?? []);
}

export async function getItineraryById(
  itineraryId: string,
): Promise<ItineraryWithStops | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("viewing_itineraries")
    .select(ITINERARY_SELECT)
    .eq("id", itineraryId)
    .maybeSingle();
  if (error || !data) return null;
  const [shaped] = await shapeMany([data]);
  return shaped ?? null;
}

/** Analítica de una colección: aperturas de servidor + sesiones de navegador. */
export async function getCollectionAnalytics(
  itineraryId: string,
): Promise<CollectionAnalytics> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const empty: CollectionAnalytics = {
    opens: 0,
    lastOpenedAt: null,
    uniqueSessions: 0,
    stopsViewed: 0,
    stopsTotal: 0,
    smartLinkClicks: 0,
    engagementScore: 0,
  };

  const { data: shares } = await admin
    .from("viewing_collection_shares")
    .select("id")
    .eq("itinerary_id", itineraryId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shareIds = ((shares ?? []) as any[]).map((s) => s.id);
  if (shareIds.length === 0) return empty;

  const { count: stopsTotal } = await admin
    .from("viewing_stops")
    .select("id", { count: "exact", head: true })
    .eq("itinerary_id", itineraryId)
    .eq("hidden_from_client", false);

  const opensMap = await loadOpens(shareIds);
  let opens = 0;
  let lastOpenedAt: string | null = null;
  for (const v of opensMap.values()) {
    opens += v.count;
    if (v.last && (!lastOpenedAt || v.last > lastOpenedAt)) lastOpenedAt = v.last;
  }

  const { data: views } = await admin
    .from("page_views")
    .select("id, session_id")
    .in("collection_share_id", shareIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewRows = (views ?? []) as any[];
  const uniqueSessions = new Set(viewRows.map((v) => v.session_id)).size;

  let stopsViewed = 0;
  let smartLinkClicks = 0;
  if (viewRows.length > 0) {
    const { data: events } = await admin
      .from("page_events")
      .select("event_type, data")
      .in(
        "page_view_id",
        viewRows.map((v) => v.id),
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evRows = (events ?? []) as any[];
    const viewedOrders = new Set(
      evRows
        .filter((e) => e.event_type === "stop_view")
        .map((e) => String(e.data?.order ?? "")),
    );
    viewedOrders.delete("");
    stopsViewed = viewedOrders.size;
    smartLinkClicks = evRows.filter(
      (e) => e.event_type === "share_click",
    ).length;
  }

  const total = stopsTotal ?? 0;
  const coverage = total > 0 ? stopsViewed / total : 0;
  const engagementScore = Math.round(
    coverage * (smartLinkClicks > 0 ? 100 : 50),
  );

  return {
    opens,
    lastOpenedAt,
    uniqueSessions,
    stopsViewed,
    stopsTotal: total,
    smartLinkClicks,
    engagementScore,
  };
}

/** SmartLinks existentes de una propiedad, para el selector del editor. */
export async function getPropertyShareOptions(
  propertyId: string,
): Promise<Array<{ id: string; token: string; label: string | null; opens: number }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("property_shares")
    .select("id, token, label, created_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(20);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const opens = await loadPropertyShareOpens(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    label: r.label ?? null,
    opens: opens.get(r.id) ?? 0,
  }));
}

/** Perfil mínimo del cliente para las cabeceras del módulo. */
export async function getClientBasics(
  clientId: string,
): Promise<{ id: string; fullName: string; country: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, country, role")
    .eq("id", clientId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  if (!row || row.role !== "client") return null;
  return {
    id: row.id,
    fullName: row.full_name?.trim() || row.email,
    country: row.country ?? "es",
  };
}
