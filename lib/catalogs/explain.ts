import type { CatalogCriteria, ZoneCriterion } from "./criteria";
import { catalogFold, catalogZoneMatch, zoneCandidates } from "./zones";
import { fitsOperation, isAvailable, orderKeyOf, type AdjustmentKind, type CandidateProperty } from "./selection";

// ============================================================================
// Por qué una vivienda está (o no) en un catálogo automático — SOLO GESTIÓN
// (BCP-01 ampliación C1). Puro: usa las mismas reglas que la referencia TS de
// la selección (selection.ts), que la paridad compara con SQL. Nada de esto
// llega al contrato público ni al lector.
// ============================================================================

/** Cabecera de una inclusión que hoy no puede aparecer (vendida, archivada…). */
export const INCLUDED_UNAVAILABLE = "Incluida a mano · no disponible";

export type ExplainStatus = "match" | "include" | "both" | "excluded" | "out";

export interface Explanation {
  status: ExplainStatus;
  /** Una línea: «Coincide con los criterios», «Incluida a mano · fuera de criterios»… */
  headline: string;
  /** Por qué coincide o qué criterio no cumple (zona, operación, precio). */
  details: string[];
  /** Lo que hay que mirar: sin foto, otra operación, no disponible. */
  warnings: string[];
}

const NUM = new Intl.NumberFormat("es-ES", { useGrouping: "always", maximumFractionDigits: 0 } as Intl.NumberFormatOptions);

function money(n: number, monthly: boolean): string {
  return `${NUM.format(n)} ${monthly ? "€/mes" : "€"}`;
}

function zoneLabel(z: ZoneCriterion): string {
  if (z.kind === "district") return `distrito ${z.name}`;
  if (z.kind === "barrio") return `barrio ${z.name}`;
  return `«${z.name}»`;
}

function placeText(p: Pick<CandidateProperty, "zone" | "subzone">): string {
  return [p.subzone, p.zone].filter((x) => typeof x === "string" && x.trim()).join(", ") || "sin zona";
}

/** El primer criterio de zona que cumple la vivienda (o null). */
export function matchedZone(p: Pick<CandidateProperty, "zone" | "subzone">, c: CatalogCriteria): ZoneCriterion | null {
  const m1 = catalogZoneMatch(p.zone);
  const m2 = catalogZoneMatch(p.subzone);
  const frags = new Set([...zoneCandidates(p.zone), ...zoneCandidates(p.subzone)]);
  for (const z of c.zones) {
    if (z.kind === "district" && (m1?.district === z.name || m2?.district === z.name)) return z;
    if (z.kind === "barrio" && (m1?.barrio === z.name || m2?.barrio === z.name)) return z;
    if (z.kind === "free" && frags.has(catalogFold(z.name))) return z;
  }
  return null;
}

function unavailableReason(p: CandidateProperty): string | null {
  if (p.country !== "es") return "fuera de España";
  if (p.archived_at) return "archivada";
  if (p.status === "sold") return "vendida";
  if (p.status !== "available" && p.status !== "reserved") return `no disponible (${p.status})`;
  return null;
}

function operationName(p: Pick<CandidateProperty, "operation">): string {
  return p.operation === "rent" ? "alquiler" : "venta";
}

/**
 * Explica una vivienda frente a los criterios y su ajuste (si lo tiene).
 * `status` coincide con el `via` de catalog_select para las que están en la
 * lista: «match», «include» o «both»; «excluded» y «out» son las que no están.
 */
