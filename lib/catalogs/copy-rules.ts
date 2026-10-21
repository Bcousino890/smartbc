// ============================================================================
// Textos aprobados de las viviendas (0219, expediente
// 2026-10-21-bcp-01-ampliacion-textos-idiomas, PR1). PURO: lo usan el gestor,
// la página «Textos aprobados» y las pruebas (scripts/test-catalogs-copy.mts).
//
// Publicar en un catálogo y aprobar para reutilizar son acciones distintas
// (N1): la casilla «Guardar como texto aprobado» viene desmarcada. Título y
// descripción son partes independientes (DA32).
// ============================================================================

export type CopyParts = "title" | "body" | "both";
export type CopyPart = "title" | "body" | "all";

/** Versión vigente del texto aprobado de una vivienda (biblioteca del dueño). */
export interface CopyLibraryView {
  versionId: string;
  seq: number;
  title: string | null;
  body: string | null;
  lead: string | null;
  /** null si no hay descripción aprobada; false si la ficha cambió (C2). */
  bodyCurrent: boolean | null;
  /** Datos de la ficha que cambiaron desde que se aprobó la descripción. */
  changed: string[];
  titleApprovedAt: string | null;
  bodyApprovedAt: string | null;
  titleCatalogTitle: string | null;
  bodyCatalogTitle: string | null;
}

/** Candidato de la siembra: lo publicado en un catálogo del dueño. */
export interface CopyCandidate {
  catalogId: string;
  catalogTitle: string;
  propertyId: string;
  propertyTitle: string;
  title: string | null;
  body: string | null;
  lead: string | null;
  /** null si no hay descripción publicada. */
  bodyCurrent: boolean | null;
  /** El catálogo tiene asignaciones personales: el texto puede ser personal. */
  maybePersonal: boolean;
  publishedAt: string | null;
  titleInLibrary: boolean;
  bodyInLibrary: boolean;
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function copyViewFromRow(r: Record<string, unknown>): CopyLibraryView {
  return {
    versionId: String(r.version_id),
    seq: Number(r.seq),
    title: s(r.title),
    body: s(r.body),
    lead: s(r.lead),
    bodyCurrent: r.body_current === null || r.body_current === undefined ? null : r.body_current === true,
    changed: Array.isArray(r.changed) ? (r.changed as unknown[]).map(String) : [],
    titleApprovedAt: s(r.title_approved_at),
    bodyApprovedAt: s(r.body_approved_at),
    titleCatalogTitle: s(r.title_catalog_title),
    bodyCatalogTitle: s(r.body_catalog_title),
  };
}

export function copyCandidateFromRow(r: Record<string, unknown>): CopyCandidate {
  return {
    catalogId: String(r.catalog_id),
    catalogTitle: String(r.catalog_title ?? ""),
    propertyId: String(r.property_id),
    propertyTitle: String(r.property_title ?? ""),
    title: s(r.pub_title),
    body: s(r.pub_body),
    lead: s(r.pub_lead),
    bodyCurrent: r.body_current === null || r.body_current === undefined ? null : r.body_current === true,
    maybePersonal: r.has_personal_links === true,
    publishedAt: s(r.published_at),
    titleInLibrary: r.title_in_library === true,
    bodyInLibrary: r.body_in_library === true,
  };
}

/** Qué partes se pueden aprobar de un texto publicado (null: ninguna). */
export function approvableParts(p: { title: string | null; body: string | null; lead: string | null }): CopyParts | null {
  const t = !!p.title?.trim();
  const b = !!(p.body?.trim() || p.lead?.trim());
  return t && b ? "both" : t ? "title" : b ? "body" : null;
}

/** De un candidato, las partes que AÚN no están en la biblioteca y se pueden
 *  aprobar (una descripción no vigente nunca: C2). */
export function pendingCandidateParts(c: CopyCandidate): CopyParts | null {
  const t = !!c.title && !c.titleInLibrary;
  const b = !!(c.body || c.lead) && !c.bodyInLibrary && c.bodyCurrent === true;
  return t && b ? "both" : t ? "title" : b ? "body" : null;
}

/** ¿Lo publicado en este catálogo es ya el texto aprobado de la vivienda? */
export function publishedMatchesLibrary(
  pub: { title: string | null; body: string | null; lead: string | null },
  lib: CopyLibraryView | null,
): { title: boolean; body: boolean } {
  if (!lib) return { title: false, body: false };
  return {
    title: !!pub.title && pub.title === lib.title,
    body: !!(pub.body || pub.lead) && (pub.body ?? null) === lib.body && (pub.lead ?? null) === lib.lead,
  };
}

const CHANGED: Record<string, string> = {
  description: "el texto de la ficha",
  features: "las características",
  features_manual: "las características manuales",
  square_meters: "los m²",
  bedrooms: "los dormitorios",
  bathrooms: "los baños",
  floor_override: "la planta",
  operation: "la operación",
  operations: "las operaciones",
};

export function changedLabel(keys: string[]): string {
  return keys.map((k) => CHANGED[k] ?? k).join(", ");
}

const ERRORS: Record<string, string> = {
  title_not_published: "Ese título no está publicado en este catálogo. Publícalo primero.",
  body_not_published: "Esa descripción no está publicada en este catálogo. Publícala primero.",
  text_stale: "La descripción publicada ya no corresponde a la ficha (cambió). Revísala y vuelve a publicarla antes de aprobarla.",
  text_not_found: "Esa vivienda no tiene texto publicado en este catálogo.",
  invalid_parts: "Elige qué aprobar: el título, la descripción o los dos.",
  copy_not_found: "Esa vivienda no tiene texto aprobado.",
  forbidden: "No tienes acceso a este catálogo.",
};

/** Error de las funciones de 0219 → mensaje (o null si no es uno suyo). */
export function copyErrorMessage(message: string | null | undefined): string | null {
  const m = String(message ?? "");
  for (const [code, text] of Object.entries(ERRORS)) if (m.includes(code)) return text;
  return null;
}

export function partsLabel(p: CopyParts): string {
  return p === "both" ? "título y descripción" : p === "title" ? "título" : "descripción";
}
