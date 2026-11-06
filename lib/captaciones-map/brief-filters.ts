// El encargo elegido en Captaciones → los filtros de la pantalla (Task 11, petición del dueño 2026-11-06).
//
// Módulo PURO (lo usan el navegador y las pruebas: `npm run test:encargos-captaciones`). Devuelve los filtros
// con los MISMOS nombres de parámetro de URL que lee `lib/particulares/filters-from-params.ts` (y escribe
// `use-particulares-filters.ts`): la lista, el mapa y la API los leen igual, y salen como chips normales.
//
// Qué se rellena y por qué (lo que el filtro no puede expresar se dice aquí):
//  · operation  ← operación.
//  · alquiler   ← estancia, solo en alquiler (short → «temporada», long → «larga»). Ojo: el matching de
//                 particulares no mira la estancia; «temporada» exige la etiqueta del anuncio.
//  · priceMin   ← minPrice. priceMax ← el MISMO techo que el prefiltro SQL del matching (`sqlPriceCeiling`):
//                 el mayor de maxPrice y los topes por dormitorios, con el margen `maxPriceFlexPct`.
//  · bedrooms   ← minBedrooms (el filtro es «N o más»); si min = max, además `dormExacto=1`. El filtro no
//                 tiene máximo: un «2–3 dorm.» queda en «2+» (el matching sigue descartando los de 4).
//  · banos      ← minBathrooms. areaMin / areaMax ← m².
//  · zone       ← zonas y barrios con el vocabulario del matching (ver `zoneSelectionsFor`).
//  · zonePoly   ← la zona dibujada, que manda sobre los nombres (como en `evaluateMatch`).
// Un campo vacío (null, 0, []) no genera filtro. Zonas «flexibles» → sin filtro de zona (el matching no
// descarta por zona).

import type { BriefInput } from "@/lib/clients/brief";
import { fold, sqlPriceCeiling } from "@/lib/clients/brief-match";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";
import { encodeZonePolygons } from "@/lib/zone-polygon";

/** Los parámetros de URL que rellena un encargo (y que «elegir otro encargo» sustituye). */
export const ENCARGO_FILTER_PARAMS = [
  "operation",
  "alquiler",
  "priceMin",
  "priceMax",
  "bedrooms",
  "dormExacto",
  "banos",
  "banosExacto",
  "areaMin",
  "areaMax",
  "zone",
  "zonePoly",
] as const;
export type EncargoFilterParam = (typeof ENCARGO_FILTER_PARAMS)[number];
export type CaptacionesFilterParams = Partial<Record<EncargoFilterParam, string>>;

/** Marca en la URL: «los filtros de ESTE encargo ya se rellenaron» (su id). */
export const AUTOFILL_PARAM = "autofiltros";

/** Lo mínimo del desplegable de zonas (`ZoneFilterGroup`) que hace falta para traducir barrios a nombres crudos. */
export type ZoneGroupLite = { district: string; isMadrid?: boolean; zones: Array<{ name: string }> };

const positive = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const strip = (x: string) => x.replace(/^(barrio|distrito|zona)\s+(del?\s+)?/i, "").trim();

/** Los nombres con los que el matching reconoce un anuncio de esa zona cruda (como `placeAliases`). */
function rawZoneAliases(raw: string, isMadrid: boolean): string[] {
  const out = [fold(strip(raw))];
  if (isMadrid) {
    const n = normalizeZone(raw);
    if (n.district !== OTHER_ZONE_LABEL) out.push(fold(n.district));
    if (n.barrio) out.push(fold(n.barrio));
  }
  return out;
}

/** ¿Es exactamente un distrito de Madrid (no un barrio)? Devuelve su nombre canónico. */
function madridDistrict(name: string): string | null {
  const n = normalizeZone(name);
  return n.barrio === null && n.district !== OTHER_ZONE_LABEL && fold(strip(name)) === fold(n.district) ? n.district : null;
}

/**
 * Zonas y barrios del encargo → entradas del desplegable de zona ("d:<distrito>" | "z:<zona cruda>").
 *  · Un distrito de Madrid (o un municipio del desplegable) en `zones` → "d:…": vale por todos sus barrios,
 *    igual que en el matching; los barrios marcados dentro de él quedan cubiertos.
 *  · Cada barrio (o zona suelta) → las zonas CRUDAS del desplegable que el matching reconocería como ese
 *    barrio («Justicia - Chueca» es Justicia). Sin datos del desplegable, o si ninguna casa, el nombre tal
 *    cual ("z:Recoletos"): el filtro es exacto, así que puede no dar resultados, pero no inventa otro sitio.
 */
