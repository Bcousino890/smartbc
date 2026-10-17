import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "../admin";
import { buildSearchPlan } from "@/lib/particulares/search-clauses";
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

// `description` y `features` NO van en el listado (la tarjeta no los pinta, ≈50 %
// del payload de la página): la ficha los pide con el resto del detalle en
// /api/admin/particulares/detail.
const BASE_COLUMNS =
  "id, portal, external_id, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, cover_url, owner_name, phone, chat_only, latitude, longitude, location_precision, taken_down_at, detected_at, created_at, updated_at, is_active, fuera_de_zona:scraper_extra->>fuera_de_zona";

// Columnas de la migración 0036 (plano + vídeo). Pueden no existir aún en el
// VPS — por eso van en intentos separados (degradación elegante).
const MEDIA_COLUMNS_0036 =
  "has_floor_plan, floor_plan_url, has_video, video_url";

// Columnas de la migración 0176 (enlace de anuncios del mismo inmueble). Pueden
// no existir aún en el VPS — por eso van en su propio intento (degradación
// elegante, como las de 0034/0035/0036).
const LINK_COLUMNS_0176 = "duplicate_of, link_summary, link_ops";

// Columnas de la migración 0158 (ficha técnica): bajada de precio para el badge «Bajó %».
const DROP_COLUMNS_0158 = "price_drop_pct, previous_price";

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
/** Orden del listado. "" = el de siempre (más reciente primero; en la
 *  pestaña de retirados, por fecha de baja). El resto los elige el usuario
 *  desde el desplegable "Ordenar". */
export type ParticularesSort =
  | ""
  | "oldest"
  | "price_desc"
  | "price_asc"
  | "area_desc"
  | "area_asc";

export const PARTICULARES_SORT_VALUES: readonly ParticularesSort[] = [
  "",
  "oldest",
  "price_desc",
  "price_asc",
  "area_desc",
  "area_asc",
] as const;

