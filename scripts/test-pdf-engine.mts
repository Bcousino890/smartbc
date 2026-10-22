// Corrección local del motor de PDF (BCP-01 ampliación, PR5, decisiones D1 y
// D2): pruebas sin red ni base de datos, en la CI.
//
//   npm run test:pdf-engine
//   (= node … --import ./scripts/pdf/engine-patch-hook.mjs scripts/test-pdf-engine.mts)
//
// Comprueba:
//   1. Las versiones instaladas de @react-pdf/textkit y @react-pdf/render son
//      las revisadas; si no, FALLA con el motivo (hay que revisar la corrección).
//   2. La corrección se aplica a los archivos instalados: cada trozo aparece
//      una vez y el resultado lleva la marca.
//   3. Una versión distinta o un texto cambiado hacen fallar la carga con un
//      error claro (simulado en una carpeta temporal).
//   4. next.config.ts registra el loader para esos dos archivos (también en el
//      bundle del servidor, donde está el hilo del PDF) y el loader corrige.
//   5. Con el hook de este proceso el motor está corregido (marca en tiempo de
//      ejecución) y maqueta: el árabe que antes tiraba el motor se genera; cada
//      línea RTL lleva su /ActualText con el texto lógico exacto (copiar y
//      buscar, D2); una línea solo latina no lleva ninguno (es, en, fr, it, de
//      y tr salen igual que sin la corrección).
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createElement as h } from "react";
import { Document, Font, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { assertPdfEnginePatched, pdfEnginePatchMarks } from "../lib/pdf/engine-patch/assert.ts";
import { readPdf } from "./pdf/pdf-text.mts";

const ROOT = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const patch = require(join(ROOT, "lib/pdf/engine-patch/patch.cjs")) as {
  REVIEWED: Record<string, string>;
  MARK: string;
  EnginePatchError: new (m: string) => Error;
  patchEngineSource(file: string, src: string): string;
  targetOf(file: string): string | null;
};

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const throws = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

const files = {
  textkit: join(ROOT, "node_modules/@react-pdf/textkit/lib/textkit.js"),
  render: join(ROOT, "node_modules/@react-pdf/render/lib/index.js"),
};

console.log("\n· 1 · Versiones instaladas = revisadas");
for (const [name, pkg] of [["@react-pdf/textkit", "textkit"], ["@react-pdf/render", "render"]] as const) {
  const v = JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8")).version;
  ok(`${name} ${v} (revisada: ${patch.REVIEWED[name]})`, v === patch.REVIEWED[name], `subida sin revisar la corrección: revisa lib/pdf/engine-patch/patch.cjs`);
}

console.log("\n· 2 · La corrección se aplica a los archivos instalados");
for (const [k, file] of Object.entries(files)) {
  const src = readFileSync(file, "utf8");
  const err = throws(() => patch.patchEngineSource(file, src));
  ok(`${k}: se corrige sin error`, err === null, err ?? "");
  if (err) continue;
  const out = patch.patchEngineSource(file, src);
  ok(`${k}: lleva la marca «${patch.MARK}»`, out.includes(patch.MARK) && out.includes("__bcpPdfEnginePatch"));
  if (k === "textkit") {
    ok("textkit: reorderLine sustituida (L2 sobre runs, ActualText lógico)", out.includes("bcpActualText: logical") && !out.includes("getItemAtIndex(line.runs, 'glyphs', index)"));
    ok("textkit: slice$1 empieza en el primer glifo del grupo (E7)", out.includes("run.glyphIndices.indexOf(run.glyphIndices[lastStart])"));
  } else {
    ok("render: xOffset/yOffset escalados (E6)", out.includes("xOffset: pos.xOffset * scale,") && out.includes("yOffset: pos.yOffset * scale,"));
    ok("render: ActualText alrededor de la línea (D2)", out.includes("ctx.markContent('Span', { actual: bcpActualText })") && out.includes("ctx.endMarkedContent();"));
  }
  ok(`${k}: otro archivo no se toca`, patch.patchEngineSource(join(ROOT, "node_modules/@react-pdf/layout/lib/index.js"), "x") === "x");
}

console.log("\n· 3 · Versión distinta o texto cambiado → error claro al cargar");
{
  const tmp = mkdtempSync(join(tmpdir(), "pdf-engine-"));
  try {
    const fake = (pkg: string, version: string, srcFile: string, mutate?: (s: string) => string) => {
      const dir = join(tmp, version, "node_modules/@react-pdf", pkg);
      mkdirSync(join(dir, "lib"), { recursive: true });
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@react-pdf/${pkg}`, version }));
      const target = join(dir, "lib", pkg === "textkit" ? "textkit.js" : "index.js");
      copyFileSync(srcFile, target);
      if (mutate) writeFileSync(target, mutate(readFileSync(target, "utf8")));
      return target;
    };
    const t1 = fake("textkit", "6.4.0", files.textkit);
    const e1 = throws(() => patch.patchEngineSource(t1, readFileSync(t1, "utf8")));
    ok("textkit 6.4.0 → error que nombra la versión y la corrección", !!e1 && e1.includes("6.4.0") && e1.includes("6.3.0") && e1.includes("lib/pdf/engine-patch/patch.cjs"), e1 ?? "no falló");
    const r1 = fake("render", "4.6.0", files.render);
    const e2 = throws(() => patch.patchEngineSource(r1, readFileSync(r1, "utf8")));
    ok("render 4.6.0 → error claro", !!e2 && e2.includes("4.6.0") && e2.includes("4.5.1"), e2 ?? "no falló");
    const t2 = fake("textkit", "6.3.0", files.textkit, (s) => s.replace("const reorderLine = (line) => {", "const reorderLine = (line, x) => {"));
    const e3 = throws(() => patch.patchEngineSource(t2, readFileSync(t2, "utf8")));
    ok("misma versión con el texto cambiado → error claro", !!e3 && e3.includes("reorderLine"), e3 ?? "no falló");
    const r2 = fake("render", "4.5.1", files.render, (s) => s.replace("xOffset: pos.xOffset,", "xOffset: pos.xOffset ,"));
    const e4 = throws(() => patch.patchEngineSource(r2, readFileSync(r2, "utf8")));
    ok("render con renderGlyphs cambiada → error claro", !!e4 && e4.includes("renderGlyphs"), e4 ?? "no falló");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log("\n· 4 · next.config.ts: el loader en todos los bundles (también el hilo del PDF)");
{
  const nextConfig = (await import("../next.config.ts")).default as { webpack: (c: unknown, o: { isServer: boolean }) => { module: { rules: Array<{ test: RegExp; enforce?: string; use: Array<{ loader: string }> }> } } };
  for (const isServer of [true, false]) {
    const cfg = nextConfig.webpack({ module: { rules: [] }, output: {} }, { isServer });
    const rule = cfg.module.rules.find((r) => r.use?.some((u) => u.loader.endsWith("webpack-loader.cjs")));
    ok(`${isServer ? "servidor" : "navegador"}: regla con el loader, enforce «pre»`, !!rule && rule.enforce === "pre");
    if (!rule) continue;
    ok(`${isServer ? "servidor" : "navegador"}: casa con textkit y render instalados, no con otros`, rule.test.test(files.textkit) && rule.test.test(files.render) && !rule.test.test(join(ROOT, "node_modules/@react-pdf/layout/lib/index.js")));
    const loader = require(rule.use[0].loader) as (this: { resourcePath: string; cacheable(): void }, s: string) => string;
    const out = loader.call({ resourcePath: files.textkit, cacheable() {} }, readFileSync(files.textkit, "utf8"));
    ok(`${isServer ? "servidor" : "navegador"}: el loader corrige textkit`, out.includes(patch.MARK));
  }
  const src = readFileSync(join(ROOT, "lib/pdf/catalog/render-in-worker.ts"), "utf8");
  ok("el hilo del PDF es un chunk de webpack (new Worker(new URL(…)))", /new Worker\(new URL\("\.\/render-worker\.ts", import\.meta\.url\)/.test(src));
  const cfgSrc = readFileSync(join(ROOT, "next.config.ts"), "utf8");
  ok("@react-pdf no es externo (se compila, y por tanto se corrige)", !/serverExternalPackages:[\s\S]*@react-pdf[\s\S]*\],/.test(cfgSrc.split("webpack(")[0]));
}

console.log("\n· 5 · Motor corregido en ejecución: árabe, hebreo y ActualText");
{
  const marks = pdfEnginePatchMarks();
  ok("marca en tiempo de ejecución (textkit y render)", !!marks.textkit && !!marks.render, JSON.stringify(marks));
  ok("assertPdfEnginePatched no lanza", throws(() => assertPdfEnginePatched()) === null);
  const F = (n: string) => join(ROOT, "lib/pdf/fonts", n);
  Font.register({ family: "TNaskh", fonts: [{ src: F("noto-naskh-arabic-arabic-400-normal.woff") }] });
  Font.register({ family: "TNaskhL", fonts: [{ src: F("noto-naskh-arabic-latin-400-normal.woff") }] });
  Font.register({ family: "THeb", fonts: [{ src: F("noto-sans-hebrew-hebrew-400-normal.woff") }] });
  Font.register({ family: "THebL", fonts: [{ src: F("noto-sans-hebrew-latin-400-normal.woff") }] });
  Font.register({ family: "TInter", fonts: [{ src: F("inter-latin-400-normal.woff") }] });
  // Las 6 palabras que tiraban el motor sin corregir (E3) y una frase con
  // cifras, paréntesis y € (E2, espejado de signos).
  const ar = "أعددنا إلى آخر شيء شخصياً ياً · شقة مشرقة في حي سالامانكا (مدريد) بسعر 1,450,000 €";
  const he = "דירה מוארת בשכונת סלמנקה (מדריד) במחיר 1,450,000 € ונוף";
  const lat = "Piso luminoso en Salamanca (Madrid) por 1.450.000 €";
  const doc = h(Document, null, h(Page, { size: "A4", style: { padding: 40 } },
    h(Text, { style: { fontFamily: ["TNaskh", "TNaskhL"], direction: "rtl", textAlign: "right", fontSize: 12 } }, ar),
    h(Text, { style: { fontFamily: ["THeb", "THebL"], direction: "rtl", textAlign: "right", fontSize: 12, marginTop: 12 } }, he),
    h(Text, { style: { fontFamily: "TInter", fontSize: 12, marginTop: 12 } }, lat),
  ));
  let buf: Buffer | null = null;
  try {
    buf = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
  } catch (e) {
    ok("árabe y hebreo se maquetan", false, e instanceof Error ? e.message : String(e));
  }
  if (buf) {
    ok("árabe y hebreo se maquetan (sin «reading 'id'»)", buf.length > 1000);
    const r = readPdf(buf);
    const actual = r.pages[0].actual.map((s) => s.trim());
    ok("árabe: ActualText = el texto lógico exacto (letras, paréntesis, cifras)", actual.includes(ar), JSON.stringify(actual));
    ok("hebreo: ActualText = el texto lógico exacto", actual.includes(he), JSON.stringify(actual));
    ok("latino: ninguna marca ActualText (los PDF LTR no cambian)", actual.length === 2 && r.pages[0].text.includes(lat), JSON.stringify({ actual: actual.length, text: r.pages[0].text }));
    const raw = buf.toString("latin1");
    ok("el flujo usa /Span << /ActualText … >> BDC … EMC", (r.pages[0].actual.length === 2) && !/\/ActualText/.test(raw.replace(/stream[\s\S]*?endstream/g, "")));
  }
}

console.log(fails ? `\n❌ ${fails} fallo(s)` : "\n✅ corrección del motor de PDF: versiones, carga, next.config y ActualText en orden");
process.exit(fails ? 1 : 0);
