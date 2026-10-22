"use strict";
// ============================================================================
// Corrección local del motor de PDF (BCP-01 ampliación, PR5; decisiones D1 y
// D2 de Fabricio, 22-10-2026). Expediente:
// docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/result-pr5-spike.md
//
// Se mantiene @react-pdf 4.5.1 y NO se toca node_modules: esta corrección se
// aplica al CARGAR el código de dos archivos del motor, sustituyendo trozos
// exactos de su texto. Next deja @react-pdf/renderer FUERA del bundle del
// servidor (está en su lista por defecto de serverExternalPackages): Node lo
// carga de node_modules al ejecutar, también dentro del hilo del PDF. Por eso
// la corrección es un hook de carga de módulos de Node:
//   · servidor Next (next start / next dev): instrumentation.ts lo instala al
//     arrancar el proceso y lib/pdf/catalog/render-worker.ts al arrancar el
//     hilo, ANTES de cargar @react-pdf (lib/pdf/engine-patch/install.ts);
//   · scripts de verificación: scripts/pdf/engine-patch-hook.mjs (--import);
//   · y, por si algún día Next lo compila dentro del bundle, el mismo cambio
//     como loader de webpack (webpack-loader.cjs, en next.config.ts).
// Todos usan ESTE módulo: producción y pruebas llevan el mismo motor. Es
// idempotente (un código ya corregido, con la marca, no se toca otra vez).
//
// Qué corrige (defectos E2–E7 de la prueba técnica):
//   textkit 6.3.0
//     E2/E3/E4 · reorderLine: orden visual de una línea con texto de derecha a
//       izquierda. La original deja las runs en su orden lógico y rellena sus
//       glifos con los de CUALQUIER run (fuente, color y enlace en el sitio
//       equivocado) y toma un glifo por carácter (el árabe de Noto Naskh pinta
//       una letra con varios glifos: se perdían o el motor se caía). La
//       sustituta aplica la regla L2 de UAX #9 a runs enteras e invierte por
//       grupos (base + marcas) dentro de las de nivel impar.
//     E7 · slice$1: un trozo de línea empieza en el PRIMER glifo del grupo de
//       su carácter, no en el último (se perdía la base: «شقة» → «قة»).
//   render 4.5.1
//     E6 · renderGlyphs: xOffset/yOffset se escalan como xAdvance (los puntos
//       del árabe caían sobre la letra vecina).
//     D2 · ActualText: cada línea reordenada (las que llevan texto de derecha
//       a izquierda) se marca con /Span << /ActualText (texto lógico) >> BDC
//       … EMC, para que copiar y buscar den el texto correcto (E5, E9). Las
//       líneas sin texto RTL no cambian: los PDF en español, inglés, francés,
//       italiano, alemán y turco salen igual que sin la corrección.
//
// Comprobación de versión: si @react-pdf/textkit o @react-pdf/render no son
// EXACTAMENTE las versiones revisadas, o un trozo no aparece exactamente una
// vez, se LANZA un error claro (el build de Next falla; el script de Node no
// arranca). Una subida de @react-pdf exige revisar esta corrección antes.
// `npm run test:pdf-engine` lo comprueba en la CI.
// ============================================================================

const fs = require("node:fs");
const path = require("node:path");

/** Versiones revisadas. Cambiarlas sin revisar la corrección rompe el build. */
const REVIEWED = Object.freeze({ "@react-pdf/textkit": "6.3.0", "@react-pdf/render": "4.5.1" });

/** Marca que queda en el código compilado (se busca en .next tras el build). */
const MARK = "bcp-pdf-engine-patch@1 textkit-6.3.0 render-4.5.1";

const TEXTKIT_FILE = /[\\/]@react-pdf[\\/]textkit[\\/]lib[\\/]textkit\.js$/;
const RENDER_FILE = /[\\/]@react-pdf[\\/]render[\\/]lib[\\/]index\.js$/;

class EnginePatchError extends Error {
  constructor(message) {
    super(`[pdf-engine-patch] ${message} — revisa lib/pdf/engine-patch/patch.cjs (BCP-01 PR5, D1) antes de cambiar @react-pdf.`);
    this.name = "EnginePatchError";
  }
}