export type ParticularesFilters = {
  search?: string;
  operation?: "rent" | "sale" | "";
  /** Lista EXACTA de `zone` crudos a incluir, ya resuelta en page.tsx
   *  contra getParticularesZoneCounts() — el mismo criterio que ve el
   *  desplegable, en vez de reimplementar normalizeZone() en SQL. Admite
   *  VARIOS distritos/barrios a la vez (el desplegable es multi-selección):
   *  page.tsx expande cada "d:<distrito>" a sus barrios y une todo aquí.
   *  `[]` (definido pero vacío) significa "el usuario filtró por zonas que
   *  no existen" → cero resultados, distinto de `undefined` = sin filtro. */
  zoneNames?: string[];
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
  /** Agencias (`agency_key`, migración 0185): solo anuncios de ALGUNA de ellas. */
  agencyKeys?: string[];
  /** Agencias excluidas: los anuncios de estas agencias no salen (los demás sí, también los de particulares). */
  excludeAgencyKeys?: string[];
  /** Búsqueda de texto en TODOS los estados: sin filtrar activos/retirados y sin ocultar las copias enlazadas. */
  searchAllStates?: boolean;
  /** Portal de origen (`portal`: "idealista", "fotocasa", "pisos"…). Es una
   *  columna base, así que no necesita degradación por migración. */
  portal?: string;
  sort?: ParticularesSort;
  /** €/m² — detecta el sobrevalorado (no alquila → propietario receptivo en
   *  unas semanas) y el chollo. Columna `price_per_m2` (migración 0158). */
  pricePerM2Min?: number;
  pricePerM2Max?: number;
  /** Bajada de precio MÍNIMA en % (`price_drop_pct`). 0 = "cualquier bajada"
   *  (solo exige que el campo tenga valor). Quien ya bajó el precio es quien
   *  más escucha una propuesta de gestión. */
  priceDropMinPct?: number;
  /** Antigüedad en cartera: solo anuncios detectados hace MÁS de N días.
   *  Ojo: `created_at` es cuándo lo detectamos NOSOTROS, no cuándo lo
   *  publicó el portal (ese dato no se guarda en `particulares`), así que
   *  es un suelo, no la antigüedad real del anuncio. */
  minDaysListed?: number;
  /** Ascensor (`has_lift`). "no" incluye solo los que dicen explícitamente
   *  que no lo tienen; los que no traen el dato quedan fuera de ambos. */
  lift?: "yes" | "no" | "";
  /** Estado del inmueble. `condition` es texto libre del portal, así que se
   *  compara con ILIKE por familias en vez de con un enum que no controlamos. */
  condition?: string[];
  yearBuiltMin?: number;
  yearBuiltMax?: number;
  /** Por defecto el listado oculta los anuncios que son COPIA de otro (mismo
   *  inmueble en otro portal / operación — migración 0176): se ven dentro de
   *  la ficha del principal. `true` los muestra todos. */
  showDuplicates?: boolean;
  /** Baños mínimos. */
  bathroomsMin?: number;
  /** Planta (columna `floor_num`, migración 0179): 0 = bajo, -1 = sótano. */
  floorMin?: number;
  floorMax?: number;
  /** Etiquetas de `attrs` (migración 0178) que el anuncio DEBE tener todas: piscina, terraza… */
  extras?: string[];
  /** Tipos de inmueble (etiquetas de `attrs`): basta con uno (atico, chalet, adosado…). */
  types?: string[];
  /** Letras de eficiencia energética (A–G) admitidas. */
  energy?: string[];
  /** Orientación contiene: sur | norte | este | oeste. */
  orientation?: string;
  /** Detectado en los últimos N días (1, 2, 7, 30). */
  sinceDays?: number;
  /** Dormitorios / baños EXACTOS (en vez de «N o más»). 6+ y 7+ siguen siendo «o más». */
  bedroomsExact?: boolean;
  bathroomsExact?: boolean;
  areaMax?: number;
  /** Como mucho N días desde que lo detectamos (par de `minDaysListed`). */
  maxDaysListed?: number;
  /** Parcela en m² (columna `plot_m2`, migración 0183). */
  plotMin?: number;
  plotMax?: number;
  /** Solo coordenada exacta (`location_precision = 'exact'`). */
  exactLocation?: boolean;
  /** Amueblado sí/no (etiquetas `amueblado` / `sin_amueblar` de `attrs`). */
  furnished?: "yes" | "no" | "";
  /** Alquiler de larga duración o de temporada (etiqueta `temporada`). */
  rentalKind?: "larga" | "temporada" | "";
  /** Por defecto se ocultan los anuncios FUERA DE ZONA (`scraper_extra.fuera_de_zona`):
   *  su zona ya no está marcada en Sindicación y el crawler dejó de rastrearlos. `true` los incluye. */
  showOutOfZone?: boolean;
};

/** Excluye los marcados `scraper_extra.fuera_de_zona = true` (los NULL pasan: `neq` solo los descartaría). */
export const NOT_FUERA_DE_ZONA = "scraper_extra->>fuera_de_zona.is.null,scraper_extra->>fuera_de_zona.neq.true";

/** Estado del inmueble → etiquetas de `attrs` (migración 0183). Incluye los valores antiguos. */
export const PARTICULARES_CONDITION_TAGS: Record<string, string[]> = {
  nuevo: ["cond_nuevo"],
  usado: ["cond_usado"],
  muy_bueno: ["cond_muy_bueno"],
  bueno: ["cond_bueno"],
  reformar: ["cond_reformar"],
  reformado: ["cond_reformado"],
  good: ["cond_bueno", "cond_muy_bueno"],
  to_reform: ["cond_reformar"],
  renovated: ["cond_nuevo", "cond_reformado"],
};

/** Etiquetas válidas de `attrs` (la URL es input del usuario: solo se aceptan estas). */
export const PARTICULARES_ATTR_TAGS = [
  "aire", "armarios", "terraza", "balcon", "jardin", "piscina", "garaje", "trastero", "ascensor",
  "amueblado", "accesible", "calefaccion", "calefaccion_central", "parquet", "videoportero",
  "obra_nueva", "exterior", "interior", "atico", "duplex", "estudio", "adosado", "pareado", "chalet", "rustica",
  "loft", "patio", "sin_amueblar", "vistas", "vistas_mar", "vistas_sierra", "vistas_despejadas", "vistas_jardin", "temporada",
] as const;

