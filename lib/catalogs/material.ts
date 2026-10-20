import type { PublicItem } from "./public-contract";

// ============================================================================
// Diagnósticos de material de cada vivienda en la gestión (BCP-01 E2, D-QA8).
// PURO y sin IA: se calcula con lo que ve HOY el cliente (la misma instantánea
// y la misma proyección que el lector, toPublicItem). Solo gestión: nada de
// esto llega al contrato público.
// ============================================================================

export interface CatalogMaterial {
  /** Sin descripción: el cliente ve solo la ficha técnica y las fotos. */
  noText: boolean;
  /** Fotos que ve el cliente. */
  photos: number;
}

export function materialOf(item: PublicItem): CatalogMaterial {
  return {
    noText: item.copy.length === 0,
    photos: item.photos.length,
  };
}

/** Avisos breves para la lista de Contenido (orden fijo). El lector compacto
 *  ya no pone fotos en el texto: desaparece «capítulos sin foto adecuada». */
export function materialLabels(m: CatalogMaterial): string[] {
  const out: string[] = [];
  if (m.noText) out.push("Sin descripción");
  if (m.photos === 0) out.push("Sin fotos");
  return out;
}
