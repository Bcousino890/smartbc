import "server-only";
import { createAdminClient } from "../admin";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";
import { isPointInAnyPolygon, type ZonePolygon } from "@/lib/zone-polygon";
import type { ZoneFilterGroup } from "@/components/admin/particulares/zone-filter";

/**
 * Listado de particulares enriquecido para el panel:
 *  - columnas base del anuncio
 *  - asignación (assigned_to → nombre del asesor)      [migración 0034]
 *  - último contacto registrado (quién/cuándo/cómo)    [migración 0033]
 *  - dirección y confianza del teléfono                [migración 0035]
 *  - plano y vídeo del anuncio                         [migración 0036]
 *
 * Trae TODOS los anuncios sin límite: primero los ACTIVOS (created_at desc)
 * y a continuación los RETIRADOS (is_active = false, taken_down_at desc),
 * fusionados en `rows`. Se pagina internamente por lotes de 1000 contra
 * PostgREST, pero el llamador recibe el conjunto completo. `total` = nº de
 * activos (lo usan las stats del panel).
 *
 * Cada extra degrada con elegancia si su migración aún no está aplicada
 * en el VPS: el listado nunca se rompe.
 */

const BASE_COLUMNS =
  "id, portal, external_id, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, description, cover_url, features, owner_name, phone, chat_only, latitude, longitude, taken_down_at, detected_at, created_at, is_active";

// Columnas de la migración 0036 (plano + vídeo). Pueden no existir aún en el
// VPS — por eso van en intentos separados (degradación elegante).
const MEDIA_COLUMNS_0036 =
  "has_floor_plan, floor_plan_url, has_video, video_url";

export type EnrichedParticularRow = Record<string, unknown> & {
  id: string;
  assigned_to: string | null;
  assigned_name: string | null;
  last_contact_at: string | null;
  last_contact_by: string | null;
  last_contact_type: string | null;
  contact_count: number;
};

// Trae TODAS las filas de una consulta paginando por lotes de 1000 (PostgREST
// limita las filas por request; con .range() iteramos hasta agotar).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (from: number, to: number) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ rows: any[]; error: { message: string } | null }> {
  const BATCH = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  for (let from = 0; ; from += BATCH) {
    const res = await buildQuery(from, from + BATCH - 1);
    if (res.error) return { rows: all, error: res.error };
    const batch = res.data ?? [];
    all.push(...batch);
    if (batch.length < BATCH) break;
  }
  return { rows: all, error: null };
}

// Valor de `id` que NUNCA existe en la tabla (UUID nulo): forma segura de
// devolver cero filas sin usar `.in(col, [])` (PostgREST no garantiza el
// mismo comportamiento con un array vacío) — para "d:<distrito>" sin zonas
// conocidas, o "gestión: mía" sin usuario en sesión.
const IMPOSSIBLE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Filtros server-side del listado — mismos que sincroniza la URL en
 * use-particulares-filters.ts (duplicados a propósito: ese hook es
 * "use client" y este módulo es server-only, no se puede importar directo;
 * si cambias un valor allí, cámbialo también aquí).
 *
 * `floorMin` y `furnished` NO están: se deducen de features/descripción con
 * un parser de texto (lib/floor.ts, lib/furnished.ts) que no vale la pena
 * — ni es seguro — reimplementar en SQL. Se aplican en el cliente como
 * post-filtro sobre la página ya traída (ver particulares-client.tsx): una
 * página filtrada por planta o amueblado puede devolver menos de
 * ANUNCIOS_POR_PAGINA resultados — tradeoff aceptado frente a traer la
 * tabla entera para filtrar bien.
 *
 * `gestion: "contacted"/"unmanaged"` tampoco quedan del todo resueltos aquí:
 * si el anuncio tiene contactos vive en `particulares_contacts`, no en una
 * columna de `particulares`, y no hay forma fiable de expresar "sin
 * contactos" en PostgREST sin un JOIN que además pagina mal. Se filtra lo
 * que SÍ es columna plana (`assigned_to`) y el resto se remata en el
 * cliente tras el enrichment, con el mismo tradeoff que planta/amueblado.
 */
