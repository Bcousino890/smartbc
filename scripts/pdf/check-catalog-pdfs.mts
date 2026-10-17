// SOLO VERIFICACIÓN LOCAL (PDF del catálogo, T9). Genera PDF REALES de las
// fixtures por el mismo camino que el servidor (captura fija, fotos por clave,
// documento, comprobación final), TODOS en un mismo proceso, y los inspecciona
// con PDFKit (scripts/pdf/inspect.swift) y leyendo sus objetos
// (scripts/pdf/objects.py):
//   PDF2/PDF5  el texto de la proyección pública está entero, palabra a palabra
//   PDF3/PDF14 cada imagen incrustada se identifica por su CÓDIGO visual (K5):
//              por vivienda, exactamente las fotos previstas y en su orden;
//              ninguna excluida (E3) ni repetida
//   PDF4/PDF15 ni ids, claves, slugs, token, rutas ni URL; solo tel:; metadatos
//   PDF6       el número de cada vivienda en el índice es su página real y el
//              enlace lleva allí
//   PDF7       fuentes incrustadas; glifos españoles
//   PDF8       un cambio a mitad: un PDF de una sola versión, o «changed»;
//              revocado a mitad: nada
//   y otro PDF del CRM con Helvetica sigue bien después de los del catálogo.
//
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs scripts/pdf/check-catalog-pdfs.mts <carpeta-salida>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { captureFixed } from "../../lib/catalogs/export/capture.ts";
import { exportCatalogPdf } from "../../lib/catalogs/export/generate.ts";
import { exportReaders, type ExportScope } from "../../lib/catalogs/export/source.ts";
import { FIXTURE_TOKENS, fixtureExportPhoto, fixtureGetMetas, fixtureMutate } from "../../lib/catalogs/fixture-store.ts";
import { toPublicCatalog, type InternalSnapshot } from "../../lib/catalogs/to-public.ts";
import type { PublicCatalog } from "../../lib/catalogs/public-contract.ts";
import { catalogPdfWorkerStats } from "../../lib/pdf/catalog/render-in-worker.ts";
import { createChecker, ensureInspect, flat, inspect, objects, tokens, verifyCatalogPdf } from "./pdf-verify.mts";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(process.argv[2] ?? join(ROOT, "node_modules/.cache/pdf-check"));
mkdirSync(OUT, { recursive: true });

const { ok, section, fails } = createChecker();
ensureInspect(OUT);

// ── Un caso ─────────────────────────────────────────────────────────────────
interface Case {
  tag: string;
  scope: ExportScope;
  /** Token del enlace (para buscarlo como prohibido) */
  token: string;
  catalogId?: string;
}

async function checkCase(c: Case): Promise<{ bytes: number; ms: number; pages: number; catalog: PublicCatalog; text: string }> {
  section(`· ${c.tag}`);
  const readers = exportReaders(c.scope);
  const cap = await captureFixed(readers);
  if (!cap) throw new Error(`${c.tag}: sin acceso`);
  const snapshot = cap.snapshot as InternalSnapshot;
  const catalog = toPublicCatalog(snapshot, cap.operation);
  const metaBefore = JSON.stringify([...(await fixtureGetMetas([c.token]))]);
  const t0 = performance.now();
  const r = await exportCatalogPdf(c.scope, new AbortController().signal);
  const ms = Math.round(performance.now() - t0);
  ok("generar no cambia la versión del catálogo (PDF8)", JSON.stringify([...(await fixtureGetMetas([c.token]))]) === metaBefore);
  if (!r.ok) {
    ok(`${c.tag}: se genera`, false, r.error);
    return { bytes: 0, ms, pages: 0, catalog, text: "" };
  }
  const file = join(OUT, `${c.tag}.pdf`);
  writeFileSync(file, r.pdf);
  // Misma captura: nada cambió entre la lectura de la prueba y la del PDF.
  const again = await captureFixed(readers);
  ok("la captura de la prueba es la misma que la del PDF", again?.hash === cap.hash);
  const v = await verifyCatalogPdf({ file, outDir: OUT, tag: c.tag, snapshot, operation: cap.operation, token: c.token, catalogId: c.catalogId, isFailing: async (slug, key) => !!(await fixtureExportPhoto(slug, key))?.fail, ok });
  const all = v.text;
  const pages = { length: v.pages };
  return { bytes: r.pdf.length, ms, pages: pages.length, catalog, text: all };
}

// ── Casos ───────────────────────────────────────────────────────────────────
const summary: Record<string, { bytes: number; ms: number; pages: number }> = {};
const link = (k: keyof typeof FIXTURE_TOKENS): Case => ({ tag: k, scope: { kind: "link", token: FIXTURE_TOKENS[k] }, token: FIXTURE_TOKENS[k] });
await fixtureMutate({ op: "reset" });

