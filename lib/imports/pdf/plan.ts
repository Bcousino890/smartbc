// De páginas leídas + separación en viviendas → un borrador por vivienda
// (BCP-01 P7, I-18/I-19). Puro: lo usa la interfaz de P8 y las pruebas.

import type { DraftFields, FieldEvidence } from "../draft-model";
import { extractPdfFields } from "./fields";
import type { RemovedContact } from "./sanitize";
import type { Groups } from "./split";

export interface PlanPage {
  page: number;
  /** Texto de la capa del PDF o del OCR aceptado ("" si no hay). */
  text: string;
  /** De dónde salió el texto (para enseñarlo en la revisión). */
  source: "text" | "ocr" | "none";
  /** Fotos candidatas de la página (sin el escaneo de página entera). */
  photoIds: string[];
}

export interface PlannedDraft {
  /** 1..n: la parte del documento (referencia pdf:<hash>:<parte>). */
  part: number;
  pages: number[];
  fields: DraftFields;
  evidence: Record<string, FieldEvidence>;
  removedContacts: RemovedContact[];
  /** Fotos propuestas en orden de página (la persona elige, ordena y recorta). */
  photos: { page: number; id: string }[];
  /** Páginas cuyo texto salió del OCR (se avisa: revisar números). */
  ocrPages: number[];
}

export function planPdfDrafts(pages: PlanPage[], groups: Groups): PlannedDraft[] {
  const byPage = new Map(pages.map((p) => [p.page, p]));
  return groups.map((g, i) => {
    const ps = g.map((n) => byPage.get(n)).filter((p): p is PlanPage => Boolean(p));
    const r = extractPdfFields(ps.map((p) => ({ page: p.page, text: p.text })));
    const ocrPages = ps.filter((p) => p.source === "ocr").map((p) => p.page);
    // Lo leído por OCR nunca es «seguro»: los números pueden estar mal leídos.
    for (const ev of Object.values(r.evidence)) if (ev.page && ocrPages.includes(ev.page) && ev.status === "seguro") ev.status = "dudoso";
    return {
      part: i + 1,
      pages: [...g],
      fields: r.fields,
      evidence: r.evidence,
      removedContacts: r.removedContacts,
      photos: ps.flatMap((p) => p.photoIds.map((id) => ({ page: p.page, id }))),
      ocrPages,
    };
  });
}
