import { renderToBuffer } from "@react-pdf/renderer";
import { catalogDocument, type CatalogPdfInput } from "./document";
import { freshCatalogFonts } from "./fonts";
import { assertPdfEnginePatched } from "../engine-patch/assert";

// ============================================================================
// PDF del catálogo · renderizado con el índice en dos pasadas (P7, T1): la
// primera anota en qué página empieza cada vivienda; la segunda escribe esos
// números y vuelve a anotarlas. Si no coinciden (los números cambian el
// largo del índice), una tercera; si aún no, error: nunca un índice falso.
// Cada pasada empieza con las fuentes del catálogo recién cargadas (T1: si no,
// los caracteres nuevos pierden su texto). No se puede interrumpir: quien lo
// llama retiene el turno de generación hasta que termina (K3).
// ============================================================================

export class IndexUnstableError extends Error {
  constructor() {
    super("index_unstable");
    this.name = "IndexUnstableError";
  }
}

export async function renderCatalogPdf(
  input: Omit<CatalogPdfInput, "pageOf" | "onPage">,
  opts: { root?: string; beforePass?: () => void } = {},
): Promise<{ pdf: Buffer; pageOf: Map<string, number>; passes: number }> {
  assertPdfEnginePatched();
  let pageOf: Map<string, number> | undefined;
  for (let pass = 1; pass <= 3; pass++) {
    opts.beforePass?.();
    freshCatalogFonts(opts.root);
    const seen = new Map<string, number>();
    const pdf = await renderToBuffer(
      catalogDocument({ ...input, pageOf, onPage: (k, p) => { if (!seen.has(k)) seen.set(k, p); } }),
    );
    const stable = !!pageOf && pageOf.size === seen.size && [...seen].every(([k, p]) => pageOf!.get(k) === p);
    if (stable || (pass > 1 && input.catalog.items.length === 0)) return { pdf, pageOf: seen, passes: pass };
    pageOf = seen;
  }
  throw new IndexUnstableError();
}
