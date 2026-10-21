import { MADRID_DISTRICTS } from "../madrid-zones";
import { CATALOG_ZONE_ALIASES, catalogFold, stripZonePrefix } from "./zones";

// ============================================================================
// Registro de zonas con identidad estable y clasificación PRUDENTE de la
// ubicación de una vivienda (expediente 2026-10-21-bcp-01-ampliacion-textos-
// idiomas, PR2, DA22–DA24, DA37). PURO: sin red ni base de datos.
//
// · Identidad estable: «madrid/<distrito>» y «madrid/<distrito>/<barrio>»,
//   generada de la taxonomía de lib/madrid-zones.ts (21 distritos). La tabla
//   catalog_areas de la migración 0220 es ESTA lista (scripts/test-catalogs-
//   areas.mts vigila que no se separen).
// · Nombres populares (Chueca, Malasaña, Huertas) son zonas propias que
//   apuntan a su barrio oficial; los casi-duplicados de la taxonomía (Águilas
//   / Las Águilas, Palos de la Frontera / Palos de Moguer) son alias de uno.
// · La clasificación es una SUGERENCIA. Solo una persona la confirma (tabla
//   catalog_property_areas); nada de esto escribe en la ficha del CRM ni se
//   mezcla con los grupos de la HOME ni con los criterios de búsqueda.
// · Una calle o un título no prueban el barrio (DA37): si el barrio de la
//   ficha coincide con la calle de la dirección, o el texto apunta a varias
//   zonas, o el barrio no es del distrito de la ficha, se pide confirmar.
// ============================================================================

export type AreaLevel = "distrito" | "barrio";

export interface Area {
  id: string;
  level: AreaLevel;
  name: string;
  /** Distrito al que pertenece (barrios), o null. */
  districtId: string | null;
  /** Nombre popular dentro de un barrio oficial (Chueca → Justicia). */
  officialId: string | null;
  /** Términos normalizados que lo nombran (nombre y alias). */
  terms: string[];
}

