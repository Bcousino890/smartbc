import { createElement as h, type ReactElement, type ReactNode } from "react";
import { Defs, Document, Image, LinearGradient, Link, Page, Path, Rect, Stop, Svg, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { PublicCatalog, PublicItem } from "@/lib/catalogs/public-contract";
import { planItemExport, pdfMetadata, type ItemExport } from "@/lib/catalogs/export/plan";
import { formatNumber, intlLocale, isCatalogLanguage, isRtl, type CatalogDictionary, type CatalogLanguage } from "@/lib/catalogs/i18n";
import { forPdf, pdfTexts, pdfVersionDate, type CatalogPdfDictionary } from "@/lib/catalogs/pdf-i18n";
import { catalogFonts, noHyphens, type CatalogFonts } from "./fonts";

// ============================================================================
// PDF del catálogo · documento (enmienda visual 2026-10-20, DV10; P1–P10). A4
// vertical, una página por hoja, con la identidad de la publicación del
// itinerario: portada oscura a sangre con la marca en blanco, páginas marfil
// con filetes finos, Playfair (titulares y cifras), Cinzel (etiquetas en
// versalitas) e Inter (texto), y un colofón oscuro al final. El CONTENIDO es
// la proyección pública (la del lector) repartida por planItemExport (todas
// las secciones, K4; fotos P2). Sin la dirección del enlace ni QR (P3): el
// único enlace externo es `tel:`. Índice con números de página correctos en
// dos pasadas (P7): la primera anota la página de cada vivienda (onPage) y
// la segunda los escribe. Escrito con createElement (sin JSX) para poder
// generarlo también desde los scripts de verificación con Node.
//
// PR5 (BCP-01 ampliación, idiomas): el idioma es el del token
// (`catalog.lang`, instantánea 0223). Todas las etiquetas fijas salen de los
// diccionarios (lib/catalogs/i18n.ts y pdf-i18n.ts), las mayúsculas con
// toLocaleUpperCase del idioma (turco: i → İ), cifras y fechas con su Intl
// (forPdf quita las marcas bidi invisibles y normaliza U+202F), las familias
// por idioma (fonts.ts) y /Lang del idioma. En árabe y hebreo: texto de
// derecha a izquierda, filas reflejadas a mano (react-pdf no refleja la
// maquetación), sin espaciado entre letras (rompería el árabe ligado), sin
// cursiva y con las cifras, precios, teléfonos y folios en su propio texto
// LTR. El contenido (títulos y descripciones) llega tal cual de la
// proyección y se escribe en su propia dirección. En es, en, fr, it y de el
// documento es el de antes (mismos estilos y textos; fr con latin-ext detrás).
// ============================================================================

export const PAPER = "#fbf8f3";
export const INK = "#0a0a0a";
export const GOLD = "#c9a96e";
export const GOLD_DARK = "#a88a52";
export const CREAM = "#fbf8f3";
/** Tinta rebajada (sobre marfil). */
export const SOFT = "#6b6b68";
const MUTED = "#8f8d88";
const LINE = "#e2dfd9";

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 51; // 18 mm
const CONTENT_W = A4_W - 2 * MARGIN;
/** Cajas impresas de las fotos, en puntos (PR7a): de aquí salen los anchos de
 *  foto de generate.ts (300 ppi). Portada a sangre en todo el A4; apertura a
 *  todo el ancho de texto y 300 pt de alto; «Más fotos» en dos columnas. */
export const PRINT_BOXES = {
  page: { w: A4_W, h: A4_H },
  opening: { w: CONTENT_W, h: 300 },
  more: { w: (CONTENT_W - 12) / 2, h: 175 },
} as const;

export type PdfPhoto = { ok: true; data: Buffer; width: number; height: number } | { ok: false };

export interface CatalogPdfInput {
  catalog: PublicCatalog;
  /** Momento de la captura (la versión que se imprime). */
  capturedAt: Date;
  /** Logo oficial como data URI (loadLogoDataUri), o null. */
  logo: string | null;
  /** El mismo logo en blanco (loadWhiteLogoDataUri) para la portada y el
   *  colofón sobre tinta; si falta, esas páginas van sin marca. */
  logoWhite?: string | null;
  /** Fotos ya leídas: `cover` y `${itemKey}#${índice}`. Ausente = sin leer. */
  photos: Map<string, PdfPhoto>;
  /** 2.ª pasada: página de cada vivienda (por su clave). */
  pageOf?: Map<string, number>;
  /** 1.ª pasada: se llama con la página real de cada vivienda. */
  onPage?: (itemKey: string, page: number) => void;
}

export const photoId = (itemKey: string, index: number) => `${itemKey}#${index}`;

// ── Texto e idioma ─────────────────────────────────────────────────────────

type Style = Record<string, unknown>;
type Make = (style: Style, s: string, extra?: Record<string, unknown>) => ReactElement;

/** Primera letra con dirección: árabe/hebreo → rtl; cualquier otra letra → ltr. */
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
function dirOf(s: string): "ltr" | "rtl" {
  for (const ch of s) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (/\p{L}/u.test(ch)) return "ltr";
  }
  return "ltr";
}