/**
 * Orden del listado. SIEMPRE termina desempatando por `id`: sin eso, dos
 * anuncios con el mismo precio (o los mismos m²) pueden salir en distinto
 * orden en dos peticiones, y con paginación server-side eso hace que una
 * fila aparezca repetida en la página 2 y otra no salga nunca.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyParticularesSort(query: any, sort: ParticularesSort | undefined, showRetired: boolean) {
  // nullsFirst: false en precio/superficie — un anuncio sin dato no debe
  // encabezar un "de mayor a menor".
  const opts = (ascending: boolean) => ({ ascending, nullsFirst: false });
  let q = query;
  switch (sort) {
    case "oldest":
      q = q.order("created_at", opts(true));
      break;
    case "price_desc":
      q = q.order("price", opts(false));
      break;
    case "price_asc":
      q = q.order("price", opts(true));
      break;
    case "area_desc":
      q = q.order("square_meters", opts(false));
      break;
    case "area_asc":
      q = q.order("square_meters", opts(true));
      break;
    default:
      // El de siempre: en retirados manda la fecha de baja, en activos la de alta.
      q = showRetired
        ? q.order("taken_down_at", opts(false))
        : q.order("created_at", opts(false));
      break;
  }
  return q.order("id", { ascending: false });
}

/** Claves de agencia (la URL es input del usuario): texto corto, sin comillas ni barras. */
const okAgencyKey = (k: string) => k.length > 0 && k.length <= 120 && !/["\\]/.test(k);
/** Valor dentro de `not.in.(…)`: entre comillas porque puede llevar comas, paréntesis o espacios. */
const quoteKey = (k: string) => `"${k}"`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyParticularesFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  f: ParticularesFilters,
  hasAddress: boolean,
  hasLinks = false,
) {
  let q = query;
  if (!f.showOutOfZone) q = q.or(NOT_FUERA_DE_ZONA);
  // Un inmueble con venta Y alquiler enlazados es UNA fila (la del principal):
  // si se filtra por operación hay que mirar también las de sus enlazados.
  if (hasLinks && !f.showDuplicates && !(f.searchAllStates && f.search?.trim())) q = q.is("duplicate_of", null);
  const plan = buildSearchPlan(f.search ?? "", hasAddress);
  if (plan?.groups) for (const g of plan.groups) q = q.or(g.join(","));
  else if (plan) q = q.or(plan.clauses.join(","));

  if (f.operation) {
    q = hasLinks
      ? q.or(`operation.eq.${f.operation},link_ops.cs.{${f.operation}}`)
      : q.eq("operation", f.operation);
  }

  // `idsInZone` (zona dibujada en el mapa) gana sobre el desplegable de
  // distrito/barrio si por lo que sea llegaran los dos a la vez — en la
  // práctica no pasa, use-particulares-filters.ts limpia uno al fijar el
  // otro, pero un `else` deja claro que no se combinan como AND.
  if (f.idsInZone) {
    q = f.idsInZone.length > 0 ? q.in("id", f.idsInZone) : q.eq("id", IMPOSSIBLE_ID);
  } else if (f.zoneNames) {
    q = f.zoneNames.length > 0 ? q.in("zone", f.zoneNames) : q.eq("id", IMPOSSIBLE_ID);
  }

  if (f.priceMin != null) q = q.gte("price", f.priceMin);
  if (f.priceMax != null) q = q.lte("price", f.priceMax);
  if (f.bedroomsMin != null) {
    // Exacto (0–5): igualdad; 0 incluye los estudios sin dato de dormitorios. 6+ es «6 o más».
    if (f.bedroomsExact && f.bedroomsMin < 6) {
      q =
        f.bedroomsMin === 0
          ? q.or("bedrooms.eq.0,and(bedrooms.is.null,attrs.cs.{estudio})")
          : q.eq("bedrooms", f.bedroomsMin);
    } else q = q.gte("bedrooms", f.bedroomsMin);
  }
  if (f.areaMin != null) q = q.gte("square_meters", f.areaMin);
  if (f.areaMax != null) q = q.lte("square_meters", f.areaMax);
  if (f.bathroomsMin != null) {
    q = f.bathroomsExact && f.bathroomsMin < 7 ? q.eq("bathrooms", f.bathroomsMin) : q.gte("bathrooms", f.bathroomsMin);
  }
  if (f.plotMin != null) q = q.gte("plot_m2", f.plotMin);
  if (f.plotMax != null) q = q.lte("plot_m2", f.plotMax);
  if (f.exactLocation) q = q.eq("location_precision", "exact");
  if (f.furnished === "yes") q = q.contains("attrs", ["amueblado"]);
  else if (f.furnished === "no") q = q.contains("attrs", ["sin_amueblar"]);
  if (f.rentalKind === "temporada") q = q.contains("attrs", ["temporada"]);
  else if (f.rentalKind === "larga") q = q.not("attrs", "cs", "{temporada}");
  if (f.floorMin != null) q = q.gte("floor_num", f.floorMin);
  if (f.floorMax != null) q = q.lte("floor_num", f.floorMax);

  // Atributos (migración 0178): solo etiquetas conocidas.
  const okTag = (t: string) => (PARTICULARES_ATTR_TAGS as readonly string[]).includes(t);
  const extras = (f.extras ?? []).filter(okTag);
  if (extras.length) q = q.contains("attrs", extras);
  const types = (f.types ?? []).filter(okTag);
  if (types.length) q = q.overlaps("attrs", types);
  const energy = (f.energy ?? []).filter((l) => /^[A-G]$/.test(l));
  if (energy.length) q = q.in("energy_consumption", energy);
  if (f.orientation && ["sur", "norte", "este", "oeste"].includes(f.orientation)) {
    q = q.ilike("orientation", `%${f.orientation}%`);
  }
  if (f.sinceDays != null && f.sinceDays > 0) {
    q = q.gte("created_at", new Date(Date.now() - f.sinceDays * 24 * 60 * 60 * 1000).toISOString());
  }

  if (f.last24h) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("created_at", since);
  }

  if (f.phoneFilter === "no_phone") q = q.is("phone", null);
  else if (f.phoneFilter === "with_phone") q = q.not("phone", "is", null);

  if (f.advertiser === "unknown") q = q.or("advertiser_type.is.null,advertiser_type.eq.unknown");
  else if (f.advertiser) q = q.eq("advertiser_type", f.advertiser);

  const agencyKeys = (f.agencyKeys ?? []).filter(okAgencyKey);
  if (agencyKeys.length) q = q.in("agency_key", agencyKeys);
  const noAgency = (f.excludeAgencyKeys ?? []).filter(okAgencyKey);
  // `not.in` descartaría también los NULL (particulares): se dejan pasar a propósito.
  if (noAgency.length) q = q.or(`agency_key.is.null,agency_key.not.in.(${noAgency.map(quoteKey).join(",")})`);

  if (f.portal) q = q.eq("portal", f.portal);

  // "contacted" se queda sin tocar aquí (ver el comentario del tipo): el
  // resto de gestión sí son columnas planas.
  if (f.gestion === "assigned") q = q.not("assigned_to", "is", null);
  else if (f.gestion === "unmanaged") q = q.is("assigned_to", null);
  else if (f.gestion === "mine") {
    q = f.currentUserId ? q.eq("assigned_to", f.currentUserId) : q.eq("id", IMPOSSIBLE_ID);
  }

  // ── Filtros de ficha técnica (columnas de la migración 0158) ─────────────
  if (f.pricePerM2Min != null) q = q.gte("price_per_m2", f.pricePerM2Min);
  if (f.pricePerM2Max != null) q = q.lte("price_per_m2", f.pricePerM2Max);

  if (f.priceDropMinPct != null) {
    // El scraper guarda la bajada como porcentaje positivo. Con 0 basta con
    // que EXISTA el dato ("ha bajado alguna vez"); con un umbral, además
    // tiene que llegar a él.
    q = q.not("price_drop_pct", "is", null);
    if (f.priceDropMinPct > 0) q = q.gte("price_drop_pct", f.priceDropMinPct);
  }

  if (f.minDaysListed != null && f.minDaysListed > 0) {
    const before = new Date(Date.now() - f.minDaysListed * 24 * 60 * 60 * 1000).toISOString();
    q = q.lte("created_at", before);
  }

  if (f.maxDaysListed != null && f.maxDaysListed > 0) {
    q = q.gte("created_at", new Date(Date.now() - f.maxDaysListed * 24 * 60 * 60 * 1000).toISOString());
  }

  if (f.lift === "yes") q = q.eq("has_lift", true);
  else if (f.lift === "no") q = q.eq("has_lift", false);

  // Estado: etiquetas `cond_*` de `attrs` (migración 0183), que unifican el
  // texto de Idealista («Segunda mano/buen estado», «Second hand/…») y el
  // `conservation` de Fotocasa. Basta con una de las elegidas.
  const condTags = [...new Set((f.condition ?? []).flatMap((c) => PARTICULARES_CONDITION_TAGS[c] ?? []))];
  if (condTags.length) q = q.overlaps("attrs", condTags);

  if (f.yearBuiltMin != null) q = q.gte("year_built", f.yearBuiltMin);
  if (f.yearBuiltMax != null) q = q.lte("year_built", f.yearBuiltMax);

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
    // 0186: `title` (título del anuncio; `address` ya es solo la dirección).
    `${BASE_COLUMNS}, advertiser_type, title, address, phone_confidence, particular_reference, assigned_to, assigned_at, ${MEDIA_COLUMNS_0036}, ${LINK_COLUMNS_0176}, ${DROP_COLUMNS_0158}`,
    `${BASE_COLUMNS}, advertiser_type, address, phone_confidence, particular_reference, assigned_to, assigned_at, ${MEDIA_COLUMNS_0036}, ${LINK_COLUMNS_0176}, ${DROP_COLUMNS_0158}`,
    `${BASE_COLUMNS}, advertiser_type, address, phone_confidence, particular_reference, assigned_to, assigned_at, ${MEDIA_COLUMNS_0036}, ${LINK_COLUMNS_0176}`,
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
    const anyState = Boolean(opts.filters?.searchAllStates && opts.filters.search?.trim());
    for (const cols of attempts) {
      let query = supabase
        .from("particulares")
        .select(cols, { count: "exact" });
      // Búsqueda de texto: mira en TODOS los estados (activos primero, luego retirados).
      if (!anyState) query = query.eq("is_active", !showRetired);
      query = applyParticularesFilters(query, opts.filters ?? {}, cols.includes("address"), cols.includes("duplicate_of"));
      if (anyState) query = query.order("is_active", { ascending: false });
      query = applyParticularesSort(query, opts.filters?.sort, showRetired && !anyState);
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
      // `failed` deja que la lista pinte un estado de error con "Reintentar"
      // en vez de un "0 anuncios" que parecería un resultado legítimo.
      return { ...(await finishEnrichment(supabase, [], 0)), failed: true as const };
    }
    return { ...(await finishEnrichment(supabase, rows, total)), failed: false as const };
  }

  for (const cols of attempts) {
    // ACTIVOS: todos, sin límite (por lotes de 1000 para sortear el tope
    // de filas por request de PostgREST).
    const hideDup = cols.includes("duplicate_of");
    const actives = await fetchAllRows((from, to) => {
      const q = supabase.from("particulares").select(cols).eq("is_active", true);
      return (hideDup ? q.is("duplicate_of", null) : q)
        .order("created_at", { ascending: false })
        .range(from, to);
    });
    if (actives.error) {
      lastError = actives.error;
      continue;
    }
    rows = actives.rows;
    total = actives.rows.length;
    lastError = null;

    // RETIRADOS (mismas columnas): también todos, sin límite, para que el
    // tab "Retirados" del cliente muestre todo lo que hay en la BD.
    const retired = await fetchAllRows((from, to) => {
      const q = supabase.from("particulares").select(cols).eq("is_active", false);
      return (hideDup ? q.is("duplicate_of", null) : q)
        .order("taken_down_at", { ascending: false, nullsFirst: false })
        .range(from, to);
    });
    if (!retired.error) {
      rows = [...rows, ...retired.rows];
    }
    break;
  }
  if (lastError) throw new Error(lastError.message);
  return { ...(await finishEnrichment(supabase, rows, total)), failed: false as const };
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