/** «textkit» | «render» | null según la ruta del archivo. */
function targetOf(file) {
  const f = String(file || "").split("?")[0];
  if (TEXTKIT_FILE.test(f)) return "textkit";
  if (RENDER_FILE.test(f)) return "render";
  return null;
}

/** Versión del paquete al que pertenece un archivo de su lib/. */
function versionOf(file) {
  const pkg = path.join(path.dirname(file), "..", "package.json");
  try {
    return JSON.parse(fs.readFileSync(pkg, "utf8")).version;
  } catch (err) {
    throw new EnginePatchError(`no se pudo leer ${pkg} (${err && err.message})`);
  }
}

function assertReviewed(name, version) {
  if (REVIEWED[name] !== version) throw new EnginePatchError(`${name} ${version} no es la versión revisada (${REVIEWED[name]})`);
}

function replaceOnce(source, from, to, what) {
  const n = source.split(from).length - 1;
  if (n !== 1) throw new EnginePatchError(`${what}: el texto original aparece ${n} veces (se esperaba 1)`);
  return source.replace(from, () => to);
}

// ── textkit ─────────────────────────────────────────────────────────────────

const REORDER_START = "const reorderLine = (line) => {";
const REORDER_END = "const reorderParagraph = (paragraph) => paragraph.map(reorderLine);";
const REORDER_FIXED = `const reorderLine = (line) => {
    // ${MARK} · E2/E3/E4 (L2 de UAX #9 sobre runs enteras) y D2 (texto lógico).
    const runs = line.runs || [];
    if (runs.length === 0)
        return line;
    const base = runs[0]?.attributes.direction === 'rtl' ? 1 : 0;
    const levels = runs.map((run) => run.attributes.bidiLevel ?? base);
    // L1: los espacios al final de la línea vuelven al nivel del párrafo.
    for (let i = runs.length - 1; i >= 0; i -= 1) {
        const text = line.string.slice(runs[i].start, runs[i].end);
        if (!/^\\s*$/.test(text))
            break;
        levels[i] = base;
    }
    const max = Math.max(...levels);
    if (max === 0)
        return line;
    const min = Math.min(...levels);
    const lowestOdd = min % 2 === 1 ? min : min + 1;
    const order = runs.map((_, i) => i);
    for (let k = max; k >= lowestOdd; k -= 1) {
        let i = 0;
        while (i < order.length) {
            if (levels[order[i]] < k) { i += 1; continue; }
            let j = i;
            while (j < order.length && levels[order[j]] >= k) j += 1;
            const seq = order.slice(i, j).reverse();
            for (let m = 0; m < seq.length; m += 1) order[i + m] = seq[m];
            i = j;
        }
    }
    const reversedRun = (run) => {
        const glyphs = run.glyphs || [];
        const clusters = [];
        glyphs.forEach((glyph, k) => {
            const attaches = clusters.length > 0 && (!glyph?.codePoints?.length || glyph.isMark);
            if (attaches) clusters[clusters.length - 1].push(k);
            else clusters.push([k]);
        });
        const idx = clusters.reverse().flat();
        return Object.assign({}, run, {
            glyphs: idx.map((k) => glyphs[k]),
            positions: idx.map((k) => run.positions[k]),
        });
    };
    const updatedRuns = order.map((i) => (levels[i] % 2 === 1 ? reversedRun(runs[i]) : runs[i]));
    const charLevels = getBidiLevels$1(runs);
    const updatedString = bidi$2.getReorderedString(line.string, { paragraphs: [{ start: 0, end: length$1(line) - 1, level: base }], levels: charLevels });
    // D2 · texto LÓGICO de la línea para /ActualText: la cadena antes de
    // reordenar, deshaciendo el espejado de signos (mirrorString) de los
    // caracteres de nivel impar, sin el salto final y en NFC.
    let logical = '';
    for (let i = 0; i < line.string.length; i += 1) {
        const ch = line.string.charAt(i);
        logical += charLevels[i] % 2 === 1 ? (bidi$2.getMirroredCharacter(ch) || ch) : ch;
    }
    logical = logical.replace(/\\n+$/, '').normalize('NFC');
    return { box: line.box, runs: updatedRuns, string: updatedString, bcpActualText: logical };
};
`;
const SLICE_OLD = "    const startIndex = glyphIndexAt(start, run);";
const SLICE_NEW =
  "    // " + MARK + " · E7: el trozo empieza en el PRIMER glifo del grupo de su carácter.\n" +
  "    const lastStart = glyphIndexAt(start, run);\n" +
  "    const startIndex = run?.glyphIndices && lastStart < run.glyphIndices.length ? run.glyphIndices.indexOf(run.glyphIndices[lastStart]) : lastStart;";