function makeStyles(f: CatalogFonts, rtl: boolean) {
  // Espaciado entre letras de las etiquetas: nunca en árabe ni hebreo.
  const ls = (v: number) => (rtl ? 0 : v);
  return {
    /** Etiqueta en versalitas (Cinzel, tracking amplio). */
    label: { fontFamily: f.label, fontWeight: 500, fontSize: 7, letterSpacing: ls(1.9), color: SOFT },
    labelGold: { fontFamily: f.label, fontWeight: 500, fontSize: 7, letterSpacing: ls(1.9), color: GOLD_DARK },
    h1: { fontFamily: f.display, fontSize: 30, lineHeight: 1.05, color: INK },
    h2: { fontFamily: f.display, fontSize: 21, lineHeight: 1.12, color: INK },
    h3: { fontFamily: f.display, fontSize: 13.5, lineHeight: 1.25, color: INK },
    price: { fontFamily: f.display, fontSize: 15, color: INK },
    body: { fontFamily: f.text, fontSize: 10, lineHeight: 1.55, color: INK },
    lead: { fontFamily: f.text, fontSize: 10.5, lineHeight: 1.55, color: INK },
    cap: { fontFamily: f.label, fontWeight: 500, fontSize: 6.5, letterSpacing: ls(1.4), color: MUTED },
    /** Pies de foto y avisos de foto: sin tracking, para que el texto se extraiga
     *  tal cual («Foto 3 de 12», «Foto no disponible»). */
    photoCap: { fontFamily: f.label, fontWeight: 500, fontSize: 6.5, color: MUTED },
    /** Pie de página y cabecera de continuación: tampoco llevan tracking (al
     *  extraer el texto, cada letra espaciada contaría como una palabra). */
    runner: { fontFamily: f.label, fontWeight: 500, fontSize: 6.5, color: MUTED },
    soft: { fontFamily: f.text, fontSize: 9, color: SOFT },
    serifNum: { fontFamily: f.display, fontSize: 11, color: INK },
  };
}

/** Todo lo que depende del idioma, para un documento. */
interface Lx {
  lang: CatalogLanguage;
  rtl: boolean;
  d: CatalogDictionary;
  p: CatalogPdfDictionary;
  f: CatalogFonts;
  S: ReturnType<typeof makeStyles>;
  /** Mayúsculas del idioma (turco: i → İ). */
  up: (s: string) => string;
  /** Texto fijo en el idioma del documento. */
  T: Make;
  /** Contenido de la proyección (título, descripción…): en su propia dirección. */
  C: Make;
  /** Cifras, precios, teléfonos y folios: siempre LTR. */
  N: Make;
  /** Lo que tiene cifras va LTR; si no, como texto fijo. */
  V: Make;
  /** Dirección de las filas: reflejadas a mano en RTL. */
  row: "row" | "row-reverse";
  /** El lado «del final» de la fila (márgenes y rellenos reflejados). */
  end: (prop: "margin" | "padding", v: number) => Style;
  /** El lado «del principio». */
  start: (prop: "margin" | "padding", v: number) => Style;
  /** Fecha y hora de la versión impresa. */
  version: (at: Date) => string;
}