export type ParticularesFilters = {
  search?: string;
  operation?: "rent" | "sale" | "";
  /** Valor crudo del filtro: "", "d:<distrito>", "z:<zona>", o un valor
   *  legado sin prefijo (comparación exacta, tal cual llegaba antes). */
  zone?: string;
  /** Solo para "d:<distrito>": lista EXACTA de `zone` crudos de ese
   *  distrito, ya resuelta contra getParticularesZoneCounts() — el mismo
   *  criterio que ve el desplegable, en vez de reimplementar
   *  normalizeZone() en SQL. */
  zoneDistrictRaw?: string[];
  /** Zona dibujada a mano en el mapa (ver components/admin/particulares/
   *  draw-zone-filter.tsx): lista EXACTA de ids ya resuelta por
   *  getParticularesIdsInPolygons() contra lat/lng. Alternativa a
   *  zone/zoneDistrictRaw — page.tsx solo rellena UNO de los dos (dibujar
   *  zona y elegir distrito/barrio no se combinan, ver
   *  use-particulares-filters.ts), pero si algún día llegaran ambos a la
   *  vez, este gana (es más específico que el desplegable). */
  idsInZone?: string[];
  priceMin?: number;
  priceMax?: number;
  bedroomsMin?: number;
  areaMin?: number;
  last24h?: boolean;
  phoneFilter?: "no_phone" | "with_phone" | "";
  gestion?: "unmanaged" | "contacted" | "assigned" | "mine" | "";
  currentUserId?: string;
  advertiser?: "particular" | "professional" | "unknown" | "";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyParticularesFilters(query: any, f: ParticularesFilters, hasAddress: boolean) {
  let q = query;
  const term = f.search?.trim();
  if (term) {
    // Mismo escapado que lib/db/queries/sales-inbox.ts: PostgREST usa ","
    // como separador de cláusulas .or(), así que un término con comas
    // rompería el filtro si no se sustituye antes.
    const like = `%${term.replace(/[%,]/g, " ")}%`;
    const clauses = [`zone.ilike.${like}`, `description.ilike.${like}`, `external_id.ilike.${like}`];
    if (hasAddress) clauses.push(`address.ilike.${like}`);
    q = q.or(clauses.join(","));
  }

  if (f.operation) q = q.eq("operation", f.operation);

  // `idsInZone` (zona dibujada en el mapa) gana sobre el desplegable de
  // distrito/barrio si por lo que sea llegaran los dos a la vez — en la
  // práctica no pasa, use-particulares-filters.ts limpia uno al fijar el
  // otro, pero un `else` deja claro que no se combinan como AND.
  if (f.idsInZone) {
    q = f.idsInZone.length > 0 ? q.in("id", f.idsInZone) : q.eq("id", IMPOSSIBLE_ID);
  } else if (f.zoneDistrictRaw) {
    q = f.zoneDistrictRaw.length > 0 ? q.in("zone", f.zoneDistrictRaw) : q.eq("id", IMPOSSIBLE_ID);
  } else if (f.zone?.startsWith("z:")) {
    q = q.eq("zone", f.zone.slice(2));
  } else if (f.zone && !f.zone.startsWith("d:")) {
    q = q.eq("zone", f.zone);
  }

  if (f.priceMin != null) q = q.gte("price", f.priceMin);
  if (f.priceMax != null) q = q.lte("price", f.priceMax);
  if (f.bedroomsMin != null) q = q.gte("bedrooms", f.bedroomsMin);
  if (f.areaMin != null) q = q.gte("square_meters", f.areaMin);

  if (f.last24h) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("created_at", since);
  }

  if (f.phoneFilter === "no_phone") q = q.is("phone", null);
  else if (f.phoneFilter === "with_phone") q = q.not("phone", "is", null);

  if (f.advertiser === "unknown") q = q.or("advertiser_type.is.null,advertiser_type.eq.unknown");
  else if (f.advertiser) q = q.eq("advertiser_type", f.advertiser);

  // "contacted" se queda sin tocar aquí (ver el comentario del tipo): el
  // resto de gestión sí son columnas planas.
  if (f.gestion === "assigned") q = q.not("assigned_to", "is", null);
  else if (f.gestion === "unmanaged") q = q.is("assigned_to", null);
  else if (f.gestion === "mine") {
    q = f.currentUserId ? q.eq("assigned_to", f.currentUserId) : q.eq("id", IMPOSSIBLE_ID);
  }

  return q;
}

