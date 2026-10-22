// Comprobación en tiempo de ejecución de que el motor de PDF lleva la
// corrección local (patch.cjs; BCP-01 PR5, D1). La marca la escriben los dos
// archivos corregidos al cargarse (webpack en Next; el hook en los scripts).
// renderCatalogPdf la exige antes de maquetar: un motor sin corregir nunca
// produce un PDF del catálogo (en árabe saldría ilegible y sin texto copiable).

type Marks = { textkit?: string; render?: string };

export class PdfEngineUnpatchedError extends Error {
  constructor(missing: string[]) {
    super(`pdf_engine_unpatched: falta la corrección local del motor de PDF en ${missing.join(" y ")} (lib/pdf/engine-patch; en Next la aplica next.config.ts, en Node --import ./scripts/pdf/engine-patch-hook.mjs)`);
    this.name = "PdfEngineUnpatchedError";
  }
}

export function pdfEnginePatchMarks(): Marks {
  return { ...((globalThis as { __bcpPdfEnginePatch?: Marks }).__bcpPdfEnginePatch ?? {}) };
}

export function assertPdfEnginePatched(): void {
  const m = pdfEnginePatchMarks();
  const missing = (["textkit", "render"] as const).filter((k) => !m[k]);
  if (missing.length) throw new PdfEngineUnpatchedError(missing.map((k) => `@react-pdf/${k}`));
}