function makeLx(catalog: PublicCatalog): Lx {
  const lang: CatalogLanguage = isCatalogLanguage(catalog.lang) ? catalog.lang : "es";
  const rtl = isRtl(lang);
  const { d, p } = pdfTexts(lang);
  const f = catalogFonts(lang);
  const locale = intlLocale(lang);
  const base = (style: Style, s: string, extra: Record<string, unknown>) =>
    h(Text, { style: { fontFamily: f.text, ...style }, hyphenationCallback: noHyphens, ...extra }, forPdf(s));
  // En LTR, exactamente el texto de antes del PR5 (sin dirección ni alineación
  // añadidas). En RTL, la alineación por defecto es la derecha y se refleja.
  const flip = (a: unknown) => (a === "center" || a === "justify" ? a : a === "right" ? "left" : "right");
  const dirText = (dir: (s: string) => "ltr" | "rtl"): Make => (style, s, extra = {}) =>
    rtl ? base({ ...style, ...(style.fontStyle === "italic" ? { fontStyle: "normal" } : {}), direction: dir(s), textAlign: flip(style.textAlign) }, s, extra) : base(style, s, extra);
  const T = dirText(() => "rtl");
  const N = dirText(() => "ltr");
  const side = (which: "Left" | "Right") => (prop: "margin" | "padding", v: number): Style => ({ [`${prop}${which}`]: v });
  return {
    lang,
    rtl,
    d,
    p,
    f,
    S: makeStyles(f, rtl),
    up: (s) => s.toLocaleUpperCase(locale),
    T,
    C: dirText(dirOf),
    N,
    V: (style, s, extra) => (/\d/.test(s) ? N(style, s, extra) : T(style, s, extra)),
    row: rtl ? "row-reverse" : "row",
    end: rtl ? side("Left") : side("Right"),
    start: rtl ? side("Right") : side("Left"),
    version: (at) => pdfVersionDate(at, lang),
  };
}

function paragraphs(L: Lx, text: string, style: Style = L.S.body): ReactElement[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => L.C({ ...style, marginTop: i ? 6 : 0 }, p.replace(/\s*\n\s*/g, " ")));
}

const n2 = (i: number) => String(i + 1).padStart(2, "0");

// ── Piezas ──────────────────────────────────────────────────────────────────

/** Filete horizontal (el único «borde» de la publicación). */
function rule(width: number | string = "100%", color = LINE, top = 0): ReactElement {
  return h(View, { style: { width, borderBottomWidth: 0.6, borderBottomColor: color, marginTop: top } });
}

/** Filete corto centrado: el ornamento de la referencia. El color va en
 *  hexadecimal y la transparencia en `opacity`: PDFKit no entiende rgba en
 *  los bordes (los pintaba de verde). */
function ornament(color = GOLD, top = 0, opacity = 1): ReactElement {
  return h(View, { style: { width: 30, borderBottomWidth: 0.8, borderBottomColor: color, alignSelf: "center", marginTop: top, opacity } });
}

/** «01 / 04» con su filete hasta el margen. */
function chapterMark(L: Lx, index: number, total: number): ReactElement {
  return h(
    View,
    { style: { flexDirection: L.row, alignItems: "center" } },
    L.N({ ...L.S.label, color: MUTED }, `${n2(index)}  /  ${String(total).padStart(2, "0")}`),
    h(View, { style: { flexGrow: 1, ...L.start("margin", 12), borderBottomWidth: 0.6, borderBottomColor: LINE } }),
  );
}

/** Dato tipográfico: etiqueta minúscula arriba, valor en serif debajo. */
function dataPoint(L: Lx, label: string, value: string): ReactElement {
  return h(View, { key: label, style: { flexGrow: 1, flexBasis: 0 } }, L.T(L.S.label, L.up(label)), L.V({ fontFamily: L.f.display, fontSize: 14, color: INK, marginTop: 3 }, value));
}

/** Tamaño de la foto dentro de una caja, sin recortar ni deformar. */
function fit(p: { width: number; height: number }, maxW: number, maxH: number): { w: number; h: number } {
  const r = Math.min(maxW / p.width, maxH / p.height);
  return { w: Math.round(p.width * r * 10) / 10, h: Math.round(p.height * r * 10) / 10 };
}