function markerLine(part) {
  return `\n;(globalThis.__bcpPdfEnginePatch = globalThis.__bcpPdfEnginePatch || {})[${JSON.stringify(part)}] = ${JSON.stringify(MARK)};\n`;
}

function patchTextkit(source) {
  let s = String(source);
  const a = s.indexOf(REORDER_START);
  const b = s.indexOf(REORDER_END);
  if (a < 0 || b < a || s.indexOf(REORDER_START, a + 1) >= 0) throw new EnginePatchError("textkit: reorderLine no encontrada tal cual");
  s = s.slice(0, a) + REORDER_FIXED + s.slice(b);
  s = replaceOnce(s, SLICE_OLD, SLICE_NEW, "textkit: slice$1");
  return s + markerLine("textkit");
}

// ── render ──────────────────────────────────────────────────────────────────

const NL = "\n        ";
const GLYPHS_OLD = ["xAdvance: pos.xAdvance * scale,", "yAdvance: pos.yAdvance * scale,", "xOffset: pos.xOffset,", "yOffset: pos.yOffset,"].join(NL);
const GLYPHS_NEW = ["xAdvance: pos.xAdvance * scale,", "yAdvance: pos.yAdvance * scale,", "xOffset: pos.xOffset * scale,", "yOffset: pos.yOffset * scale,"].join(NL);
const LINE_OPEN_OLD = "    ctx.translate(line.box.x, line.box.y + lineAscent);\n    for (let i = 0; i < line.runs.length; i += 1) {";
const LINE_OPEN_NEW =
  "    ctx.translate(line.box.x, line.box.y + lineAscent);\n" +
  "    // " + MARK + " · D2: texto lógico de la línea (ActualText) para copiar y buscar.\n" +
  "    const bcpActualText = typeof line.bcpActualText === 'string' && line.bcpActualText.length > 0 && typeof ctx.markContent === 'function' ? line.bcpActualText : null;\n" +
  "    if (bcpActualText !== null)\n" +
  "        ctx.markContent('Span', { actual: bcpActualText });\n" +
  "    for (let i = 0; i < line.runs.length; i += 1) {";
const LINE_CLOSE_OLD = "        renderRun(ctx, run);\n    }\n    ctx.restore();";
const LINE_CLOSE_NEW = "        renderRun(ctx, run);\n    }\n    if (bcpActualText !== null)\n        ctx.endMarkedContent();\n    ctx.restore();";

function patchRender(source) {
  let s = String(source);
  s = replaceOnce(s, GLYPHS_OLD, GLYPHS_NEW, "render: renderGlyphs (E6)");
  s = replaceOnce(s, LINE_OPEN_OLD, LINE_OPEN_NEW, "render: renderLine (D2, apertura)");
  s = replaceOnce(s, LINE_CLOSE_OLD, LINE_CLOSE_NEW, "render: renderLine (D2, cierre)");
  return s + markerLine("render");
}

/**
 * Aplica la corrección al código de `file` si es uno de los dos archivos del
 * motor (comprobando antes su versión). Devuelve el código (cambiado o no).
 * Lanza EnginePatchError si la versión o el texto no son los revisados.
 */
function patchEngineSource(file, source) {
  const target = targetOf(file);
  if (target && String(source).includes(MARK)) return source;
  if (target === "textkit") {
    assertReviewed("@react-pdf/textkit", versionOf(file));
    return patchTextkit(source);
  }
  if (target === "render") {
    assertReviewed("@react-pdf/render", versionOf(file));
    return patchRender(source);
  }
  return source;
}

module.exports = { REVIEWED, MARK, EnginePatchError, targetOf, versionOf, assertReviewed, patchTextkit, patchRender, patchEngineSource };