/** Staff para el desplegable de asignación, cacheado 60 s (casi nunca cambia y se pedía en cada filtro). */
export const getStaffOptionsCached: () => Promise<Array<{ id: string; name: string }>> = unstable_cache(
  () => getStaffOptions(),
  ["particulares-staff-options"],
  { revalidate: 60 },
);

export type ParticularesStats = {
  /** PARTICULARES activos (no agencias) y sin copias enlazadas: exactamente lo
   *  que lista la pantalla por defecto. Antes contaba TODOS los anuncios
   *  activos (≈44k, con ≈34k de agencias) y el rótulo "Total particulares"
   *  mentía. Sigue sin depender de los filtros de la UI. */
  total: number;
  /** Particulares retirados (pestaña "Retirados"). */
  retiredTotal: number;
  rent: number;
  sale: number;
  /** Particulares activos detectados en las últimas 24 h. */
  last24h: number;
  /** Particulares activos con teléfono — total real, no solo el de la página visible. */
  withPhone: number;
};

/**
 * Cabecera del panel: 6 COUNT-only (`head: true`, sin traer filas), SOLO de
 * particulares (`advertiser_type = 'particular'`) y sin las copias enlazadas
 * (`duplicate_of is null`, migración 0176) — el mismo universo que muestra la
 * lista por defecto, para que cabecera y listado no se contradigan.
 *
 * Degrada como getParticularesPage(): si el VPS aún no tiene la columna
 * `duplicate_of` (0176) o `advertiser_type` (0012), reintenta sin ese filtro
 * en vez de devolver ceros.
 */