function missing(L: Lx, text: string, w: number, height: number): ReactElement {
  return h(
    View,
    { style: { width: w, height, backgroundColor: "#f0ede6", alignItems: "center", justifyContent: "center" } },
    L.T({ ...L.S.photoCap, fontSize: 7.5 }, text),
  );
}

/** Fotografía entera (sin recortar); si no se pudo leer, «Foto no disponible». */
function photoBlock(L: Lx, photo: PdfPhoto | undefined, maxW: number, maxH: number, fallbackRatio = 0.66): ReactElement {
  if (!photo || !photo.ok) return missing(L, L.d.photoUnavailable, maxW, Math.min(maxH, maxW * fallbackRatio));
  const { w, h: hh } = fit(photo, maxW, maxH);
  return h(View, { style: { alignSelf: "center" } }, h(Image, { src: { data: photo.data, format: "jpg" }, style: { width: w, height: hh } }));
}

function footer(L: Lx, catalog: PublicCatalog): ReactElement {
  return h(
    View,
    { fixed: true, style: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 22, flexDirection: L.row, justifyContent: "space-between", alignItems: "baseline", borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 5 } },
    L.C(L.S.runner, L.up(catalog.title || L.p.catalog)),
    L.N({ fontFamily: L.f.display, fontSize: 8.5, color: SOFT }, "", { render: ({ pageNumber }: { pageNumber: number }) => String(pageNumber) }),
  );
}

function logoBlock(logo: string | null | undefined, width: number, top: number): ReactElement | null {
  if (!logo) return null;
  return h(Image, { src: logo, style: { width, height: (width * 519) / 3282, alignSelf: "center", marginTop: top } });
}

// ── Portada ─────────────────────────────────────────────────────────────────

function coverPage(L: Lx, input: CatalogPdfInput): ReactElement {
  const { catalog } = input;
  const { S } = L;
  const photo = input.photos.get("cover");
  const cream = (a: number) => `rgba(251, 248, 243, ${a})`;
  const layers: ReactNode[] = [];
  if (photo && photo.ok) {
    layers.push(h(Image, { key: "ph", src: { data: photo.data, format: "jpg" }, style: { position: "absolute", top: 0, left: 0, width: A4_W, height: A4_H - 1, objectFit: "cover" } }));
    // Doble velo: uno vertical para el texto, otro plano para el contraste.
    layers.push(
      h(
        Svg,
        { key: "veil", width: A4_W, height: A4_H - 1, style: { position: "absolute", top: 0, left: 0 } },
        h(Defs, null, h(LinearGradient, { id: "veil", x1: 0, y1: 0, x2: 0, y2: 1 }, h(Stop, { offset: "0", stopColor: INK, stopOpacity: 0.85 }), h(Stop, { offset: "0.5", stopColor: INK, stopOpacity: 0.65 }), h(Stop, { offset: "1", stopColor: INK, stopOpacity: 0.92 }))),
        h(Rect, { x: 0, y: 0, width: A4_W, height: A4_H, fill: "url('#veil')" }),
      ),
    );
    layers.push(h(View, { key: "veil2", style: { position: "absolute", top: 0, left: 0, width: A4_W, height: A4_H - 1, backgroundColor: INK, opacity: 0.25 } }));
  }
  // La página va sin márgenes y el contenido en una vista propia: las capas
  // a sangre miden la página entera y, con márgenes, react-pdf las tomaba por
  // desbordamiento y las mandaba a hojas nuevas (la portada acababa en la 3.ª).
  return h(
    Page,
    { size: "A4", style: { backgroundColor: INK, padding: 0 } },
    ...layers,
    h(
      View,
      { style: { height: A4_H, paddingHorizontal: MARGIN, paddingTop: 52, paddingBottom: 40 } },
      h(
        View,
        { style: { alignItems: "center" } },
        logoBlock(input.logoWhite, CONTENT_W * 0.3, 0),
        L.T({ ...S.label, color: cream(0.55), marginTop: 10 }, "PRIVATE CLIENT SERVICES"),
      ),
      h(
        View,
        { style: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 30 } },
        L.T({ ...S.label, fontSize: 7.5, color: cream(0.7) }, L.up(L.d.privateSelection)),
        L.C({ ...S.h1, fontSize: 40, color: CREAM, textAlign: "center", marginTop: 16, maxWidth: CONTENT_W * 0.9 }, catalog.title || L.p.catalog),
        ornament(CREAM, 22, 0.35),
        catalog.preparedBy ? L.T({ ...S.label, color: cream(0.55), marginTop: 22 }, L.up(L.d.preparedBy)) : null,
        catalog.preparedBy ? L.C({ fontFamily: L.f.display, ...(L.f.italic ? { fontStyle: "italic" } : {}), fontSize: 19, color: CREAM, marginTop: 6, textAlign: "center" }, catalog.preparedBy) : null,
        L.T({ ...S.label, fontSize: 8, letterSpacing: L.rtl ? 0 : 1.4, color: cream(0.85), marginTop: 30 }, L.up(catalog.edition)),
        L.T({ ...S.soft, color: cream(0.55), marginTop: 6 }, L.d.homesCount(catalog.items.length)),
      ),
      L.T({ ...S.soft, fontSize: 7.5, color: cream(0.35), textAlign: "center" }, L.p.versionOf(L.version(input.capturedAt))),
    ),
  );
}