export function zoneSelectionsFor(brief: Pick<BriefInput, "zones" | "subzones">, groups: ZoneGroupLite[] = []): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const coveredDistricts = new Set<string>(); // fold(distrito/municipio) ya elegido entero
  const loose: string[] = [];

  for (const z of brief.zones) {
    const name = z.trim();
    if (!name) continue;
    const d = madridDistrict(name);
    const group = groups.find((g) => fold(g.district) === fold(d ?? name));
    if (d || (group && group.isMadrid === false)) {
      const label = d ?? group!.district;
      add(`d:${label}`);
      coveredDistricts.add(fold(label));
    } else loose.push(name);
  }
  for (const s of brief.subzones) if (s.trim()) loose.push(s.trim());

  for (const name of loose) {
    const n = normalizeZone(name);
    if (n.district !== OTHER_ZONE_LABEL && coveredDistricts.has(fold(n.district))) continue;
    const want = fold(strip(name));
    const hits: string[] = [];
    for (const g of groups) {
      if (coveredDistricts.has(fold(g.district))) continue;
      for (const z of g.zones) {
        if (rawZoneAliases(z.name, g.isMadrid !== false).includes(want)) hits.push(z.name);
      }
    }
    if (hits.length) hits.forEach((h) => add(`z:${h}`));
    else add(`z:${name}`);
  }
  return out;
}

/** El encargo → filtros de Captaciones (parámetros de URL). Ver la cabecera del módulo. */
export function briefToCaptacionesFilters(
  brief: BriefInput,
  opts: { zoneGroups?: ZoneGroupLite[] } = {},
): CaptacionesFilterParams {
  const f: CaptacionesFilterParams = {};
  f.operation = brief.operation === "sale" ? "sale" : "rent";
  if (f.operation === "rent" && brief.stay) f.alquiler = brief.stay === "short" ? "temporada" : "larga";

  if (positive(brief.minPrice)) f.priceMin = String(Math.round(brief.minPrice));
  const ceiling = sqlPriceCeiling(brief);
  if (positive(ceiling)) f.priceMax = String(Math.round(ceiling));

  if (positive(brief.minBedrooms)) {
    f.bedrooms = String(brief.minBedrooms);
    if (brief.maxBedrooms === brief.minBedrooms) f.dormExacto = "1";
  }
  if (positive(brief.minBathrooms)) f.banos = String(brief.minBathrooms);
  if (positive(brief.minSquareMeters)) f.areaMin = String(Math.round(brief.minSquareMeters));
  if (positive(brief.maxSquareMeters)) f.areaMax = String(Math.round(brief.maxSquareMeters));

  if (!brief.zonesFlexible) {
    if (brief.polygons?.length) f.zonePoly = encodeZonePolygons(brief.polygons);
    else {
      const sel = zoneSelectionsFor(brief, opts.zoneGroups);
      if (sel.length) f.zone = sel.join("|");
    }
  }
  return f;
}

/** ¿Trae la URL alguno de los filtros que rellena un encargo? */
export function hasEncargoFilters(params: Pick<URLSearchParams, "get">): boolean {
  return ENCARGO_FILTER_PARAMS.some((k) => (params.get(k) ?? "") !== "");
}

/**
 * ¿Se rellenan los filtros con el encargo? UNA vez por (cliente, encargo):
 *  · elegir un encargo (o un cliente) a mano → siempre (sustituye los filtros del encargo anterior);
 *  · llegar a la pantalla (o que cambie el encargo de la URL sin pasar por el selector) → solo si la URL no
 *    trae ya filtros del encargo: un enlace compartido o lo que el equipo retocó no se pisa;
 *  · la marca `autofiltros=<encargo>` dice que ese encargo ya se aplicó: recargar, «atrás» o «Limpiar» (que
 *    conserva la marca) no vuelven a rellenar.
 * `marker` = valor nuevo de la marca (null = no tocarla).
 */
export function decideEncargoAutofill(input: {
  encargoId: string | null;
  marker: string | null;
  explicit: boolean;
  hasFilters: boolean;
}): { apply: boolean; marker: string | null } {
  const { encargoId, marker, explicit, hasFilters } = input;
  if (!encargoId) return { apply: false, marker: null };
  if (explicit) return { apply: true, marker: encargoId };
  if (marker === encargoId) return { apply: false, marker: null };
  return { apply: !hasFilters, marker: encargoId };
}