export const getParticularesStats: () => Promise<ParticularesStats> = unstable_cache(
  () => computeParticularesStats(),
  ["particulares-stats-v2"],
  { revalidate: 30 },
);

async function computeParticularesStats(): Promise<ParticularesStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const variants = [
    { advertiser: true, links: true },
    { advertiser: true, links: false },
    { advertiser: false, links: false },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type CountRes = { count: number | null; error: unknown };
  let last: CountRes[] = [];
  for (const v of variants) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = (build: (q: any) => any): PromiseLike<CountRes> => {
      let q = supabase.from("particulares").select("*", { count: "exact", head: true });
      if (v.advertiser) q = q.eq("advertiser_type", "particular");
      if (v.links) q = q.is("duplicate_of", null);
      // Los anuncios fuera de zona (ya no se rastrean) no cuentan en la cabecera.
      q = q.or(NOT_FUERA_DE_ZONA);
      return build(q);
    };
    last = await Promise.all([
      count((q) => q.eq("is_active", true)),
      count((q) => q.eq("is_active", false)),
      count((q) => q.eq("is_active", true).eq("operation", "rent")),
      count((q) => q.eq("is_active", true).eq("operation", "sale")),
      count((q) => q.eq("is_active", true).gte("created_at", since)),
      count((q) => q.eq("is_active", true).not("phone", "is", null)),
    ]);
    if (!last.some((r) => r.error)) break;
  }
  const [total, retiredTotal, rent, sale, last24h, withPhone] = last;

  return {
    total: total.count ?? 0,
    retiredTotal: retiredTotal.count ?? 0,
    rent: rent.count ?? 0,
    sale: sale.count ?? 0,
    last24h: last24h.count ?? 0,
    withPhone: withPhone.count ?? 0,
  };
}