export async function getParticularesPage(opts?: {
  /** Si se pasa junto a `pageSize`, activa paginación real server-side en
   *  vez del comportamiento histórico de traer todo. */
  offset?: number;
  /** Presente → pagina de verdad (una sola tanda, `total` = count exacto). */
  pageSize?: number;
  /** Con paginación real: activos (default) o retirados. */
  showRetired?: boolean;
  /** Filtros de la URL, resueltos a WHERE de SQL — ver ParticularesFilters. */
  filters?: ParticularesFilters;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  // Intentos de más completo a más básico según migraciones aplicadas:
  // 0036 (plano/vídeo) → 0035 (address, phone_confidence) → 0034 (assigned_*)
  // → 0024 (particular_reference) → 0012 (advertiser_type) → base.
  const attempts = [
    `${BASE_COLUMNS}, advertiser_type, address, phone_confidence, particular_reference, assigned_to, assigned_at, ${MEDIA_COLUMNS_0036}`,
    `${BASE_COLUMNS}, advertiser_type, address, phone_confidence, particular_reference, assigned_to, assigned_at`,
    `${BASE_COLUMNS}, advertiser_type, address, phone_confidence, particular_reference`,
    `${BASE_COLUMNS}, advertiser_type, particular_reference, assigned_to, assigned_at`,
    `${BASE_COLUMNS}, advertiser_type, particular_reference`,
    `${BASE_COLUMNS}, advertiser_type`,
    BASE_COLUMNS,
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];
  let total = 0;
  let lastError: { message: string } | null = null;

  if (opts?.pageSize) {
    // Paginación real: una sola tanda (offset/limit reales contra Postgres,
    // no el "traer todo y trocear en JS" de abajo), con el total exacto de
    // esa pestaña (activos o retirados) vía count de PostgREST.
    const offset = Math.max(0, opts.offset ?? 0);
    const pageSize = Math.max(1, opts.pageSize);
    const showRetired = opts.showRetired ?? false;
    for (const cols of attempts) {
      let query = supabase
        .from("particulares")
        .select(cols, { count: "exact" })
        .eq("is_active", !showRetired);
      query = applyParticularesFilters(query, opts.filters ?? {}, cols.includes("address"));
      query = showRetired
        ? query.order("taken_down_at", { ascending: false, nullsFirst: false })
        : query.order("created_at", { ascending: false });
      // try/catch, no solo `res.error`: un `.in("id", idsInZone)` con miles
      // de ids (zona dibujada grande) puede hacer que la petición a
      // PostgREST falle a nivel de red/HTTP (URL demasiado larga) — eso
      // RECHAZA la promesa, no devuelve `{error}`, y sin este try/catch
      // tumbaba la página igual que el `throw` de abajo que reemplaza.
      try {
        const res = await query.range(offset, offset + pageSize - 1);
        if (res.error) {
          lastError = res.error;
          continue;
        }
        rows = res.data ?? [];
        total = res.count ?? rows.length;
        lastError = null;
        break;
      } catch (err) {
        lastError = { message: err instanceof Error ? err.message : "query_failed" };
        continue;
      }
    }
    if (lastError) {
      // Antes tiraba la página entera abajo (throw) si las 7 variantes de
      // columnas fallaban igual. Con el filtro de zona dibujada eso dejó de
      // ser "solo pasa si la BD está realmente rota": un polígono grande
      // puede devolver miles de ids, y el `.in("id", idsInZone)` de
      // applyParticularesFilters genera una URL tan larga que la petición a
      // PostgREST falla — las 7 variantes fallan igual (todas llevan el
      // mismo filtro), así que antes SIEMPRE terminaba en throw. Degradar a
      // "0 anuncios" es mejor que tumbar /admin/particulares entero por
      // dibujar una zona grande.
      console.error("[particulares] getParticularesPage: fallaron todas las variantes de columnas", lastError);
      return finishEnrichment(supabase, [], 0);
    }
    return finishEnrichment(supabase, rows, total);
  }

  for (const cols of attempts) {
    // ACTIVOS: todos, sin límite (por lotes de 1000 para sortear el tope
    // de filas por request de PostgREST).
    const actives = await fetchAllRows((from, to) =>
      supabase
        .from("particulares")
        .select(cols)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    if (actives.error) {
      lastError = actives.error;
      continue;
    }
    rows = actives.rows;
    total = actives.rows.length;
    lastError = null;

    // RETIRADOS (mismas columnas): también todos, sin límite, para que el
    // tab "Retirados" del cliente muestre todo lo que hay en la BD.
    const retired = await fetchAllRows((from, to) =>
      supabase
        .from("particulares")
        .select(cols)
        .eq("is_active", false)
        .order("taken_down_at", { ascending: false, nullsFirst: false })
        .range(from, to),
    );
    if (!retired.error) {
      rows = [...rows, ...retired.rows];
    }
    break;
  }
  if (lastError) throw new Error(lastError.message);
  return finishEnrichment(supabase, rows, total);
}

// Segunda mitad, compartida por las dos formas de traer `rows` (paginación
// real vs. el histórico "traer todo"): añade asignación + último contacto +
// nº de contactos por anuncio (particulares_contacts + profiles).
async function finishEnrichment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  total: number,
) {
  const ids = rows.map((r) => r.id);
  const advisorIds = new Set<string>(
    rows.map((r) => r.assigned_to).filter(Boolean),
  );

  // Último contacto + nº de contactos por anuncio (particulares_contacts).
  const lastContacts = new Map<
    string,
    { advisor_id: string; contact_type: string; contacted_at: string }
  >();
  const contactCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: contacts, error: contactsErr } = await supabase
      .from("particulares_contacts")
      .select("particular_id, advisor_id, contact_type, contacted_at")
      .in("particular_id", ids)
      .order("contacted_at", { ascending: false });
    if (!contactsErr) {
      for (const c of contacts ?? []) {
        contactCounts.set(
          c.particular_id,
          (contactCounts.get(c.particular_id) ?? 0) + 1,
        );
        if (!lastContacts.has(c.particular_id)) {
          lastContacts.set(c.particular_id, c);
          advisorIds.add(c.advisor_id);
        }
      }
    }
  }

  // Nombres de los asesores implicados (asignados o que contactaron).
  const names = new Map<string, string>();
  if (advisorIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(advisorIds));
    for (const p of profs ?? []) {
      names.set(p.id, (p.full_name as string) || (p.email as string));
    }
  }

  const enriched: EnrichedParticularRow[] = rows.map((r) => {
    const lc = lastContacts.get(r.id);
    return {
      ...r,
      assigned_to: r.assigned_to ?? null,
      assigned_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
      last_contact_at: lc?.contacted_at ?? null,
      last_contact_by: lc ? (names.get(lc.advisor_id) ?? null) : null,
      last_contact_type: lc?.contact_type ?? null,
      contact_count: contactCounts.get(r.id) ?? 0,
    };
  });

  return { rows: enriched, total };
}