// ── Introducción e índice ───────────────────────────────────────────────────

function introAndIndexPage(L: Lx, input: CatalogPdfInput): ReactElement {
  const { catalog } = input;
  const { S } = L;
  const lines = catalog.items.map((it, i) =>
    h(
      Link,
      { key: it.key, src: `#viv-${i}`, style: { textDecoration: "none", color: INK } },
      h(
        View,
        { wrap: false, style: { paddingVertical: 7, borderBottomWidth: 0.6, borderBottomColor: LINE } },
        h(
          View,
          { style: { flexDirection: L.row, alignItems: "flex-start" } },
          L.N({ ...S.label, color: MUTED, width: 28, marginTop: 2 }, n2(i)),
          h(
            View,
            // Anchos explícitos: con flexShrink solo, el título no partía y se
            // montaba sobre el precio. Sin tracking por lo mismo (react-pdf no
            // cuenta el letterSpacing al partir las líneas).
            { style: { width: CONTENT_W - 28 - 130, ...L.end("padding", 10) } },
            L.C({ fontFamily: L.f.label, fontWeight: 500, fontSize: 8, color: INK }, L.up(it.title)),
            L.C({ ...S.soft, fontSize: 8, marginTop: 2 }, it.place ?? L.d.placeNoData),
            it.reserved ? L.T({ ...S.label, fontSize: 6, color: GOLD_DARK, marginTop: 3 }, L.up(L.d.reserved)) : null,
          ),
          h(View, { style: { alignItems: L.rtl ? "flex-start" : "flex-end", width: 130 } }, L.V({ ...S.serifNum, fontSize: 12, textAlign: "right" }, it.price)),
        ),
        // El folio (números de página reales, P7) en su propia línea bajo la
        // entrada: al extraer el texto no comparte base con nada.
        h(View, { style: { flexDirection: L.row, justifyContent: "flex-end", marginTop: 3 } }, L.N({ ...S.serifNum, fontSize: 9.5, color: SOFT }, input.pageOf?.get(it.key) != null ? String(input.pageOf.get(it.key)) : "··")),
      ),
    ),
  );
  const runnerSide = L.rtl ? { right: MARGIN } : { left: MARGIN };
  return h(
    Page,
    { size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: 56 } },
    L.T({ ...S.runner, position: "absolute", top: 26, ...runnerSide }, "", { fixed: true, render: ({ subPageNumber }: { subPageNumber: number }) => (subPageNumber > 1 ? forPdf(L.up(`${L.d.contents} (${L.p.continuation})`)) : "") }),
    catalog.intro
      ? h(
          View,
          { style: { marginBottom: 26 } },
          L.T(S.labelGold, L.up(L.d.introLabel)),
          L.C({ ...S.h2, marginTop: 6, marginBottom: 8 }, catalog.title || L.p.catalog),
          ...paragraphs(L, catalog.intro, S.lead),
          catalog.preparedBy ? L.T({ ...S.soft, marginTop: 10 }, L.d.greeting) : null,
          catalog.preparedBy ? L.C({ fontFamily: L.f.display, ...(L.f.italic ? { fontStyle: "italic" } : {}), fontSize: 13, color: INK, marginTop: 2 }, catalog.preparedBy) : null,
        )
      : null,
    h(View, { style: { alignItems: "center" } }, L.T(S.labelGold, L.up(L.d.contents)), L.T({ ...S.h2, fontSize: 19, marginTop: 5 }, L.d.inThisSelection), ornament(GOLD, 10)),
    h(View, { style: { marginTop: 14, borderTopWidth: 0.6, borderTopColor: LINE } }),
    catalog.items.length === 0 ? L.T({ ...S.soft, marginTop: 10 }, `${L.d.emptyTitle}.`) : null,
    ...lines,
    footer(L, catalog),
  );
}