/** Fila ya agregada (zona + municipio + estado + portal) con sus conteos. */
type ZoneCountRow = {
  zone: string | null;
  municipality: string | null;
  is_active: boolean;
  portal: string;
  total: number;
  missing_phone: number;
};

// Agrupa por distrito canónico de Madrid — mismo algoritmo que antes vivía
// en el `useMemo` de particulares-client.tsx sobre `allRows`; se movió aquí
// para poder calcularlo server-side sobre el dataset ligero de abajo, en vez
// de sobre las filas enriquecidas completas.
function buildZoneGroups(
  rows: ZoneCountRow[],
  showRetired: boolean,
): ZoneFilterGroup[] {
  const districts = new Map<
    string,
    {
      total: number;
      missingPhone: number;
      isMadrid: boolean;
      zones: Map<string, { total: number; missingPhone: number }>;
    }
  >();
  for (const r of rows) {
    if (showRetired ? r.is_active : !r.is_active) continue;
    if (!r.zone) continue;
    let { district } = normalizeZone(r.zone);
    // Fuera de Madrid capital (ojo: «Centro» de Villaviciosa no es el Centro de
    // Madrid): en vez de un cajón «Otras zonas», agrupar por municipio (el scraper lo guarda en scraper_extra.municipality).
    const muni = (r.municipality ?? "").trim();
    const isMadrid = !(muni && muni.toLowerCase() !== "madrid");
    if (!isMadrid) district = muni;
    if (!districts.has(district)) {
      districts.set(district, { total: 0, missingPhone: 0, isMadrid, zones: new Map() });
    }
    const d = districts.get(district)!;
    d.total += r.total;
    d.missingPhone += r.missing_phone;
    if (!d.zones.has(r.zone)) d.zones.set(r.zone, { total: 0, missingPhone: 0 });
    const z = d.zones.get(r.zone)!;
    z.total += r.total;
    z.missingPhone += r.missing_phone;
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
      isMadrid: d.isMadrid,
      zones: Array.from(d.zones.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "es"))
        .map(([name, c]) => ({ name, total: c.total, missingPhone: c.missingPhone })),
    }));
}