/**
 * Opciones de staff para el desplegable de asignación.
 * @param country Si se pasa, filtra a staff que puede acceder a ese país:
 *   owner/admin (acceso total), usuarios marcados `multi_country`, o cuyo
 *   `country` coincide. Sin `country`, devuelve todo el staff (comportamiento
 *   histórico, usado por particulares que ya es España-only por su propia página).
 */
export async function getStaffOptions(
  country?: "es" | "cl",
): Promise<Array<{ id: string; name: string }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const query = supabase
    .from("profiles")
    .select("id, full_name, email, role, country, multi_country")
    .in("role", [
      "owner",
      "admin",
      "advisor",
      "agent_junior",
      "agent_senior",
      "agent_admin",
    ])
    .order("full_name");
  const { data: allData } = await query;
  const data = country
    ? (allData ?? []).filter(
        (p: { role: string; country: string | null; multi_country: boolean | null }) =>
          p.role === "owner" ||
          p.role === "admin" ||
          p.multi_country ||
          (p.country ?? "es") === country,
      )
    : allData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    name: (p.full_name as string) || (p.email as string),
  }));
}

export type ParticularesStats = {
  /** Activos, SIN los filtros de la UI — así el header y la pestaña
   *  "Activos (N)" siempre muestran el total real, no el de la búsqueda en
   *  curso (igual que antes, cuando salían de `allRows` sin `filtered`). */
  total: number;
  retiredTotal: number;
  rent: number;
  sale: number;
  last24h: number;
  /** Activos con teléfono — total real, no solo el de la página visible. */
  withPhone: number;
};