// ── Vivienda ────────────────────────────────────────────────────────────────

function facts(L: Lx, item: PublicItem): ReactElement {
  // La planta breve («7», «baja», «Ático»; «—» sin dato), la misma del lector.
  const floor = item.floorShort ?? "—";
  return h(
    View,
    { wrap: false, style: { flexDirection: L.row, marginTop: 12, paddingVertical: 9, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE } },
    dataPoint(L, L.d.surface, item.squareMeters != null ? `${formatNumber(item.squareMeters, L.lang)} m²` : "—"),
    dataPoint(L, L.d.bedrooms, item.bedrooms != null ? String(item.bedrooms) : "—"),
    dataPoint(L, L.d.bathrooms, item.bathrooms != null ? String(item.bathrooms) : "—"),
    dataPoint(L, L.d.floor, floor),
  );
}

function dotLine(L: Lx, text: string, style: Style, key: number): ReactElement {
  return h(
    View,
    { key, style: { flexDirection: L.row, alignItems: "flex-start", marginBottom: 2 } },
    h(View, { style: { width: 3, height: 3, borderRadius: 2, backgroundColor: GOLD, marginTop: 5, ...L.end("margin", 7) } }),
    // En RTL el texto se pega al lado de la viñeta (react-pdf alinea las
    // líneas dentro del ancho medido, no del que la fila le da después).
    h(View, { style: { flexGrow: 1, flexShrink: 1, ...(L.rtl ? { alignItems: "flex-end" } : {}) } }, L.C(style, text)),
  );
}

