import "server-only";
import { createClient } from "../server";
import { briefFromRow } from "@/lib/clients/brief";
import {
  effectivePrice,
  evaluateMatch,
  exclusionLabel,
  zoneLikePattern,
} from "@/lib/clients/brief-match";

export type SuggestedProperty = {
  id: string;
  slug: string;
  title: string;
  zone: string;
  subzone: string | null;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number;
  price: number;
  currency: string | null;
  operation: "rent" | "sale";
  bcReference: string | null;
  photos: string[];
  matchScore: number;
  /** Por qué encaja. Las ve EL CLIENTE en su portal: solo cosas positivas. */
  matchReasons: string[];
  /**
   * Lo que el agente debe confirmar (dato que falta, se pasa del
   * presupuesto, la renta no cuadra con los ingresos…). Solo para el panel:
   * la ruta del portal del cliente las quita antes de responder.
   */
  matchWarnings: string[];
};

/** Fuera de la lista por chocar con el encargo, contado por motivo. */
export type ExcludedSummary = Array<{ label: string; count: number }>;

// El resultado distingue "no hay preferencias" de "la query falló". Antes las
// dos ramas devolvían [] y por eso un error de relación pasó meses sin que
// nadie lo notara: el bloque de la ficha simplemente decía "no hay resultados".
export type SuggestedPropertiesResult =
  | { ok: true; suggestions: SuggestedProperty[]; excluded?: ExcludedSummary }
  | { ok: false; reason: "no_preferences" }
  | { ok: false; reason: "error"; message: string };

type PhotoRow = { url: string; position: number; is_cover: boolean };

type PropertyRow = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  zone: string;
  subzone: string | null;
  bedrooms: number;
  bathrooms: number;
  square_meters: number | null;
  price: number | string;
  rent_price?: number | string | null;
  currency: string | null;
  operation: "rent" | "sale";
  operations?: string[] | null;
  stay?: string | null;
  property_type?: string | null;
  features?: string[] | null;
  features_manual?: string[] | null;
  floor_override?: string | null;
  available_from?: string | null;
  bc_reference: string | null;
  last_synced_at: string | null;
  updated_at: string | null;
  property_photos: PhotoRow[] | null;
};

