import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { briefFromRow, briefSuggestMissing } from "@/lib/clients/brief";
import { evaluateMatch, exclusionLabel, fold, zoneLikePattern } from "@/lib/clients/brief-match";
import { MADRID_DISTRICTS, normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";
import type { ExcludedSummary } from "@/lib/db/queries/suggested-properties";

/** Anuncio de portal (tabla `particulares`) que encaja con el encargo de un cliente. */
export type SuggestedParticular = {
  id: string;
  portal: string | null;
  sourceUrl: string | null;
  title: string;
  zone: string | null;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  price: number;
  operation: "rent" | "sale";
  coverUrl: string | null;
  advertiser: string | null;
  priceDropPct: number | null;
  matchScore: number;
  matchReasons: string[];
  matchWarnings: string[];
};

export type SuggestedParticularesResult =
  | { ok: true; suggestions: SuggestedParticular[]; total: number; excluded: ExcludedSummary }
  | { ok: false; reason: "no_preferences" }
  | { ok: false; reason: "insufficient_brief"; missing: string[] }
  | { ok: false; reason: "error"; message: string };

const COLUMNS =
  "id, portal, source_url, title, address, zone, price, operation, bedrooms, bathrooms, square_meters, " +
  "cover_url, latitude, longitude, attrs, has_lift, condition, floor, floor_num, advertiser_type, price_drop_pct, detected_at, " +
  "taken_down_at, fraud_status, municipality:scraper_extra->>municipality, portal_district:scraper_extra->>district";

const CANDIDATE_LIMIT = 1000;

const MADRID_CAPITAL = new Set(["madrid", "madrid capital"]);

/**
 * Los portales nombran el mismo sitio de muchas formas («Barrio de Salamanca»,
 * «Goya», «Fuencarral - El Pardo»). Para Madrid capital (según el municipio
 * que trae el anuncio) se añaden el distrito y el barrio canónicos; fuera de
 * Madrid NO, porque «Zona Centro» de Getafe no es el distrito Centro.
 */
function placeAliases(zone: string | null, extra: Record<string, unknown> | null): string[] {
  const out: string[] = [];
  const strip = (x: string) => x.replace(/^(barrio|distrito|zona)\s+(del?\s+)?/i, "").trim();
  if (zone) out.push(strip(zone));
  const muni = fold(String(extra?.municipality ?? "")).trim();
  if (MADRID_CAPITAL.has(muni)) {
    for (const raw of [zone, typeof extra?.district === "string" ? extra.district : null]) {
      const n = normalizeZone(raw);
      if (n.district !== OTHER_ZONE_LABEL) out.push(n.district);
      if (n.barrio) out.push(n.barrio);
    }
  }
  return [...new Set(out)];
}

/** Nombres a buscar en SQL: lo pedido y, si es un distrito de Madrid, sus barrios. */
function zoneSearchNames(names: string[]): string[] {
  const out = new Set<string>();
  for (const name of names) {
    out.add(name);
    const district = Object.keys(MADRID_DISTRICTS).find((d) => fold(d) === fold(name));
    if (district) for (const b of MADRID_DISTRICTS[district]) out.add(b);
  }
  return [...out];
}

/**
 * Anuncios de portales activos que encajan con el encargo. Mismo cruce
 * (`evaluateMatch`) que el catálogo propio, con dos matices propios de lo
 * scrapeado: no hay descripción larga (solo título, atributos normalizados y
 * `has_lift`), así que casi todo "falta el dato" se avisa y NO se descarta; y
 * las copias de un mismo inmueble (`duplicate_of`) no se repiten.
 */
export async function getSuggestedParticulares(
  clientId: string,
  opts?: { limit?: number },
): Promise<SuggestedParticularesResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: prefs, error: prefsError } = await supabase
    .from("client_preferences")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (prefsError) return { ok: false, reason: "error", message: prefsError.message };
  if (!prefs) return { ok: false, reason: "no_preferences" };

  const brief = briefFromRow(prefs);
  const op = brief.operation;
  const missing = briefSuggestMissing(brief);
  if (missing.length) return { ok: false, reason: "insufficient_brief", missing };
  const ceiling = brief.maxPrice !== null ? brief.maxPrice * (1 + (brief.maxPriceFlexPct ?? 0) / 100) : null;

  let query = supabase
    .from("particulares")
    .select(COLUMNS)
    .eq("is_active", true)
    .is("duplicate_of", null)
    .is("taken_down_at", null)
    // Sin precio no se puede cruzar con un presupuesto: fuera, no "dentro del presupuesto".
    .gt("price", 0)
    // Solo la operación propia de la fila: el precio que se compara es el de
    // esta fila, y `link_ops` incluye copias ya dadas de baja.
    .eq("operation", op);
  if (brief.minPrice !== null) query = query.gte("price", brief.minPrice);
  if (ceiling !== null) query = query.lte("price", ceiling);
  if (brief.minBedrooms !== null) query = query.gte("bedrooms", brief.minBedrooms);
  if (brief.maxBedrooms !== null) query = query.lte("bedrooms", brief.maxBedrooms);

  if (!brief.zonesFlexible) {
    if (brief.polygons.length) {
      const pts = brief.polygons.flat();
      const lats = pts.map((q: number[]) => q[1]);
      const lngs = pts.map((q: number[]) => q[0]);
      const pad = 0.0005;
      query = query.or(
        `latitude.is.null,and(latitude.gte.${Math.min(...lats) - pad},latitude.lte.${Math.max(...lats) + pad},` +
          `longitude.gte.${Math.min(...lngs) - pad},longitude.lte.${Math.max(...lngs) + pad})`,
      );
    } else {
      // Búsqueda AMPLIA (contiene, también en el distrito del portal): la
      // comparación exacta con distrito/barrio canónicos la hace evaluateMatch.
      const patterns = [...new Set(zoneSearchNames([...brief.zones, ...brief.subzones]).map(zoneLikePattern))].filter(Boolean);
      if (patterns.length) {
        query = query.or(
          patterns.flatMap((p) => [`zone.ilike."*${p}*"`, `scraper_extra->>district.ilike."*${p}*"`]).join(","),
        );
      }
    }
  }

  const { data, error } = await query.order("detected_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  if (error) {
    console.error("getSuggestedParticulares: query failed:", error.message);
    return { ok: false, reason: "error", message: error.message };
  }

  const excludedCounts = new Map<string, number>();
  const suggestions: SuggestedParticular[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    // Sospechoso o confirmado de fraude (migración 0191): nunca se sugiere.
    if (r.fraud_status) {
      excludedCounts.set("Posible fraude", (excludedCounts.get("Posible fraude") ?? 0) + 1);
      continue;
    }
    // `has_lift` es un booleano tri-estado: se traduce al texto que entiende el detector.
    const features: string[] = [...(Array.isArray(r.attrs) ? r.attrs : [])];
    if (r.has_lift === true) features.push("Ascensor");
    if (r.has_lift === false) features.push("Sin ascensor");
    if (r.condition) features.push(String(r.condition));
    const outcome = evaluateMatch(brief, {
      zone: r.zone ?? null,
      subzone: null,
      zoneAliases: placeAliases(r.zone ?? null, { municipality: r.municipality, district: r.portal_district }),
      latitude: r.latitude,
      longitude: r.longitude,
      bedrooms: r.bedrooms ?? null,
      bathrooms: r.bathrooms ?? null,
      square_meters: r.square_meters ?? null,
      price: r.price ?? 0,
      operation: r.operation === "sale" ? "sale" : "rent",
      title: r.title ?? null,
      features,
      floor_override: r.floor_num != null ? String(r.floor_num) : (r.floor ?? null),
      photoCount: r.cover_url ? 3 : 0,
    });
    if (outcome.excluded) {
      const label = exclusionLabel(outcome.reason);
      excludedCounts.set(label, (excludedCounts.get(label) ?? 0) + 1);
      continue;
    }
    suggestions.push({
      id: r.id,
      portal: r.portal ?? null,
      sourceUrl: r.source_url ?? null,
      title: r.title || [r.address, r.zone].filter(Boolean).join(", ") || "Anuncio",
      zone: r.zone ?? null,
      address: r.address ?? null,
      bedrooms: r.bedrooms ?? null,
      bathrooms: r.bathrooms ?? null,
      squareMeters: r.square_meters ?? null,
      price: Number(r.price ?? 0),
      operation: op,
      coverUrl: r.cover_url ?? null,
      advertiser: r.advertiser_type ?? null,
      priceDropPct: r.price_drop_pct != null ? Number(r.price_drop_pct) : null,
      matchScore: outcome.score,
      matchReasons: outcome.reasons,
      matchWarnings: outcome.warnings,
    });
  }

  suggestions.sort((a, b) => b.matchScore - a.matchScore);
  return {
    ok: true,
    suggestions: suggestions.slice(0, opts?.limit ?? 12),
    total: suggestions.length,
    excluded: [...excludedCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}
