import "server-only";
import { createClient } from "../server";

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
  matchReasons: string[];
};

// El resultado distingue "no hay preferencias" de "la query falló". Antes las
// dos ramas devolvían [] y por eso un error de relación pasó meses sin que
// nadie lo notara: el bloque de la ficha simplemente decía "no hay resultados".
export type SuggestedPropertiesResult =
  | { ok: true; suggestions: SuggestedProperty[] }
  | { ok: false; reason: "no_preferences" }
  | { ok: false; reason: "error"; message: string };

type PhotoRow = { url: string; position: number; is_cover: boolean };

type PropertyRow = {
  id: string;
  slug: string;
  title: string;
  zone: string;
  subzone: string | null;
  bedrooms: number;
  bathrooms: number;
  square_meters: number | null;
  price: number | string;
  currency: string | null;
  operation: "rent" | "sale";
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
function proxyPhotoUrls(prop: PropertyRow): string[] {
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

/**
 * Propiedades sugeridas para un cliente, a partir de `client_preferences`.
 *
 * Puntúa zona, precio, dormitorios, baños, superficie y nº de fotos. El score
 * es orientativo: sirve para ordenar, no para decidir.
 *
 * `country` aísla el catálogo (un cliente de España no debe recibir
 * sugerencias de Chile). Sin el argumento no se filtra, que es el
 * comportamiento histórico.
 */
export async function getSuggestedProperties(
  clientId: string,
  opts?: { country?: string; limit?: number },
): Promise<SuggestedPropertiesResult> {
  const supabase = await createClient();

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefs = prefsData as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("properties").select(`
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
    `) as any)
    .eq("status", "available")
    .is("archived_at", null);

  if (opts?.country) query = query.eq("country", opts.country);

  // `operation` y `stay` pueden ser null en las preferencias. `.eq(col, null)`
  // no casa ninguna fila, así que filtrar incondicionalmente vaciaba el
  // resultado para cualquier cliente sin esas preferencias fijadas (habitual
  // en venta, donde `stay` no aplica).
  if (prefs.operation) {
    // Las propiedades duales llevan la operación en `operations[]` además de
    // en `operation`, y solo mirando `operation` se perdían.
    query = query.or(
      `operation.eq.${prefs.operation},operations.cs.{${prefs.operation}}`,
    );
  }
  if (prefs.stay) query = query.eq("stay", prefs.stay);
  if (prefs.min_price) query = query.gte("price", prefs.min_price);
  if (prefs.max_price) query = query.lte("price", prefs.max_price);

  const zones = (prefs.zones as string[] | null) ?? [];
  if (zones.length > 0) query = query.in("zone", zones);

  const { data: propertiesData, error: propsError } = await query.limit(50);

  if (propsError) {
    console.error(
      "getSuggestedProperties: properties query failed:",
      propsError.message,
    );
    return { ok: false, reason: "error", message: propsError.message };
  }

  const properties = (propertiesData ?? []) as PropertyRow[];
  if (properties.length === 0) return { ok: true, suggestions: [] };

  const priceMid =
    prefs.min_price && prefs.max_price
      ? (Number(prefs.min_price) + Number(prefs.max_price)) / 2
      : null;

  const suggestions: SuggestedProperty[] = properties
    .map((prop) => {
      const reasons: string[] = [];
      let score = 0;
      const price = Number(prop.price);

      if (zones.includes(prop.zone)) {
        score += 30;
        reasons.push(`En ${prop.zone}`);
      } else if (zones.length > 0) {
        score += 5;
        reasons.push(`Cercano a ${zones[0]}`);
      }

      if (priceMid && Math.abs(price - priceMid) < priceMid * 0.1) {
        score += 25;
        reasons.push("Precio competitivo");
      } else if (
        prefs.min_price &&
        prefs.max_price &&
        price >= Number(prefs.min_price) &&
        price <= Number(prefs.max_price)
      ) {
        score += 20;
        reasons.push("Dentro del presupuesto");
      }

      if (prop.bedrooms >= 1 && prop.bedrooms <= 5) {
        score += 15;
        reasons.push(`${prop.bedrooms} habitaciones`);
      }
      if (prop.bathrooms >= 1) {
        score += 10;
        reasons.push(`${prop.bathrooms} baño(s)`);
      }
      if (prop.square_meters && prop.square_meters >= 40) {
        score += 10;
        reasons.push(`${prop.square_meters} m²`);
      }

      const photos = proxyPhotoUrls(prop);
      if (photos.length >= 3) {
        score += 5;
        reasons.push("Múltiples fotos");
      }

      return {
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
        operation: prop.operation,
        bcReference: prop.bc_reference,
        photos,
        matchScore: Math.min(score, 100),
        matchReasons: reasons.slice(0, 3),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, opts?.limit ?? 10);

  return { ok: true, suggestions };
}

/** Nº de propiedades disponibles que casan con el cliente. 0 si falla. */
export async function getAvailablePropertiesCount(
  clientId: string,
  opts?: { country?: string },
): Promise<number> {
  const result = await getSuggestedProperties(clientId, opts);
  return result.ok ? result.suggestions.length : 0;
}