/**
 * Cabecera del panel: 5 COUNT-only (`head: true`, sin traer filas) contra el
 * índice `(is_active, created_at desc)` de la migración 0111. Sustituye a
 * derivar estos 5 números en JS sobre las ~10.7k filas enriquecidas que
 * antes traía la página entera.
 */
export async function getParticularesStats(): Promise<ParticularesStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [total, retiredTotal, rent, sale, last24h, withPhone] = await Promise.all([
    supabase.from("particulares").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("particulares").select("*", { count: "exact", head: true }).eq("is_active", false),
    supabase
      .from("particulares")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("operation", "rent"),
    supabase
      .from("particulares")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("operation", "sale"),
    supabase
      .from("particulares")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .gte("created_at", since),
    supabase
      .from("particulares")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .not("phone", "is", null),
  ]);

  return {
    total: total.count ?? 0,
    retiredTotal: retiredTotal.count ?? 0,
    rent: rent.count ?? 0,
    sale: sale.count ?? 0,
    last24h: last24h.count ?? 0,
    withPhone: withPhone.count ?? 0,
  };
}

// Agrupa por distrito canónico de Madrid — mismo algoritmo que antes vivía
// en el `useMemo` de particulares-client.tsx sobre `allRows`; se movió aquí
// para poder calcularlo server-side sobre el dataset ligero de abajo, en vez
// de sobre las filas enriquecidas completas.
function buildZoneGroups(
  rows: Array<{ zone: string | null; is_active: boolean; phone: string | null }>,
  showRetired: boolean,
): ZoneFilterGroup[] {
  const districts = new Map<
    string,
    { total: number; missingPhone: number; zones: Map<string, { total: number; missingPhone: number }> }
  >();
  for (const r of rows) {
    if (showRetired ? r.is_active : !r.is_active) continue;
    if (!r.zone) continue;
    const { district } = normalizeZone(r.zone);
    if (!districts.has(district)) {
      districts.set(district, { total: 0, missingPhone: 0, zones: new Map() });
    }
    const d = districts.get(district)!;
    d.total++;
    if (!r.phone) d.missingPhone++;
    if (!d.zones.has(r.zone)) d.zones.set(r.zone, { total: 0, missingPhone: 0 });
    const z = d.zones.get(r.zone)!;
    z.total++;
    if (!r.phone) z.missingPhone++;
  }
  return Array.from(districts.entries())
    .sort((a, b) => {
      if (a[0] === OTHER_ZONE_LABEL) return 1;
      if (b[0] === OTHER_ZONE_LABEL) return -1;
      return a[0].localeCompare(b[0], "es");
    })
    .map(([district, d]) => ({
      district,
      total: d.total,
      missingPhone: d.missingPhone,
      zones: Array.from(d.zones.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "es"))
        .map(([name, c]) => ({ name, total: c.total, missingPhone: c.missingPhone })),
    }));
}