function itemPage(L: Lx, input: CatalogPdfInput, item: PublicItem, i: number): ReactElement {
  const { S } = L;
  const x: ItemExport = planItemExport(item);
  const ph = (idx: number) => input.photos.get(photoId(item.key, idx));
  const total = item.photos.length;
  const label = `${L.p.numberAbbr} ${n2(i)} · ${item.title}`;
  const parts: ReactNode[] = [];

  // Apertura (ancla del índice: la página de la vivienda).
  parts.push(
    h(
      View,
      { key: "anchor", id: `viv-${i}` },
      L.N({ fontSize: 1, color: PAPER }, " ", { render: ({ pageNumber }: { pageNumber: number }) => { input.onPage?.(item.key, pageNumber); return " "; } }),
    ),
  );
  parts.push(h(View, { key: "mark" }, chapterMark(L, i, input.catalog.items.length)));
  if (x.opening !== null) {
    parts.push(h(View, { key: "op", wrap: false, style: { marginTop: 14 } }, photoBlock(L, ph(x.opening), PRINT_BOXES.opening.w, PRINT_BOXES.opening.h), L.T({ ...S.photoCap, marginTop: 5 }, L.d.photoNofM(x.opening + 1, total))));
  } else {
    parts.push(h(View, { key: "op", wrap: false, style: { marginTop: 14 } }, missing(L, L.d.noPhotos, CONTENT_W, 180)));
  }
  parts.push(
    h(
      View,
      { key: "head", wrap: false, style: { marginTop: 14 } },
      L.T(S.labelGold, L.up(`${L.p.numberAbbr} ${n2(i)} · ${item.operation} · ${item.place ?? L.d.placeNoData}`)),
      L.C({ ...S.h2, marginTop: 5 }, item.title),
      h(
        View,
        { style: { flexDirection: L.row, alignItems: "baseline", marginTop: 6 } },
        L.V(S.price, item.price),
        item.reserved ? L.T({ ...S.label, color: GOLD_DARK, ...L.start("margin", 12) }, L.up(L.d.reserved)) : null,
      ),
      facts(L, item),
    ),
  );
  // La vivienda en detalle: características y la descripción completa del
  // catálogo, íntegra y una sola vez (DC9). Un título de capítulo nunca se
  // queda solo al pie: pide unas líneas de su texto en la misma página.
  const kicker = (t: string, top: number) => L.T({ ...S.labelGold, marginTop: top }, t);
  if (x.copy.length || x.features.length) {
    const featureList = x.features.length
      ? h(
          View,
          { key: "df", style: { marginTop: 8 } },
          h(View, { minPresenceAhead: 30 }, L.T(S.label, L.up(L.d.features))),
          h(View, { style: { flexDirection: L.row, flexWrap: "wrap", marginTop: 6 } }, ...x.features.map((f, k) => h(View, { key: k, style: { width: "50%", ...L.end("padding", 10) } }, dotLine(L, f, { ...S.body, fontSize: 9.5, color: SOFT }, k)))),
        )
      : null;
    const blocks = x.copy.map((b, k) =>
      h(
        View,
        { key: `c${k}`, style: { marginTop: k ? (b.heading ? 12 : 6) : 8 } },
        b.heading ? h(View, { minPresenceAhead: 45 }, L.C(S.h3, b.heading)) : null,
        ...paragraphs(L, b.text).map((p, j) => h(View, { key: j, style: { marginTop: b.heading && j === 0 ? 4 : 0 } }, p)),
      ),
    );
    parts.push(
      h(
        View,
        { key: "dd", style: { marginTop: 20 } },
        h(View, { minPresenceAhead: 50 }, kicker(L.up(L.d.inDetail), 0)),
        featureList,
        ...(x.copy.length ? [h(View, { key: "dk", minPresenceAhead: 40, style: { marginTop: x.features.length ? 14 : 6 } }, L.T(S.label, L.up(L.d.description))), ...blocks] : []),
      ),
    );
  }

  // Más fotos (hasta 6, P2), de dos en dos; el título va con la primera fila.
  if (x.more.length) {
    const cellW = PRINT_BOXES.more.w;
    const cell = (idx: number) => h(View, { key: idx, style: { width: cellW, alignItems: "center" } }, photoBlock(L, ph(idx), cellW, PRINT_BOXES.more.h), L.T({ ...S.photoCap, marginTop: 5 }, L.d.photoNofM(idx + 1, total)));
    for (let r = 0; r < x.more.length; r += 2) {
      const row = h(View, { key: `r${r}`, style: { flexDirection: L.row, justifyContent: "space-between", marginTop: r ? 12 : 8 } }, ...x.more.slice(r, r + 2).map(cell));
      parts.push(r === 0 ? h(View, { key: "mg0", wrap: false, style: { marginTop: 20 } }, kicker(L.up(L.p.morePhotos), 0), row) : h(View, { key: `mg${r}`, wrap: false }, row));
    }
  }

  return h(
    Page,
    { key: item.key, size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: 56 } },
    L.T({ ...S.runner, position: "absolute", top: 26, left: MARGIN, right: MARGIN }, "", { fixed: true, render: ({ subPageNumber }: { subPageNumber: number }) => (subPageNumber > 1 ? forPdf(L.up(`${label} — ${L.p.continuation}`)) : "") }),
    ...parts,
    footer(L, input.catalog),
  );
}

// ── Cierre y colofón ────────────────────────────────────────────────────────

function sparkle(color: string): ReactElement {
  // ✦ dibujado (no está en el subconjunto «latin» de las fuentes).
  return h(Svg, { width: 10, height: 10, viewBox: "0 0 24 24", style: { alignSelf: "center" } }, h(Path, { d: "M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z", fill: color }));
}