function buildPortalCounts(rows: ZoneCountRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.is_active) continue;
    counts[r.portal] = (counts[r.portal] ?? 0) + r.total;
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
  /** Acota el recuento a un tipo de anunciante (por defecto la lista solo
   *  enseña particulares, y el desplegable de zonas debe contar lo mismo; ver
   *  getParticularesStats). "" = todos, como antes. */
  advertiser: "particular" | "professional" | "unknown" | "" = "",
  /** Cuenta también los anuncios fuera de zona (por defecto no). */
  includeOutOfZone = false,
): Promise<{ zoneGroups: ZoneFilterGroup[]; portalCounts: Record<string, number> }> {
  try {
    const rows = await getZoneCountRows(advertiser, includeOutOfZone);
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
 * Conteos agregados por zona/municipio/estado/portal. Antes se bajaban ≈22k
 * filas en ≈22 peticiones secuenciales de 1000 (≈2 MB) EN CADA carga y cada
 * cambio de filtro; ahora es un GROUP BY en SQL (`particulares_zone_counts`,
 * migración 0190: ≈2k filas) y el resultado se cachea 60 s por tipo de
 * anunciante (los conteos del desplegable no necesitan ser al segundo).
 * Si la función aún no existe (migración sin aplicar) se usa el recorrido
 * antiguo.
 */
const getZoneCountRows = unstable_cache(
  async (advertiser: string, includeOutOfZone: boolean): Promise<ZoneCountRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any;
    // PostgREST corta CUALQUIER respuesta a 1.000 filas (db-max-rows) y esta función devuelve ≈2k grupos
    // (zona × municipio × activo × portal): sin paginar, los chips por portal y el desplegable de zonas
    // sumaban solo una parte (Idealista 18.731 en vez de 42.994). Se lee por páginas con un orden total
    // (el grupo es único por esas cuatro columnas), y si una página falla se cae al recorrido antiguo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcRows: any[] = [];
    let rpcError: unknown = null;
    for (let page = 0; page < 50; page++) {
      const res = await supabase
        .rpc("particulares_zone_counts", includeOutOfZone ? { p_advertiser: advertiser, p_include_fuera: true } : { p_advertiser: advertiser })
        .order("portal", { ascending: true })
        .order("zone", { ascending: true })
        .order("municipality", { ascending: true })
        .order("is_active", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (res.error || !Array.isArray(res.data)) {
        rpcError = res.error ?? new Error("rpc sin datos");
        break;
      }
      rpcRows.push(...res.data);
      if (res.data.length < 1000) break;
    }
    const rpc = { error: rpcError, data: rpcRows };
    if (!rpc.error && Array.isArray(rpc.data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (rpc.data as any[]).map((r) => ({
        zone: r.zone ?? null,
        municipality: r.municipality ?? null,
        is_active: Boolean(r.is_active),
        portal: String(r.portal),
        total: Number(r.total),
        missing_phone: Number(r.missing_phone),
      }));
    }
    // Filtrar en SQL (indexado) evita recorrer los ≈88k anuncios cuando solo se ven los ≈21k de particulares.
    const run = (withAdvertiser: boolean) =>
      fetchAllRows((from, to) => {
        let q = supabase.from("particulares").select("zone, is_active, phone, portal, municipality:scraper_extra->>municipality");
        if (!includeOutOfZone) q = q.or(NOT_FUERA_DE_ZONA);
        if (withAdvertiser && advertiser === "unknown") {
          q = q.or("advertiser_type.is.null,advertiser_type.eq.unknown");
        } else if (withAdvertiser && advertiser) {
          q = q.eq("advertiser_type", advertiser);
        }
        return q.range(from, to);
      });
    let { rows, error } = await run(true);
    // Sin la columna advertiser_type (migración 0012) → como antes, sin filtrar.
    if (error && advertiser) ({ rows, error } = await run(false));
    if (error) throw new Error(error.message);
    const agg = new Map<string, ZoneCountRow>();
    for (const r of rows) {
      const key = JSON.stringify([r.zone, r.municipality, r.is_active, r.portal]);
      let e = agg.get(key);
      if (!e) {
        e = { zone: r.zone, municipality: r.municipality ?? null, is_active: r.is_active, portal: r.portal, total: 0, missing_phone: 0 };
        agg.set(key, e);
      }
      e.total++;
      if (!r.phone) e.missing_phone++;
    }
    return [...agg.values()];
  },
  ["particulares-zone-counts-v2"],
  { revalidate: 60 },
);

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

export type ParticularesAgency = {
  /** Clave normalizada (`agency_key`): lo que viaja en la URL y en el filtro. */
  key: string;
  /** Nombre a mostrar (el más frecuente de sus variantes). */
  name: string;
  /** Anuncios activos / en total (activos + retirados). */
  active: number;
  total: number;
  portals: string[];
};

/**
 * Autocompletado de agencias (función SQL `particulares_agencies`, migración
 * 0185): agrupa por nombre normalizado, con nº de anuncios y portales. Sin
 * texto devuelve las de más anuncios activos. Si la migración aún no está
 * aplicada devuelve `unavailable` en vez de reventar.
 */
export async function getParticularesAgencies(
  q: string,
  limit = 20,
): Promise<{ agencies: ParticularesAgency[]; unavailable: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase.rpc("particulares_agencies", {
    p_q: q.trim().slice(0, 80) || null,
    p_limit: Math.max(1, Math.min(limit, 50)),
  });
  if (error) {
    console.error("[particulares] particulares_agencies", error.message);
    return { agencies: [], unavailable: true };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agencies = ((data ?? []) as any[]).map((r) => ({
    key: String(r.key),
    name: String(r.name ?? r.key),
    active: Number(r.active ?? 0),
    total: Number(r.total ?? 0),
    portals: Array.isArray(r.portals) ? (r.portals as string[]) : [],
  }));
  return { agencies, unavailable: false };
}

/** Nombres de las agencias elegidas (para los chips al cargar desde la URL). */
export async function getParticularesAgencyNames(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    [...new Set(keys)].slice(0, 20).map(async (k) => {
      const { agencies } = await getParticularesAgencies(k, 5);
      const hit = agencies.find((a) => a.key === k);
      if (hit) out[k] = hit.name;
    }),
  );
  return out;
}