export function explainProperty(p: CandidateProperty, c: CatalogCriteria, adjustment: AdjustmentKind | null): Explanation {
  const details: string[] = [];
  const fails: string[] = [];
  const warnings: string[] = [];

  const unavailable = unavailableReason(p);
  if (unavailable) fails.push(`No disponible: ${unavailable}`);

  const fits = fitsOperation(p, c);
  if (c.operation !== "any") {
    if (fits) details.push(c.operation === "sale" ? "Venta" : "Alquiler");
    else fails.push(`Otra operación: ${operationName(p)}`);
  }

  // Precio: solo se compara si la operación es la del catálogo (nunca un
  // alquiler mensual con un precio de venta).
  const key = orderKeyOf(p, c);
  const monthly = fits ? c.operation === "rent" || (c.operation === "any" && p.operation === "rent") : p.operation === "rent";
  if (fits && (c.price_min !== null || c.price_max !== null)) {
    const range =
      c.price_min !== null && c.price_max !== null
        ? `${NUM.format(c.price_min)}–${money(c.price_max, monthly)}`
        : c.price_max !== null
          ? `hasta ${money(c.price_max, monthly)}`
          : `desde ${money(c.price_min as number, monthly)}`;
    if (key.price === null) fails.push("Sin precio (con un rango de precio no entra)");
    else if (c.price_min !== null && key.price < c.price_min) fails.push(`Precio ${money(key.price, monthly)}, por debajo de ${money(c.price_min, monthly)}`);
    else if (c.price_max !== null && key.price > c.price_max) fails.push(`Precio ${money(key.price, monthly)}, por encima de ${money(c.price_max, monthly)}`);
    else details.push(`${money(key.price, monthly)} dentro de ${range}`);
  } else if (!fits && key.price !== null) {
    details.push(`Importe propio: ${money(key.price, monthly)} (va después, en su propio grupo)`);
  }

  if (c.zones.length) {
    const z = matchedZone(p, c);
    if (z) details.push(`Zona: ${zoneLabel(z)}`);
    else fails.push(`Zona «${placeText(p)}» fuera de: ${c.zones.map((x) => x.name).join(", ")}`);
  }

  const hasPhoto = p.photo_count > 0;
  if (!hasPhoto) fails.push("Sin foto");

  const matches = fails.length === 0;

  if (adjustment === "exclude") {
    return {
      status: "excluded",
      headline: matches ? "Excluida a mano (coincidiría con los criterios)" : "Excluida a mano",
      details: matches ? details : fails,
      warnings,
    };
  }

  if (adjustment === "include") {
    if (unavailable) {
      warnings.push(`Incluida, pero ${unavailable}: no aparece en el catálogo (la inclusión se conserva)`);
      return { status: "include", headline: INCLUDED_UNAVAILABLE, details: fails.filter((f) => !f.startsWith("No disponible")), warnings };
    }
    if (matches) return { status: "both", headline: "Coincide con los criterios · también incluida a mano", details, warnings };
    if (!hasPhoto) warnings.push("Sin foto: el lector la mostrará sin imagen");
    if (!fits) warnings.push(`Otra operación (${operationName(p)}): va al final, ordenada por su propio importe`);
    return {
      status: "include",
      headline: "Incluida a mano · fuera de criterios",
      details: fails.filter((f) => f !== "Sin foto" && !f.startsWith("Otra operación")),
      warnings,
    };
  }

  if (matches) return { status: "match", headline: "Coincide con los criterios", details, warnings };
  return { status: "out", headline: "No entra", details: fails, warnings };
}

/** Zonas del criterio que ya están dentro de otra («Castellana ya está dentro de Salamanca»). */
export function zoneRedundancies(c: CatalogCriteria): string[] {
  const districts = new Set(c.zones.filter((z) => z.kind === "district").map((z) => z.name));
  const barrios = new Set(c.zones.filter((z) => z.kind === "barrio").map((z) => z.name));
  const out: string[] = [];
  for (const z of c.zones) {
    if (z.kind === "district") continue;
    const m = catalogZoneMatch(z.name);
    if (!m) continue;
    if (districts.has(m.district)) out.push(`${z.name} ya está dentro de ${m.district}`);
    else if (z.kind === "free" && m.barrio && barrios.has(m.barrio)) out.push(`«${z.name}» ya está dentro de ${m.barrio}`);
  }
  return out;
}

/** Vivienda disponible para incluir (las demás se rechazan en SQL). */
export function canInclude(p: CandidateProperty): boolean {
  return isAvailable(p);
}
