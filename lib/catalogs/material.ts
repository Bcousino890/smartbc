import type { PublicItem } from "./public-contract";

// ============================================================================
// Diagnósticos de material de cada vivienda en la gestión (BCP-01 E2, D-QA8).
// PURO y sin IA: se calcula con lo que ve HOY el cliente (la misma instantánea
// y la misma proyección que el lector, toPublicItem). Solo gestión: nada de
// esto llega al contrato público.
// ============================================================================

export interface CatalogMaterial {
  /** Ni descripción ni capítulos: el cliente ve la ficha breve (datos y fotos). */
  noText: boolean;
  /** Capítulos del recorrido. */
  sections: number;
  /** De ellos, sin foto adecuada (la proyección no les asignó foto). */
  sectionsWithoutPhoto: number;
  /** Fotos que ve el cliente. */
  photos: number;
}

export function materialOf(item: PublicItem): CatalogMaterial {
  return {
    noText: !item.description && item.sections.length === 0,
    sections: item.sections.length,
    sectionsWithoutPhoto: item.sections.filter((s) => s.photo === null).length,
    photos: item.photos.length,
  };
}

/** Avisos breves para la lista de Contenido (orden fijo). */
export function materialLabels(m: CatalogMaterial): string[] {
  const out: string[] = [];
  if (m.noText) out.push("Sin descripción");
  if (m.sectionsWithoutPhoto > 0) out.push(`${m.sectionsWithoutPhoto} capítulo${m.sectionsWithoutPhoto === 1 ? "" : "s"} sin foto adecuada`);
  if (m.photos === 0) out.push("Sin fotos");
  return out;
}