// Hash corto y estable — mismo criterio que lib/db/adapters.ts, para que la
// URL del proxy cambie cuando cambian las fotos y no se sirva caché vieja.
function hashStrings(parts: string[]): string {
  const s = parts.join("|");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// URLs neutras vía el proxy /p/{slug}/{idx}. `property_photos.url` apunta a
// Storage y delata el portal de origen (…/synced/level/…), así que nunca debe
// salir de aquí tal cual.
export function proxyPhotoUrls(prop: PropertyRow): string[] {
  const seen = new Set<string>();
  const sorted = (prop.property_photos ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((p) => {
      if (!p.url || seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  const freshness = prop.last_synced_at ?? prop.updated_at ?? "";
  const v = hashStrings([...sorted.map((p) => p.url), freshness]);
  return sorted.map((_, i) => `/p/${prop.slug}/${i}?v=${v}`);
}

/** Cuántas propiedades se miran como mucho por cliente antes de puntuar. */
const CANDIDATE_LIMIT = 400;

/**
 * Propiedades sugeridas para un cliente, a partir de su encargo
 * (`client_preferences`, ver lib/clients/brief.ts).
 *
 * Dos pasos:
 *  1. SQL trae las candidatas con lo que la BD sabe filtrar sin ambigüedad:
 *     operación (incluidas las duales), precio, estancia SOLO en alquiler,
 *     zona/barrio y dormitorios.
 *  2. `evaluateMatch` (lib/clients/brief-match.ts, puro y con tests) descarta
 *     lo que choca con el encargo según el texto de la ficha (sin ascensor,
 *     interior, planta, tipo, amueblado, mascotas, obra nueva…), puntúa y
 *     separa las razones (las ve el cliente) de los avisos (solo el agente).
 *
 * `excluded` cuenta los descartes del paso 2 por motivo, para que el agente
 * vea qué se ha quedado fuera y por qué en vez de un "no hay resultados".
 *
 * `country` aísla el catálogo (un cliente de España no debe recibir
 * sugerencias de Chile). Sin el argumento no se filtra, que es el
 * comportamiento histórico.
 */
export async function getSuggestedProperties(
  clientId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts?: { country?: string; limit?: number; createdAfter?: string; supabase?: any },
): Promise<SuggestedPropertiesResult> {
  // El cron de property-alerts no tiene sesión de usuario (server-to-server,
  // sin cookies) — con el cliente normal, RLS bloquea todo. Le pasa su propio
  // admin client; el resto de llamadas (panel, con sesión de staff) sigue
  // usando el cliente normal por defecto.
  const supabase = opts?.supabase ?? (await createClient());

  const { data: prefsData, error: prefsError } = await supabase
    .from("client_preferences")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (prefsError) {
    console.error(
      "getSuggestedProperties: preferences query failed:",
      prefsError.message,
    );
    return { ok: false, reason: "error", message: prefsError.message };
  }
  if (!prefsData) return { ok: false, reason: "no_preferences" };

  const brief = briefFromRow(prefsData);
  const op = brief.operation;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("properties").select(`
      id,
      slug,
      title,
      description,
      zone,
      subzone,
      bedrooms,
      bathrooms,
      square_meters,
      price,
      rent_price,
      currency,
      operation,
      operations,
      stay,
      property_type,
      features,
      features_manual,
      floor_override,
      available_from,
      bc_reference,
      last_synced_at,
      updated_at,
      property_photos(url, position, is_cover)
    `) as any)
    .eq("status", "available")
    .is("archived_at", null);

  if (opts?.country) query = query.eq("country", opts.country);
  if (opts?.createdAfter) query = query.gt("created_at", opts.createdAfter);

  // Todas las condiciones con OR van en UN solo filtro lógico,
  // `or=(and(or(…),or(…)))`, en vez de encadenar varios `.or()`.
  const groups: string[] = [];

  // Operación + precio. En las duales (0085) `price` es el de venta y el de
  // alquiler va en `rent_price`: para un inquilino hay que mirar ese.
  const ceiling =
    brief.maxPrice !== null ? brief.maxPrice * (1 + (brief.maxPriceFlexPct ?? 0) / 100) : null;
  const range = (col: string) =>
    [
      brief.minPrice !== null ? `${col}.gte.${brief.minPrice}` : null,
      ceiling !== null ? `${col}.lte.${ceiling}` : null,
    ].filter(Boolean) as string[];
  if (op === "rent") {
    groups.push(
      `or(and(${["operation.eq.rent", ...range("price")].join(",")}),` +
        `and(${["operation.eq.sale", "operations.cs.{rent}", ...range("rent_price")].join(",")}))`,
    );
    // La estancia solo existe en alquiler. Una propiedad sin estancia
    // cargada no se descarta: no saberlo no es decir que no.
    if (brief.stay) groups.push(`or(stay.eq.${brief.stay},stay.is.null)`);
  } else {
    groups.push("or(operation.eq.sale,operations.cs.{sale})");
    const r = range("price");
    if (r.length) groups.push(`and(${r.join(",")})`);
  }

  // Zona o barrio. Los nombres se buscan en las DOS columnas: los encargos
  // viejos guardaban los barrios dentro de `zones`, y hay barrios que en
  // unas fichas vienen como zona y en otras como subzona (Recoletos,
  // Almagro…). Si el cliente está abierto a otras zonas, no se filtra aquí:
  // se puntúa en `evaluateMatch`.
  //
  // `ilike` y no igualdad: las zonas escritas a mano llegan sin tildes o en
  // minúsculas ("chamberi"). El patrón es permisivo a propósito; la
  // comparación exacta la hace `evaluateMatch` justo después.
  const patterns = [...new Set([...brief.zones, ...brief.subzones].map(zoneLikePattern))].filter(Boolean);
  if (patterns.length && !brief.zonesFlexible) {
    groups.push(
      `or(${patterns.flatMap((p) => [`zone.ilike."${p}"`, `subzone.ilike."${p}"`]).join(",")})`,
    );
  }

  query = query.or(`and(${groups.join(",")})`);

  if (brief.minBedrooms !== null) query = query.gte("bedrooms", brief.minBedrooms);
  if (brief.maxBedrooms !== null) query = query.lte("bedrooms", brief.maxBedrooms);

  const { data: propertiesData, error: propsError } = await query
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (propsError) {
    console.error(
      "getSuggestedProperties: properties query failed:",
      propsError.message,
    );
    return { ok: false, reason: "error", message: propsError.message };
  }

  const properties = (propertiesData ?? []) as PropertyRow[];
  const excludedCounts = new Map<string, number>();
  const suggestions: SuggestedProperty[] = [];

  for (const prop of properties) {
    const photos = proxyPhotoUrls(prop);
    const outcome = evaluateMatch(brief, { ...prop, photoCount: photos.length });
    if (outcome.excluded) {
      const label = exclusionLabel(outcome.reason);
      excludedCounts.set(label, (excludedCounts.get(label) ?? 0) + 1);
      continue;
    }
    const price = effectivePrice(prop, op) ?? Number(prop.price);
    suggestions.push({
      id: prop.id,
      slug: prop.slug,
      title: prop.title,
      zone: prop.zone,
      subzone: prop.subzone,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      squareMeters: prop.square_meters ?? 0,
      price,
      currency: prop.currency,
      // El precio de arriba es el de la operación del cliente: la operación
      // que acompaña al precio tiene que ser la misma o se formatea mal
      // ("2.200 €" de venta en vez de "2.200 €/mes").
      operation: op,
      bcReference: prop.bc_reference,
      photos,
      matchScore: outcome.score,
      matchReasons: outcome.reasons,
      matchWarnings: outcome.warnings,
    });
  }

  suggestions.sort((a, b) => b.matchScore - a.matchScore);

  return {
    ok: true,
    suggestions: suggestions.slice(0, opts?.limit ?? 10),
    excluded: [...excludedCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Nº de propiedades disponibles que casan con el cliente. 0 si falla. */
export async function getAvailablePropertiesCount(
  clientId: string,
  opts?: { country?: string },
): Promise<number> {
  const result = await getSuggestedProperties(clientId, opts);
  return result.ok ? result.suggestions.length : 0;
}

/**
 * Una propiedad concreta, con la misma foto proxied que `getSuggestedProperties`,
 * para el correo de "te ofrecemos esta propiedad" (offerPropertyToClient).
 */
export async function getPropertyForOffer(
  propertyId: string,
): Promise<Omit<SuggestedProperty, "matchScore" | "matchReasons" | "matchWarnings"> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(
      `
      id,
      slug,
      title,
      zone,
      subzone,
      bedrooms,
      bathrooms,
      square_meters,
      price,
      currency,
      operation,
      bc_reference,
      last_synced_at,
      updated_at,
      property_photos(url, position, is_cover)
    `,
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (error || !data) return null;

  const prop = data as PropertyRow;
  return {
    id: prop.id,
    slug: prop.slug,
    title: prop.title,
    zone: prop.zone,
    subzone: prop.subzone,
    bedrooms: prop.bedrooms,
    bathrooms: prop.bathrooms,
    squareMeters: prop.square_meters ?? 0,
    price: Number(prop.price),
    currency: prop.currency,
    operation: prop.operation,
    bcReference: prop.bc_reference,
    photos: proxyPhotoUrls(prop),
  };
}