export function areaSlug(s: string): string {
  return catalogFold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Casi-duplicados de la taxonomía: el segundo es alias del primero. */
export const AREA_DUPLICATES: Readonly<Record<string, string>> = {
  Águilas: "Las Águilas",
  "Palos de la Frontera": "Palos de Moguer",
};

let REGISTRY: Area[] | null = null;

/** Registro completo, en orden estable (distrito y sus barrios). */
export function areaRegistry(): Area[] {
  if (REGISTRY) return REGISTRY;
  const out: Area[] = [];
  const districts = Object.keys(MADRID_DISTRICTS).sort((a, b) => a.localeCompare(b, "es"));
  for (const d of districts) {
    const did = `madrid/${areaSlug(d)}`;
    out.push({ id: did, level: "distrito", name: d, districtId: null, officialId: null, terms: [catalogFold(d)] });
    const barrios = MADRID_DISTRICTS[d].filter((b) => !AREA_DUPLICATES[b]);
    for (const b of [...barrios].sort((x, y) => x.localeCompare(y, "es"))) {
      const terms = [catalogFold(b), ...Object.entries(AREA_DUPLICATES).filter(([, canon]) => canon === b).map(([dup]) => catalogFold(dup))];
      const official = CATALOG_ZONE_ALIASES[b];
      out.push({
        id: `${did}/${areaSlug(b)}`,
        level: "barrio",
        name: b,
        districtId: did,
        officialId: official ? `${did}/${areaSlug(official)}` : null,
        terms,
      });
    }
  }
  REGISTRY = out;
  return out;
}

let BY_ID: Map<string, Area> | null = null;
let BY_TERM: Map<string, Area> | null = null;

export function areaById(id: string | null | undefined): Area | null {
  if (!id) return null;
  if (!BY_ID) BY_ID = new Map(areaRegistry().map((a) => [a.id, a]));
  return BY_ID.get(id) ?? null;
}

function byTerm(term: string): Area | null {
  if (!BY_TERM) {
    BY_TERM = new Map();
    for (const a of areaRegistry()) {
      for (const t of a.terms) {
        if (BY_TERM.has(t)) throw new Error(`término de zona repetido en el registro: ${t}`);
        BY_TERM.set(t, a);
      }
    }
  }
  return BY_TERM.get(term) ?? null;
}

/** Zona del registro que nombra exactamente un texto («Barrio de Salamanca»
 *  → el distrito), o null. */
export function areaForName(raw: string | null | undefined): Area | null {
  const t = stripZonePrefix(catalogFold((raw ?? "").trim()));
  return t ? byTerm(t) : null;
}

/** Nombre para «Vivir en …» y para el gestor («Recoletos (Salamanca)»). */
export function areaLabel(a: Area): string {
  const d = a.districtId ? areaById(a.districtId) : null;
  return d ? `${a.name} (${d.name})` : a.name;
}

/** Zonas que nombra un texto: el texto entero y sus fragmentos, sin repetir. */
function areasIn(raw: string | null | undefined): Area[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  const parts = [text, ...text.split(/[,\-–—/·]| en /)].map((p) => stripZonePrefix(catalogFold(p.trim()))).filter(Boolean);
  const found: Area[] = [];
  for (const p of parts) {
    const a = byTerm(p);
    if (a && !found.some((x) => x.id === a.id)) found.push(a);
  }
  return found;
}

const STREET_PREFIX = "(?:calle|c\\/|c\\.|paseo|p[oº]\\.?|avenida|avda\\.?|av\\.|plaza|pza\\.?|glorieta|ronda|camino|travesia)";

/** ¿La dirección nombra esta zona como calle («Calle Goya 30», «Pº de la Castellana»)? */
export function addressNamesStreet(address: string | null | undefined, area: Area): boolean {
  const a = catalogFold(address ?? "");
  if (!a) return false;
  return area.terms.some((t) => new RegExp(`(^|\\s)${STREET_PREFIX}\\s+(?:de\\s+)?(?:la\\s+|las\\s+|los\\s+|el\\s+|del\\s+)?${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|\\s|,|$)`).test(a));
}

export type AreaStatus = "auto" | "ambigua" | "conflicto" | "sin_clasificar";

export interface AreaSuggestion {
  status: AreaStatus;
  /** Zona sugerida (auto) o la más probable (ambigua/conflicto), o null. */
  areaId: string | null;
  /** Por qué, en palabras del gestor. */
  reason: string;
  /** Otras zonas que aparecen en los datos (para elegir al confirmar). */
  candidates: string[];
}

const isWithin = (a: Area, d: Area) => a.id === d.id || a.districtId === d.id;

/** Clasificación sugerida (determinista y prudente) a partir de la ficha. */
export function classifyLocation(p: { zone: string | null; subzone: string | null; address: string | null }): AreaSuggestion {
  const sub = areasIn(p.subzone);
  const zon = areasIn(p.zone);
  const all = [...sub, ...zon.filter((z) => !sub.some((s) => s.id === z.id))];
  const ids = all.map((a) => a.id);
  const zoneDistrict = zon.find((a) => a.level === "distrito") ?? (zon[0]?.districtId ? areaById(zon[0].districtId) : null);

  // Varias zonas incompatibles dentro del barrio de la ficha: no se elige.
  const subBarrios = sub.filter((a) => a.level === "barrio");
  if (subBarrios.length > 1) {
    return { status: "ambigua", areaId: subBarrios[0].id, reason: "La ficha nombra varios barrios a la vez.", candidates: ids };
  }
  const primary = subBarrios[0] ?? sub[0] ?? zon.find((a) => a.level === "barrio") ?? zon[0] ?? null;
  if (!primary) {
    return { status: "sin_clasificar", areaId: null, reason: p.zone || p.subzone ? "La zona de la ficha no es un distrito ni un barrio conocido de Madrid." : "La ficha no tiene zona.", candidates: [] };
  }
  // El barrio no es del distrito de la ficha (o el texto mezcla zonas de distritos distintos).
  const districtOf = (a: Area) => (a.level === "distrito" ? a : areaById(a.districtId));
  const foreign = all.find((a) => {
    const d = districtOf(primary);
    return d && !isWithin(a, d) && !(a.level === "distrito" && isWithin(primary, a));
  });
  if (foreign || (zoneDistrict && !isWithin(primary, zoneDistrict))) {
    return { status: "conflicto", areaId: primary.id, reason: "El barrio y el distrito de la ficha no encajan.", candidates: ids };
  }
  // Una calle no prueba el barrio.
  if (primary.level === "barrio" && addressNamesStreet(p.address, primary)) {
    return { status: "ambigua", areaId: primary.id, reason: `«${primary.name}» también es el nombre de la calle de la dirección: puede que la ficha tome la calle por el barrio.`, candidates: ids };
  }
  const via = sub.some((a) => a.id === primary.id) ? "el barrio de la ficha" : "la zona de la ficha";
  return { status: "auto", areaId: primary.id, reason: `Coincide exactamente con ${via}.`, candidates: ids };
}

/** Confirmación del dueño (0220). `areaId` null = «sin zona verificada». */
export interface AreaDecision {
  areaId: string | null;
  /** false: la zona, el barrio o la dirección de la ficha cambiaron después. */
  current: boolean;
  decidedAt: string | null;
}

export function areaDecisionFromRow(r: Record<string, unknown>): AreaDecision {
  return {
    areaId: typeof r.area_id === "string" && r.area_id ? r.area_id : null,
    current: r.still_current === true,
    decidedAt: typeof r.decided_at === "string" ? r.decided_at : null,
  };
}

export interface AreaView {
  suggestion: AreaSuggestion;
  decision: AreaDecision | null;
  /** Zona confirmada y vigente: solo entonces el lector usa el registro. */
  verified: boolean;
  /** Nombre que usa hoy «Vivir en …» (null → «El barrio»). */
  living: string | null;
}

/** Estado de la zona de una vivienda en el gestor. Lo que ve el lector sigue
 *  la MISMA regla que livingAreaName (editorial.ts): sin confirmación vigente,
 *  la zona de la ficha tal cual, como antes de 0220. */
export function areaViewOf(p: { zone: string | null; subzone: string | null; address: string | null }, decision: AreaDecision | null): AreaView {
  const suggestion = classifyLocation(p);
  const verified = !!decision?.current;
  const fallback = (p.subzone ?? "").trim() || (p.zone ?? "").trim() || null;
  const living = verified ? (decision!.areaId ? areaById(decision!.areaId)?.name ?? null : null) : fallback;
  return { suggestion, decision, verified, living };
}

/** Lo que llega al lector (igual que la instantánea de 0220): la zona solo
 *  con confirmación vigente; null en otro caso. */
export function confirmedAreaOf(decision: AreaDecision | null | undefined): { name: string | null; level: AreaLevel | null } | null {
  if (!decision?.current) return null;
  const a = decision.areaId ? areaById(decision.areaId) : null;
  return a ? { name: a.name, level: a.level } : { name: null, level: null };
}

const AREA_ERRORS: Record<string, string> = {
  area_not_found: "Esa zona no está en el registro.",
  property_not_found: "La vivienda ya no existe.",
  forbidden: "Solo el dueño de la HOME puede confirmar la zona.",
};

/** Errores de 0220 → mensaje del gestor (null: no es de las zonas). */
export function areaErrorMessage(raw: string | null | undefined): string | null {
  const m = (raw ?? "").match(/area_not_found|property_not_found|forbidden/);
  return m ? AREA_ERRORS[m[0]] : null;
}

/** Opciones para corregir: distritos con sus barrios, en orden. */
export function areaOptions(): Array<{ district: Area; barrios: Area[] }> {
  const reg = areaRegistry();
  return reg.filter((a) => a.level === "distrito").map((d) => ({ district: d, barrios: reg.filter((a) => a.districtId === d.id) }));
}

/** Filas para la tabla catalog_areas (0220). */
export function areaRows(): Array<{ id: string; level: AreaLevel; name: string; district_id: string | null; official_id: string | null; terms: string[] }> {
  return areaRegistry().map((a) => ({ id: a.id, level: a.level, name: a.name, district_id: a.districtId, official_id: a.officialId, terms: a.terms }));
}