for (const c of [link("pdf"), link("main"), link("one"), link("journey"), link("journey24")]) {
  const r = await checkCase(c);
  summary[c.tag] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
  if (c.tag === "pdf") {
    section("· pdf: casos concretos");
    ok("contacto de asesora: «TU ASESORA» y su nombre", flat(r.text).includes("tuasesora") && r.text.includes("Laura Méndez"));
    ok("vivienda sin fotos: «Sin fotos»", r.text.includes("Sin fotos"));
    ok("precio sin dato y reservada", /Precio · sin dato/.test(r.text) && flat(r.text).includes("reservada"));
    const desc = r.catalog.items.find((it) => (it.description ?? "").length > 8000);
    ok(`descripción larga (${desc ? tokens(desc.description!).length : 0} palabras) entera`, !!desc && tokens(desc.description!).length >= 1400);
  }
}

// Venta / alquiler: precios según la operación del catálogo.
section("· main en alquiler (precios contextuales)");
await fixtureMutate({ op: "operation", token: FIXTURE_TOKENS.main, operation: "rent" } as never);
{
  const r = await checkCase({ ...link("main"), tag: "main-alquiler" });
  summary["main-alquiler"] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
}
await fixtureMutate({ op: "reset" });

// PDF7 · todos los caracteres españoles de la lista, por el documento real:
// título (Fraunces) y texto de la vivienda (Karla, con º/ª en Fraunces).
section("· glifos españoles (PDF7)");
{
  const G = "¿Ático único? ¡Sí! Pingüino «vistas» — 2.000 € · 80 m² · 1.ª planta y 2.º piso";
  await fixtureMutate({ op: "title", token: FIXTURE_TOKENS.one, title: G } as never);
  await fixtureMutate({ op: "text", token: FIXTURE_TOKENS.one, index: 0, body: `Entrada. ${G}. Fin del texto.`, lead: null } as never);
  const r = await checkCase({ ...link("one"), tag: "glifos" });
  const norm = (t: string) => t.replace(/\s+/g, " ");
  const n = norm(r.text);
  ok("título del catálogo con ¿ ¡ ü « » — € ² ª º: se extrae tal cual", n.includes(G), n.slice(0, 160));
  // La proyección parte el texto en frases (entrada + recorrido), como el lector.
  ok("texto de la vivienda con los mismos caracteres: se extrae tal cual", n.includes("Entrada. ¿Ático único?") && n.includes("¡Sí! Pingüino «vistas» — 2.000 € · 80 m² · 1.ª planta y 2.º piso. Fin del texto."), n.slice(n.indexOf("Entrada"), n.indexOf("Entrada") + 200));
  ok("«Nº» no pasa a «NO» en los rótulos en mayúsculas", !/N\s?O\s?0\s?1/.test(r.text) && /N\s?º\s?0\s?1/.test(r.text));
  await fixtureMutate({ op: "reset" });
}

// Vacío.
{
  section("· empty");
  const r = await exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.empty }, new AbortController().signal);
  if (r.ok) {
    writeFileSync(join(OUT, "empty.pdf"), r.pdf);
    const ins = inspect(join(OUT, "empty.pdf"), join(OUT, "empty-png"));
    ok("catálogo vacío: portada, índice con aviso y cierre", ins.pageCount >= 3 && /no tiene viviendas|sin viviendas/i.test(ins.pages.map((p) => p.text).join(" ")), ins.pages.map((p) => p.text.slice(0, 60)).join(" | "));
  } else ok("catálogo vacío: se genera", false, r.error);
}

// Dueño: catálogo archivado (y enlace revocado): se puede descargar (P4).
section("· dueño, catálogo archivado y enlace revocado");
await fixtureMutate({ op: "archive", token: FIXTURE_TOKENS.pdf } as never);
await fixtureMutate({ op: "revoke", token: FIXTURE_TOKENS.pdf } as never);
{
  const cl = await exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.pdf }, new AbortController().signal);
  ok("cliente: archivado → not_found", !cl.ok && cl.error === "not_found");
  const r = await checkCase({ tag: "dueno-archivado", scope: { kind: "owner", ownerId: "fixture-owner", catalogId: "f0000000-0000-0000-0000-0000000000a1" }, token: FIXTURE_TOKENS.pdf, catalogId: "f0000000-0000-0000-0000-0000000000a1" });
  summary["dueno-archivado"] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
}
await fixtureMutate({ op: "reset" });