function closingPage(L: Lx, input: CatalogPdfInput): ReactElement {
  const { S } = L;
  const c = input.catalog;
  const hasCard = !!c.preparedBy || !!c.phone;
  const initials = L.up(
    (c.preparedBy ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join(""),
  );
  const role = L.up(L.d.advisor(c.role === "asesora" ? "asesora" : "asesor"));
  return h(
    Page,
    { size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: 120, paddingBottom: 40, alignItems: "center" } },
    L.T(S.labelGold, L.up(L.d.contact)),
    L.T({ ...S.h1, marginTop: 8, textAlign: "center" }, L.d.letsTalk),
    ornament(GOLD, 18),
    L.T({ ...S.body, color: SOFT, marginTop: 18, textAlign: "center", maxWidth: CONTENT_W * 0.6 }, L.d.closingHint),
    hasCard
      ? h(
          View,
          { style: { marginTop: 30, alignItems: "center" } },
          initials ? h(View, { style: { width: 56, height: 56, borderRadius: 28, backgroundColor: INK, alignItems: "center", justifyContent: "center" } }, L.C({ fontFamily: L.f.display, fontSize: 17, color: CREAM }, initials)) : null,
          c.preparedBy ? L.C({ fontFamily: L.f.display, fontSize: 18, color: INK, marginTop: 14, textAlign: "center" }, c.preparedBy) : null,
          L.T({ ...S.label, fontSize: 6.5, color: MUTED, marginTop: 6 }, `${role} · BENJAMÍN COUSIÑO PROPIEDADES`),
          c.phone && c.phoneHref
            ? h(
                Link,
                { src: c.phoneHref, style: { textDecoration: "none", marginTop: 22 } },
                h(View, { style: { borderWidth: 0.8, borderColor: INK, backgroundColor: INK, paddingVertical: 9, paddingHorizontal: 22 } }, L.T({ ...S.label, fontSize: 7.5, color: CREAM }, L.up(L.d.call))),
              )
            : null,
          c.phone && c.phoneHref ? h(Link, { src: c.phoneHref, style: { textDecoration: "none", marginTop: 14 } }, L.N({ fontFamily: L.f.text, fontSize: 10, color: SOFT }, c.phone)) : null,
        )
      : null,
    L.T({ ...S.soft, fontSize: 8, color: MUTED, marginTop: 36, textAlign: "center", lineHeight: 1.5, maxWidth: CONTENT_W * 0.7 }, L.p.closingNote(L.version(input.capturedAt))),
    h(View, { style: { flexGrow: 1 } }),
    sparkle(GOLD),
  );
}

function colophonPage(L: Lx, input: CatalogPdfInput): ReactElement {
  const { S } = L;
  const c = input.catalog;
  const cream = (a: number) => `rgba(251, 248, 243, ${a})`;
  return h(
    Page,
    { size: "A4", style: { backgroundColor: INK, paddingHorizontal: MARGIN, paddingTop: 60, paddingBottom: 40 } },
    h(
      View,
      { style: { flexGrow: 1, alignItems: "center", justifyContent: "center" } },
      logoBlock(input.logoWhite, CONTENT_W * 0.26, 0),
      L.T({ ...S.label, fontSize: 6.5, color: cream(0.5), marginTop: 8 }, "PRIVATE CLIENT SERVICES"),
      ornament(CREAM, 26, 0.35),
      L.T({ fontFamily: L.f.display, ...(L.f.italic ? { fontStyle: "italic" } : {}), fontSize: 15, color: cream(0.9), marginTop: 26, textAlign: "center" }, L.d.colophonLine),
      L.T({ ...S.label, fontSize: 7, letterSpacing: L.rtl ? 0 : 1.4, color: cream(0.45), marginTop: 12 }, L.up(c.edition)),
      L.T({ ...S.soft, fontSize: 7.5, color: cream(0.3), marginTop: 40, textAlign: "center" }, L.p.colophonNote(L.version(input.capturedAt))),
    ),
  );
}

export function catalogDocument(input: CatalogPdfInput): ReactElement<DocumentProps> {
  const meta = pdfMetadata(input.catalog);
  const L = makeLx(input.catalog);
  return h(
    Document,
    { title: meta.title, author: meta.author, subject: meta.subject, creator: meta.creator, producer: meta.producer, language: meta.language },
    coverPage(L, input),
    introAndIndexPage(L, input),
    ...input.catalog.items.map((it, i) => itemPage(L, input, it, i)),
    closingPage(L, input),
    colophonPage(L, input),
  ) as ReactElement<DocumentProps>;
}
