// SOLO PRUEBA TÉCNICA (PR5 · 5.1, DA21). Hook de carga de Node que, al cargar
// @react-pdf/textkit 6.3.0, sustituye SOLO su función `reorderLine` (orden
// visual de una línea con texto de derecha a izquierda) y, en
// @react-pdf/render 4.5.1, la escala de xOffset/yOffset de renderGlyphs. No modifica
// node_modules ni añade dependencias; si el texto original no coincide
// exactamente (otra versión de textkit), no toca nada y lo avisa.
//
// El fallo de la original (comprobado en scripts/pdf-rtl-spike.mts):
//   · deja las runs en su orden lógico y rellena los huecos de glifos de cada
//     run con los glifos reordenados de CUALQUIER run, así que la fuente, el
//     color y el enlace de cada run se quedan donde estaban: una línea hebrea
//     con cifras o puntuación de Inter pinta los glifos de Inter con la fuente
//     hebrea (basura, E2) y el color cae en otra palabra (E4);
//   · elige UN glifo por carácter con stringIndices, así que las fuentes que
//     pintan una letra con varios glifos (Noto Naskh Arabic: esqueleto + puntos;
//     hamza aparte) pierden glifos o rompen («reading 'id'», E3).
//   · y @react-pdf/render 4.5.1 (renderGlyphs) pasa xAdvance a unidades de
//     texto (×1000/tamaño) pero NO xOffset/yOffset, que luego se multiplican
//     por tamaño/1000: el desplazamiento de las marcas (puntos del árabe,
//     niqqud) se queda en ~2 % y el punto cae sobre la letra vecina (E6). El
//     hook también escala esos dos campos;
//   · y textkit (slice$1) empieza cada trozo de línea en el ÚLTIMO glifo del
//     grupo de su primer carácter: si esa letra se pinta con base + puntos, se
//     pierde la base («شقة» sale «قة», E7). Se empieza en el primero del grupo.
// La sustituta aplica la regla L2 de Unicode (UAX #9) sobre RUNS enteras (cada
// run tiene un solo nivel bidi) y, dentro de cada run de nivel impar, invierte
// por grupos (glifo base + sus marcas o glifos sin código), conservando el
// orden interno de cada grupo para que las marcas sigan sobre su base.
//
//   node --import ./scripts/node-ts-loader.mjs --import ./scripts/pdf/textkit-bidi-patch.mjs …
import { register } from "node:module";

globalThis.__textkitBidiPatch = true;

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const START = "const reorderLine = (line) => {";
      const END = "const reorderParagraph = (paragraph) => paragraph.map(reorderLine);";
      const FIXED = ${JSON.stringify(`const reorderLine = (line) => {
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
    return { box: line.box, runs: updatedRuns, string: updatedString };
};
`)};
      const NL = String.fromCharCode(10) + "        ";
      const R_OLD = ["xAdvance: pos.xAdvance * scale,", "yAdvance: pos.yAdvance * scale,", "xOffset: pos.xOffset,", "yOffset: pos.yOffset,"].join(NL);
      const R_NEW = ["xAdvance: pos.xAdvance * scale,", "yAdvance: pos.yAdvance * scale,", "xOffset: pos.xOffset * scale,", "yOffset: pos.yOffset * scale,"].join(NL);
      export async function load(url, context, next) {
        const result = await next(url, context);
        if (url.endsWith("/@react-pdf/render/lib/index.js")) {
          const source = String(result.source);
          if (source.split(R_OLD).length !== 2) {
            console.warn("textkit-bidi-patch: renderGlyphs no encontrada; render sin parchear");
            return result;
          }
          return { ...result, source: source.replace(R_OLD, R_NEW) };
        }
        if (!url.endsWith("/@react-pdf/textkit/lib/textkit.js")) return result;
        let source = String(result.source);
        // E7 · slice$1: el inicio de un trozo es el PRIMER glifo del grupo de su carácter, no el último.
        const S_OLD = "    const startIndex = glyphIndexAt(start, run);";
        const S_NEW = "    const lastStart = glyphIndexAt(start, run);" + String.fromCharCode(10) + "    const startIndex = run?.glyphIndices && lastStart < run.glyphIndices.length ? run.glyphIndices.indexOf(run.glyphIndices[lastStart]) : lastStart;";
        if (source.split(S_OLD).length === 2) source = source.replace(S_OLD, S_NEW);
        else console.warn("textkit-bidi-patch: slice$1 no encontrada; inicio de trozo sin parchear");
        const a = source.indexOf(START), b = source.indexOf(END);
        if (a < 0 || b < a) {
          console.warn("textkit-bidi-patch: reorderLine no encontrada; textkit sin parchear");
          return result;
        }
        return { ...result, source: source.slice(0, a) + FIXED + source.slice(b) };
      }
    `),
  import.meta.url,
);