// PDF8 · cambios a mitad.
section("· cambios a mitad (PDF8)");
{
  await fixtureMutate({ op: "photo-delay", ms: 120 } as never);
  const key = (await captureFixed(exportReaders({ kind: "link", token: FIXTURE_TOKENS.main })))!.snapshot as InternalSnapshot;
  const k0 = key.items[0].key;
  const p = exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.main }, new AbortController().signal);
  await new Promise((r) => setTimeout(r, 300));
  await fixtureMutate({ op: "price", token: FIXTURE_TOKENS.main, key: k0, price: 1234567 } as never);
  const r = await p;
  if (r.ok) {
    writeFileSync(join(OUT, "cambio.pdf"), r.pdf);
    const t = inspect(join(OUT, "cambio.pdf")).pages.map((x) => x.text).join("\n");
    ok("un cambio a mitad → un PDF de la versión NUEVA (precio nuevo en índice y ficha)", (t.match(/1\.234\.567/g) ?? []).length >= 2, String((t.match(/1\.234\.567/g) ?? []).length));
  } else ok("un cambio a mitad → PDF o changed", r.error === "changed", r.error);
  // Cambios continuos → changed.
  let stop = false;
  const p2 = exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.main }, new AbortController().signal).finally(() => (stop = true));
  for (let i = 0; !stop && i < 200; i++) {
    await fixtureMutate({ op: "price", token: FIXTURE_TOKENS.main, key: k0, price: 2000000 + i } as never);
    await new Promise((r) => setTimeout(r, 150));
  }
  const r2 = await p2;
  ok("cambios continuos → «changed» (409), sin PDF", !r2.ok && r2.error === "changed", r2.ok ? "ok" : r2.error);
  // Revocado a mitad.
  const p3 = exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.one }, new AbortController().signal);
  await new Promise((r) => setTimeout(r, 150));
  await fixtureMutate({ op: "revoke", token: FIXTURE_TOKENS.one } as never);
  const r3 = await p3;
  ok("revocado a mitad → «not_found» (404), sin PDF", !r3.ok && r3.error === "not_found", r3.ok ? "ok" : r3.error);
  await fixtureMutate({ op: "reset" });
}

// Otro PDF del CRM (Helvetica) después de los del catálogo, en el mismo proceso.
section("· PDF de propiedad (Helvetica) después de los del catálogo");
{
  const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
  const src = readFileSync(join(ROOT, "lib/pdf/property-pdf.tsx"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tmp = join(ROOT, "node_modules/.cache/pdf-check-property-pdf.mjs");
  mkdirSync(join(ROOT, "node_modules/.cache"), { recursive: true });
  writeFileSync(tmp, js);
  const { PropertyPdfDocument } = await import(pathToFileURL(tmp).href);
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { createElement } = await import("react");
  const buf = await renderToBuffer(createElement(PropertyPdfDocument, { data: { title: "Piso de prueba en Chamberí", operation: "sale", price: 450000, zone: "Chamberí", city: "Madrid", bedrooms: 2, bathrooms: 1, squareMeters: 80, description: "Descripción con eñe, tildes y comillas «así».", features: ["Ascensor", "Terraza"], coverPhotoUrl: null, galleryPhotos: [], logoDataUri: null, smartLink: "https://example.test/x" } }) as never);
  writeFileSync(join(OUT, "propiedad.pdf"), buf);
  const t = inspect(join(OUT, "propiedad.pdf")).pages.map((p) => p.text).join("\n");
  const o = objects(join(OUT, "propiedad.pdf"), join(OUT, "propiedad-jpg"));
  ok("se genera y su texto se extrae entero", t.includes("Piso de prueba en Chamberí") && t.includes("Descripción con eñe, tildes y comillas «así».") && t.includes("Ascensor"), t.slice(0, 300));
  const rawP = readFileSync(join(OUT, "propiedad.pdf")).toString("latin1");
  ok("sigue usando Helvetica (las fuentes estándar no se tocaron)", /\/BaseFont \/Helvetica/.test(rawP) && o.fonts.every((f) => !/Fraunces|Karla/.test(f.name)), JSON.stringify(o.fonts));
}

// Otro PDF del catálogo al final: el texto se sigue extrayendo bien.
{
  section("· un PDF más del catálogo al final del proceso");
  const r = await checkCase({ ...link("one"), tag: "one-final" });
  summary["one-final"] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nResumen: ${JSON.stringify(summary)}`);
// Expediente 2026-10-17-bcp-01-pdf-worker (W13): todos estos PDF los maquetó
// el HILO; ninguno por el respaldo ni en línea.
section("· camino de maquetación");
{
  const st = catalogPdfWorkerStats();
  ok(`todos los PDF del catálogo los maquetó el hilo (${st.worker}); 0 respaldos, 0 en línea`, st.worker > 0 && st.fallback === 0 && st.inline === 0, JSON.stringify(st));
}

console.log(`\n${fails() === 0 ? "✅ Todo en verde" : `❌ ${fails()} fallo(s)`}`);
process.exit(fails() ? 1 : 0);
