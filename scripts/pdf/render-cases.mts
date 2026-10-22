// SOLO VERIFICACIÓN LOCAL (BCP-01 ampliación, PR5). Maqueta los PDF del
// catálogo de las fixtures con la MISMA entrada (captura, fotos, logos y una
// fecha fija) y los escribe en una carpeta, para compararlos con los de otro
// árbol (p. ej. origin/main extraído con `git archive`) con
// scripts/pdf/same-pdf.mts. Sin red ni base de datos.
//
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs [--import ./scripts/pdf/engine-patch-hook.mjs] \
//     scripts/pdf/render-cases.mts <carpeta> [idiomas=es] [casos=pdf,main,main-alquiler,one,journey,journey24,empty,qa,rent,sale]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { captureFixed } from "../../lib/catalogs/export/capture.ts";
import { photoNeeds } from "../../lib/catalogs/export/generate.ts";
import { loadExportPhoto } from "../../lib/catalogs/export/photos.ts";
import { exportReaders } from "../../lib/catalogs/export/source.ts";
import { FIXTURE_TOKENS, fixtureMutate } from "../../lib/catalogs/fixture-store.ts";
import { toPublicCatalog, type InternalSnapshot } from "../../lib/catalogs/to-public.ts";
import type { PdfPhoto } from "../../lib/pdf/catalog/document.ts";
import { loadLogoDataUri, loadWhiteLogoDataUri } from "../../lib/pdf/load-logo.ts";
import { renderCatalogPdf } from "../../lib/pdf/catalog/render.ts";

const OUT = resolve(process.argv[2] ?? "node_modules/.cache/pdf-cases");
const langs = (process.argv[3] ?? "es").split(",");
const cases = (process.argv[4] ?? "pdf,main,main-alquiler,one,journey,journey24,empty,qa,rent,sale").split(",");
mkdirSync(OUT, { recursive: true });
const logo = await loadLogoDataUri();
const logoWhite = await loadWhiteLogoDataUri();
const summary: Record<string, { pages: number; passes: number; bytes: number }> = {};
for (const lang of langs) {
  for (const c of cases) {
    const tag = c === "main-alquiler" ? "main" : c;
    const token = FIXTURE_TOKENS[tag as keyof typeof FIXTURE_TOKENS];
    await fixtureMutate({ op: "reset" });
    if (c === "main-alquiler") await fixtureMutate({ op: "operation", token, operation: "rent" } as never);
    if (lang !== "es") await fixtureMutate({ op: "lang", token, lang } as never);
    const cap = (await captureFixed(exportReaders({ kind: "link", token })))!;
    const snapshot = cap.snapshot as InternalSnapshot;
    const catalog = toPublicCatalog(snapshot, cap.operation);
    const photos = new Map<string, PdfPhoto>();
    for (const [id, need] of photoNeeds(snapshot, cap.operation)) {
      const r = await loadExportPhoto(need, new AbortController().signal);
      photos.set(id, r.ok ? { ok: true, data: r.data, width: r.width, height: r.height } : { ok: false });
    }
    const r = await renderCatalogPdf({ catalog, capturedAt: new Date("2026-10-17T10:00:00Z"), logo, logoWhite, photos });
    const file = join(OUT, `${c}-${lang}.pdf`);
    writeFileSync(file, r.pdf);
    const pages = (r.pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    summary[`${c}-${lang}`] = { pages, passes: r.passes, bytes: r.pdf.length };
    console.log(`  ${c}-${lang}: ${pages} páginas, ${r.passes} pasadas, ${r.pdf.length} bytes`);
  }
}
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
