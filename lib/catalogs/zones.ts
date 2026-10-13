import { MADRID_DISTRICTS } from "../madrid-zones";

// ============================================================================
// Zonas para los CATÁLOGOS (BCP-01 ampliación X4, D21/P3). Puro y sin red.
//
// Reutiliza la taxonomía global de lib/madrid-zones.ts (21 distritos y sus
// barrios) SIN modificarla, y añade solo para catálogos tres equivalencias
// aprobadas: Chueca → Justicia, Malasaña → Universidad y Huertas → Cortes
// (barrios populares dentro de su barrio oficial).
//
// catalogZoneMatch() repite el algoritmo de normalizeZone(): primero el texto
// completo y después sus fragmentos en orden, quitando «barrio/distrito/zona
// (de)». El primer término conocido manda. La MISMA lógica vive en SQL
// (catalog_zone_match, migración 0195) sobre la tabla catalog_zone_terms que
// genera catalogZoneTerms(); scripts/test-catalogs-public.mts vigila que la
// tabla de la migración no se separe de este archivo y
// scripts/sql/test-catalog-auto.sql compara SQL con TS sobre un corpus.
// ============================================================================

export const CATALOG_ZONE_ALIASES: Readonly<Record<string, string>> = {
  Chueca: "Justicia",
  Malasaña: "Universidad",
  Huertas: "Cortes",
};

export interface ZoneTerm {
  /** Término normalizado (minúsculas, sin tildes). */
  term: string;
  district: string;
  /** null = el término es el propio distrito. */
  barrio: string | null;
}

/** Igual que el fold de lib/madrid-zones.ts y que catalog_fold() en SQL:
 *  minúsculas y sin tildes (ñ → n, ü → u). */
export function catalogFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Mismo prefijo que normalizeZone(): «barrio de», «distrito», «zona»… */
export function stripZonePrefix(folded: string): string {
  return folded.replace(/^(barrio|distrito|zona)\s+(de\s+)?/, "");
}

/** Texto completo + fragmentos (mismos separadores que normalizeZone),
 *  normalizados y sin prefijo, en orden. */
export function zoneCandidates(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  return [text, ...text.split(/[,\-–—/·]| en /).map((p) => p.trim())]
    .filter(Boolean)
    .map((c) => stripZonePrefix(catalogFold(c)));
}

/** Tabla de términos de los catálogos (distritos + barrios + equivalencias). */
export function catalogZoneTerms(): ZoneTerm[] {
  const out = new Map<string, ZoneTerm>();
  const add = (t: ZoneTerm) => {
    const prev = out.get(t.term);
    if (prev && (prev.district !== t.district || prev.barrio !== t.barrio)) {
      throw new Error(`término de zona ambiguo: ${t.term}`);
    }
    out.set(t.term, t);
  };
  for (const [district, barrios] of Object.entries(MADRID_DISTRICTS)) {
    add({ term: catalogFold(district), district, barrio: null });
    for (const b of barrios) {
      const target = CATALOG_ZONE_ALIASES[b] ?? b;
      if (!barrios.includes(target)) throw new Error(`equivalencia fuera del distrito: ${b} → ${target}`);
      add({ term: catalogFold(b), district, barrio: target });
    }
  }
  return [...out.values()].sort((a, b) => a.term.localeCompare(b.term, "es"));
}

let TERMS: Map<string, ZoneTerm> | null = null;
function terms(): Map<string, ZoneTerm> {
  if (!TERMS) TERMS = new Map(catalogZoneTerms().map((t) => [t.term, t]));
  return TERMS;
}

/** Distrito y barrio de una zona «sucia» para los catálogos, o null si no
 *  se reconoce (no se inventa ninguna zona). */
export function catalogZoneMatch(raw: string | null | undefined): { district: string; barrio: string | null } | null {
  for (const c of zoneCandidates(raw)) {
    const t = terms().get(c);
    if (t) return { district: t.district, barrio: t.barrio };
  }
  return null;
}

/** Nombres válidos para los criterios (selectores de la gestión). */
export function catalogDistricts(): string[] {
  return Object.keys(MADRID_DISTRICTS).sort((a, b) => a.localeCompare(b, "es"));
}

/** Barrios de un distrito tal como cuentan en los catálogos (sin los nombres
 *  populares que son equivalencias: Chueca cuenta como Justicia). */
export function catalogBarrios(district: string): string[] {
  return (MADRID_DISTRICTS[district] ?? [])
    .filter((b) => !(b in CATALOG_ZONE_ALIASES))
    .sort((a, b) => a.localeCompare(b, "es"));
}

/** Líneas SQL de la tabla catalog_zone_terms (las genera y comprueba el test). */
export function catalogZoneTermsSql(): string {
  const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
  return catalogZoneTerms()
    .map((t) => `  (${q(t.term)}, ${q(t.district)}, ${q(t.barrio)})`)
    .join(",\n");
}