function buildPortalCounts(rows: Array<{ portal: string; is_active: boolean }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.is_active) continue;
    counts[r.portal] = (counts[r.portal] ?? 0) + 1;
  }
  return counts;
}

/**
 * Dataset ligero para el desplegable de zonas y el desglose por portal: solo
 * zone/is_active/phone/portal de TODOS los anuncios (activos y retirados),
 * sin enrichment (nada de particulares_contacts ni profiles) ni columnas
 * pesadas (description/features/photos). Sigue recorriendo la tabla
 * entera — el desplegable necesita contar TODAS las zonas, no solo la
 * página visible — pero 4 columnas cortas sin JOINs es una fracción mínima
 * del payload que traía el listado completo.
 */
export async function getParticularesZoneCounts(
  showRetired: boolean,
): Promise<{ zoneGroups: ZoneFilterGroup[]; portalCounts: Record<string, number> }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any;
    const { rows, error } = await fetchAllRows((from, to) =>
      supabase.from("particulares").select("zone, is_active, phone, portal").range(from, to),
    );
    if (error) {
      console.error("[particulares] getParticularesZoneCounts: error de BD", error);
      return { zoneGroups: [], portalCounts: {} };
    }
    return {
      zoneGroups: buildZoneGroups(rows, showRetired),
      portalCounts: buildPortalCounts(rows),
    };
  } catch (err) {
    // El desplegable de zonas/el desglose por portal son secundarios frente
    // a poder ver el listado — nunca deben tumbar la página entera.
    console.error("[particulares] getParticularesZoneCounts: excepción", err);
    return { zoneGroups: [], portalCounts: {} };
  }
}

/**
 * Resuelve el filtro de "zona dibujada en el mapa" a la lista EXACTA de ids
 * que caen dentro de alguno de los polígonos — mismo criterio de disciplina
 * que getParticularesZoneCounts(): 3 columnas cortas (id, latitude,
 * longitude), NUNCA la fila enriquecida completa, y el point-in-polygon se
 * hace en Node (ray casting, lib/zone-polygon.ts) porque no hay PostGIS en
 * este esquema. `showRetired` reduce cuánto hay que traer y calcular — no
 * cambia el resultado semántico (la ubicación no depende de si el anuncio
 * sigue activo), pero como page.tsx ya sabe qué pestaña se está mirando, no
 * tiene sentido escanear la otra mitad de la tabla en vano.
 */
export async function getParticularesIdsInPolygons(
  polygons: ZonePolygon[],
  showRetired: boolean,
): Promise<string[]> {
  if (polygons.length === 0) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any;
    const { rows, error } = await fetchAllRows((from, to) =>
      supabase
        .from("particulares")
        .select("id, latitude, longitude")
        .eq("is_active", !showRetired)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .range(from, to),
    );
    if (error) {
      console.error("[particulares] getParticularesIdsInPolygons: error de BD", error);
      return [];
    }
    return rows
      .filter((r) => isPointInAnyPolygon([r.longitude as number, r.latitude as number], polygons))
      .map((r) => r.id as string);
  } catch (err) {
    // Nunca dejar que un fallo aquí (red, dato inesperado…) tumbe la página
    // entera de particulares: sin resultado de zona es "no hay match", no
    // un 500. Se registra para poder diagnosticarlo en los logs del VPS.
    console.error("[particulares] getParticularesIdsInPolygons: excepción", err);
    return [];
  }
}
