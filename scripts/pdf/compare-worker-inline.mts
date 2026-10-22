// SOLO VERIFICACIÓN LOCAL (expediente 2026-10-17-bcp-01-pdf-worker, W1). Con
// la MISMA entrada (captura, fotos, logo y fecha), el PDF que maqueta el hilo
// y el del camino actual (en el propio hilo) son el mismo: páginas, texto y
// enlaces por página, fotos por página (por su código, K5), fuentes y
// metadatos. Fixtures sintéticas; los dos se maquetan en el mismo proceso.
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs --import ./scripts/pdf/engine-patch-hook.mjs \
//     scripts/pdf/compare-worker-inline.mts <carpeta>
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { captureFixed } from "../../lib/catalogs/export/capture.ts";
import { photoNeeds } from "../../lib/catalogs/export/generate.ts";
import { loadExportPhoto } from "../../lib/catalogs/export/photos.ts";
import { exportReaders } from "../../lib/catalogs/export/source.ts";
import { FIXTURE_TOKENS, fixtureMutate } from "../../lib/catalogs/fixture-store.ts";
import { toPublicCatalog, type InternalSnapshot } from "../../lib/catalogs/to-public.ts";
import type { PdfPhoto } from "../../lib/pdf/catalog/document.ts";
import { loadLogoDataUri } from "../../lib/pdf/load-logo.ts";
import { renderCatalogPdf } from "../../lib/pdf/catalog/render.ts";
import { catalogPdfWorkerStats, renderCatalogInWorker } from "../../lib/pdf/catalog/render-in-worker.ts";
import { comparePdfs, createChecker, ensureInspect } from "./pdf-verify.mts";

const OUT = resolve(process.argv[2] ?? "node_modules/.cache/pdf-compare");
mkdirSync(OUT, { recursive: true });
ensureInspect(OUT);
const { ok, section, fails } = createChecker();
await fixtureMutate({ op: "reset" });
const logo = await loadLogoDataUri();

const CASES: Array<[string, string, (() => Promise<void>) | null]> = [
  ["pdf", FIXTURE_TOKENS.pdf, null],
  ["main", FIXTURE_TOKENS.main, null],
  ["main-alquiler", FIXTURE_TOKENS.main, async () => void (await fixtureMutate({ op: "operation", token: FIXTURE_TOKENS.main, operation: "rent" } as never))],
  ["one", FIXTURE_TOKENS.one, null],
  ["journey", FIXTURE_TOKENS.journey, null],
  ["journey24", FIXTURE_TOKENS.journey24, null],
  ["empty", FIXTURE_TOKENS.empty, null],
  // PR5: también en árabe y hebreo (el hilo lleva la misma corrección del motor).
  ["pdf-ar", FIXTURE_TOKENS.pdf, async () => void (await fixtureMutate({ op: "lang", token: FIXTURE_TOKENS.pdf, lang: "ar" } as never))],
  ["pdf-he", FIXTURE_TOKENS.pdf, async () => void (await fixtureMutate({ op: "lang", token: FIXTURE_TOKENS.pdf, lang: "he" } as never))],
  ["main-tr", FIXTURE_TOKENS.main, async () => void (await fixtureMutate({ op: "lang", token: FIXTURE_TOKENS.main, lang: "tr" } as never))],
];
for (const [tag, token, prep] of CASES) {
  section(`· ${tag}`);
  await fixtureMutate({ op: "reset" });
  if (prep) await prep();
  const cap = (await captureFixed(exportReaders({ kind: "link", token })))!;
  const snapshot = cap.snapshot as InternalSnapshot;
  const catalog = toPublicCatalog(snapshot, cap.operation);
  const photos = new Map<string, PdfPhoto>();
  for (const [id, need] of photoNeeds(snapshot, cap.operation)) {
    const r = await loadExportPhoto(need, new AbortController().signal);
    photos.set(id, r.ok ? { ok: true, data: r.data, width: r.width, height: r.height } : { ok: false });
  }
  const input = { catalog, capturedAt: new Date("2026-10-17T10:00:00Z"), logo, photos };
  const inline = await renderCatalogPdf(input);
  const before = catalogPdfWorkerStats().worker;
  const worker = await renderCatalogInWorker(input, new AbortController().signal);
  ok("el segundo lo maquetó el hilo", worker.path === "worker" && catalogPdfWorkerStats().worker === before + 1);
  ok("mismas pasadas del índice", inline.passes === worker.passes, `${inline.passes} vs ${worker.passes}`);
  const a = join(OUT, `${tag}-actual.pdf`), b = join(OUT, `${tag}-hilo.pdf`);
  writeFileSync(a, inline.pdf);
  writeFileSync(b, worker.pdf);
  const diffs = await comparePdfs(a, b, OUT, tag);
  ok(`mismo PDF: páginas, texto, enlaces, fotos por página, fuentes y metadatos`, diffs.length === 0, diffs.slice(0, 6).join(" | "));
  const strip = (buf: Buffer) => buf.toString("latin1").replace(/\/CreationDate \(D:[^)]*\)/g, "").replace(/\/ID \[<[0-9a-f]+> <[0-9a-f]+>\]/g, "").replace(/\/BaseFont \/[A-Z]{6}\+/g, "/BaseFont /").replace(/\/FontName \/[A-Z]{6}\+/g, "/FontName /");
  console.log(`    (informativo: bytes ${inline.pdf.length} vs ${worker.pdf.length}; idénticos sin fechas, ID ni prefijos de subconjunto: ${strip(inline.pdf) === strip(worker.pdf) ? "sí" : "no"})`);
}
console.log(`\n${fails() === 0 ? "✅ Todo en verde" : `❌ ${fails()} fallo(s)`}`);
process.exit(fails() ? 1 : 0);
