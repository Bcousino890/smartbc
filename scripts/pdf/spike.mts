// SOLO VERIFICACIÓN LOCAL (PDF del catálogo, T1): tres PDF reales mínimos para
// comprobar, antes de construir nada, lo difícil de la dirección aprobada:
//   1) la portada con el ARCO y una foto;
//   2) un ÍNDICE de 30 líneas con números de página correctos en dos pasadas y
//      enlaces internos a cada destino;
//   3) las FUENTES incrustadas y los glifos del español.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/pdf/spike.mts <carpeta>
import { createElement as h } from "react";
import { writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { Document, Font, Image, Link, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { DISPLAY, LABEL, TEXT, freshCatalogFonts, noHyphens, registerCatalogFonts } from "../../lib/pdf/catalog/fonts.ts";
// Sin reset, react-pdf reutiliza entre documentos la fuente ya cargada y los
// caracteres que se usan por primera vez en un documento posterior pierden su
// correspondencia de texto (se ven, pero no se pueden copiar ni buscar).
// Con FRESH=1 se vuelve a registrar todo antes de cada documento (freshCatalogFonts).
const fresh = process.env.FRESH === "1";
const render = (d: Parameters<typeof renderToBuffer>[0]) => { if (fresh) freshCatalogFonts(); return renderToBuffer(d); };

const out = process.argv[2] ?? "/tmp/pdf-spike";
mkdirSync(out, { recursive: true });
registerCatalogFonts();
const PAPER = "#f4ede1", INK = "#2b2118", ACCENT = "#9b4a2e", MAT = "#fbf7f0";
const T = (style: object, s: string, extra: object = {}) => h(Text, { style, hyphenationCallback: noHyphens, ...extra }, s);

// 1 · Portada con arco (foto sintética con degradado y un cuadrado rojo arriba
// a la izquierda para ver que el recorte es el del arco, sin deformar).
const photo = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 140, g: 120, b: 95 } } })
  .composite([{ input: Buffer.from(`<svg width="1200" height="1600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8c9b2"/><stop offset="1" stop-color="#6f5c46"/></linearGradient></defs><rect width="1200" height="1600" fill="url(#g)"/><rect x="0" y="0" width="300" height="300" fill="#c0392b"/><rect x="560" y="0" width="80" height="1600" fill="#ffffff" opacity=".5"/></svg>`) }])
  .jpeg({ quality: 80 }).toBuffer();
const photoUri = `data:image/jpeg;base64,${photo.toString("base64")}`;
const A4 = { width: 595.28, height: 841.89 };
const archW = 0.62 * (A4.width - 2 * 51);
const archH = archW * 1.25;
const cover = h(Document, { title: "Prueba arco" },
  h(Page, { size: "A4", style: { backgroundColor: PAPER, padding: 51, alignItems: "center" } },
    T({ fontFamily: TEXT, fontSize: 7.5, letterSpacing: 2, color: ACCENT, marginTop: 30 }, "SELECCIÓN PRIVADA · Nº 01 · OTOÑO 2026"),
    h(View, { style: { marginTop: 24, width: archW + 12, height: archH + 12, padding: 6, backgroundColor: MAT, borderTopLeftRadius: (archW + 12) / 2, borderTopRightRadius: (archW + 12) / 2, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 } },
      h(Image, { src: photoUri, style: { width: archW, height: archH, objectFit: "cover", borderTopLeftRadius: archW / 2, borderTopRightRadius: archW / 2, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 } })),
    T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 28, color: INK, marginTop: 22 }, "Salamanca y Chamberí"),
  ));
writeFileSync(`${out}/1-arco.pdf`, await render(cover));

// 2 · Índice de 30 líneas en dos pasadas.
const N = 30;
function indexDoc(pages: (number | null)[], seen: number[]) {
  const lines = Array.from({ length: N }, (_, i) =>
    h(Link, { key: `l${i}`, src: `#viv-${i}`, style: { textDecoration: "none", color: INK } },
      h(View, { style: { flexDirection: "row", borderBottom: `0.5pt dotted ${ACCENT}`, paddingVertical: 5 } },
        T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 10, color: ACCENT, width: 24 }, String(i + 1).padStart(2, "0")),
        T({ fontFamily: TEXT, fontSize: 9.5, flexGrow: 1 }, `Vivienda de prueba número ${i + 1} con un título bastante largo`),
        T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 10 }, pages[i] == null ? "··" : String(pages[i])),
      )));
  const items = Array.from({ length: N }, (_, i) =>
    h(Page, { key: `p${i}`, size: "A4", style: { backgroundColor: PAPER, padding: 51 } },
      h(View, { id: `viv-${i}` },
        T({ fontFamily: TEXT, fontSize: 1, color: PAPER }, "", { render: ({ pageNumber }: { pageNumber: number }) => { seen[i] = pageNumber; return " "; } }),
        T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 20 }, `Vivienda ${i + 1}`),
      ),
      // Algunas viviendas ocupan varias páginas: los números no son triviales.
      ...(i % 4 === 1 ? [T({ fontFamily: TEXT, fontSize: 10.5, lineHeight: 1.5, marginTop: 10 }, "Texto largo de relleno. ".repeat(40 + i * 25))] : []),
    ));
  return h(Document, { title: "Prueba índice" },
    h(Page, { size: "A4", style: { backgroundColor: PAPER, padding: 51 } },
      T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 18, marginBottom: 8 }, "En esta selección"),
      ...lines),
    ...items);
}
const seen1: number[] = [];
await render(indexDoc(Array(N).fill(null), seen1));
const seen2: number[] = [];
const buf2 = await render(indexDoc(seen1, seen2));
writeFileSync(`${out}/2-indice.pdf`, buf2);
writeFileSync(`${out}/2-indice-paginas.json`, JSON.stringify({ pasada1: seen1, pasada2: seen2 }));

// 3 · Glifos.
const glyphs = "Áá Éé Íí Óó Úú Ññ Üü ¿Sí? ¡Claro! «comillas» 1.450.000 € 186 m² nº 01 · 2.ª planta — guion largo · Playfair, Cinzel e Inter";
const g = h(Document, { title: "Prueba glifos", author: "Benjamín Cousiño Propiedades" },
  h(Page, { size: "A4", style: { backgroundColor: PAPER, padding: 51 } },
    T({ fontFamily: DISPLAY, fontSize: 16 }, glyphs),
    T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 16, marginTop: 8 }, glyphs),
    T({ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, marginTop: 8 }, glyphs),
    T({ fontFamily: TEXT, fontSize: 12, marginTop: 8 }, glyphs),
    T({ fontFamily: TEXT, fontWeight: 600, fontSize: 12, marginTop: 8 }, glyphs),
    T({ fontFamily: TEXT, fontSize: 7.5, letterSpacing: 2, marginTop: 8 }, "SELECCIÓN PRIVADA · nº 01 · 2.ª".toUpperCase()),
    // Ordinales en Inter (trae «º» y «ª» propios) y etiquetas en Cinzel:
    h(Text, { style: { fontFamily: TEXT, fontSize: 12, marginTop: 8 }, hyphenationCallback: noHyphens }, "Inter con ordinales: nº 01 · 2.ª planta · 3ºB"),
    h(Text, { style: { fontFamily: LABEL, fontSize: 7.5, letterSpacing: 2, marginTop: 8 }, hyphenationCallback: noHyphens }, "SELECCIÓN PRIVADA · Nº 01 · OTOÑO 2026"),
  ));
writeFileSync(`${out}/3-glifos.pdf`, await render(g));
console.log("hecho", out);
