import { createElement as h, type ReactElement, type ReactNode } from "react";
import { Defs, Document, Image, LinearGradient, Link, Page, Path, Rect, Stop, Svg, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { PublicCatalog, PublicItem } from "@/lib/catalogs/public-contract";
import { planItemExport, pdfMetadata, versionLabel, type ItemExport } from "@/lib/catalogs/export/plan";
import { DISPLAY, LABEL, TEXT, noHyphens } from "./fonts";

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

// ── Texto ───────────────────────────────────────────────────────────────────

type Style = Record<string, unknown>;

/** Texto sin partición silábica. */
function T(style: Style, s: string, extra: Record<string, unknown> = {}): ReactElement {
  return h(Text, { style: { fontFamily: TEXT, ...style }, hyphenationCallback: noHyphens, ...extra }, s);
}

const S = {
  /** Etiqueta en versalitas (Cinzel, tracking amplio). */
  label: { fontFamily: LABEL, fontWeight: 500, fontSize: 7, letterSpacing: 1.9, color: SOFT },
  labelGold: { fontFamily: LABEL, fontWeight: 500, fontSize: 7, letterSpacing: 1.9, color: GOLD_DARK },
  h1: { fontFamily: DISPLAY, fontSize: 30, lineHeight: 1.05, color: INK },
  h2: { fontFamily: DISPLAY, fontSize: 21, lineHeight: 1.12, color: INK },
  h3: { fontFamily: DISPLAY, fontSize: 13.5, lineHeight: 1.25, color: INK },
  price: { fontFamily: DISPLAY, fontSize: 15, color: INK },
  body: { fontFamily: TEXT, fontSize: 10, lineHeight: 1.55, color: INK },
  lead: { fontFamily: TEXT, fontSize: 10.5, lineHeight: 1.55, color: INK },
  cap: { fontFamily: LABEL, fontWeight: 500, fontSize: 6.5, letterSpacing: 1.4, color: MUTED },
  /** Pies de foto y avisos de foto: sin tracking, para que el texto se extraiga
   *  tal cual («Foto 3 de 12», «Foto no disponible»). */
  photoCap: { fontFamily: LABEL, fontWeight: 500, fontSize: 6.5, color: MUTED },
  /** Pie de página y cabecera de continuación: tampoco llevan tracking (al
   *  extraer el texto, cada letra espaciada contaría como una palabra). */
  runner: { fontFamily: LABEL, fontWeight: 500, fontSize: 6.5, color: MUTED },
  soft: { fontFamily: TEXT, fontSize: 9, color: SOFT },
  serifNum: { fontFamily: DISPLAY, fontSize: 11, color: INK },
};

const up = (s: string) => s.toUpperCase();

function paragraphs(text: string, style: Style = S.body): ReactElement[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => T({ ...style, marginTop: i ? 6 : 0 }, p.replace(/\s*\n\s*/g, " ")));
}

const n2 = (i: number) => String(i + 1).padStart(2, "0");

/** «Cuatro viviendas» */
const ES_WORDS = ["", "Una", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez", "Once", "Doce"];
function countLabel(n: number): string {
  return `${ES_WORDS[n] ?? n} ${n === 1 ? "vivienda" : "viviendas"}`;
}

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
function chapterMark(index: number, total: number): ReactElement {
  return h(
    View,
    { style: { flexDirection: "row", alignItems: "center" } },
    T({ ...S.label, color: MUTED }, `${n2(index)}  /  ${String(total).padStart(2, "0")}`),
    h(View, { style: { flexGrow: 1, marginLeft: 12, borderBottomWidth: 0.6, borderBottomColor: LINE } }),
  );
}

/** Dato tipográfico: etiqueta minúscula arriba, valor en serif debajo. */
function dataPoint(label: string, value: string): ReactElement {
  return h(View, { key: label, style: { flexGrow: 1, flexBasis: 0 } }, T(S.label, up(label)), T({ fontFamily: DISPLAY, fontSize: 14, color: INK, marginTop: 3 }, value));
}

/** Tamaño de la foto dentro de una caja, sin recortar ni deformar. */
function fit(p: { width: number; height: number }, maxW: number, maxH: number): { w: number; h: number } {
  const r = Math.min(maxW / p.width, maxH / p.height);
  return { w: Math.round(p.width * r * 10) / 10, h: Math.round(p.height * r * 10) / 10 };
}

function missing(text: string, w: number, height: number): ReactElement {
  return h(
    View,
    { style: { width: w, height, backgroundColor: "#f0ede6", alignItems: "center", justifyContent: "center" } },
    T({ ...S.photoCap, fontSize: 7.5 }, text),
  );
}

/** Fotografía entera (sin recortar); si no se pudo leer, «Foto no disponible». */
function photoBlock(photo: PdfPhoto | undefined, maxW: number, maxH: number, fallbackRatio = 0.66): ReactElement {
  if (!photo || !photo.ok) return missing("Foto no disponible", maxW, Math.min(maxH, maxW * fallbackRatio));
  const { w, h: hh } = fit(photo, maxW, maxH);
  return h(View, { style: { alignSelf: "center" } }, h(Image, { src: { data: photo.data, format: "jpg" }, style: { width: w, height: hh } }));
}

function footer(catalog: PublicCatalog): ReactElement {
  return h(
    View,
    { fixed: true, style: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 5 } },
    T(S.runner, up(catalog.title || "Catálogo")),
    T({ fontFamily: DISPLAY, fontSize: 8.5, color: SOFT }, "", { render: ({ pageNumber }: { pageNumber: number }) => String(pageNumber) }),
  );
}

function logoBlock(logo: string | null | undefined, width: number, top: number): ReactElement | null {
  if (!logo) return null;
  return h(Image, { src: logo, style: { width, height: (width * 519) / 3282, alignSelf: "center", marginTop: top } });
}

// ── Portada ─────────────────────────────────────────────────────────────────

function coverPage(input: CatalogPdfInput): ReactElement {
  const { catalog } = input;
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
        T({ ...S.label, color: cream(0.55), marginTop: 10 }, "PRIVATE CLIENT SERVICES"),
      ),
      h(
        View,
        { style: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 30 } },
        T({ ...S.label, fontSize: 7.5, color: cream(0.7) }, "SELECCIÓN PRIVADA"),
        T({ ...S.h1, fontSize: 40, color: CREAM, textAlign: "center", marginTop: 16, maxWidth: CONTENT_W * 0.9 }, catalog.title || "Catálogo"),
        ornament(CREAM, 22, 0.35),
        catalog.preparedBy ? T({ ...S.label, color: cream(0.55), marginTop: 22 }, "PREPARADA POR") : null,
        catalog.preparedBy ? T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 19, color: CREAM, marginTop: 6, textAlign: "center" }, catalog.preparedBy) : null,
        T({ ...S.label, fontSize: 8, letterSpacing: 1.4, color: cream(0.85), marginTop: 30 }, up(catalog.edition)),
        T({ ...S.soft, color: cream(0.55), marginTop: 6 }, countLabel(catalog.items.length)),
      ),
      T({ ...S.soft, fontSize: 7.5, color: cream(0.35), textAlign: "center" }, `Versión del ${versionLabel(input.capturedAt)}`),
    ),
  );
}

// ── Introducción e índice ───────────────────────────────────────────────────

function introAndIndexPage(input: CatalogPdfInput): ReactElement {
  const { catalog } = input;
  const lines = catalog.items.map((it, i) =>
    h(
      Link,
      { key: it.key, src: `#viv-${i}`, style: { textDecoration: "none", color: INK } },
      h(
        View,
        { wrap: false, style: { paddingVertical: 7, borderBottomWidth: 0.6, borderBottomColor: LINE } },
        h(
          View,
          { style: { flexDirection: "row", alignItems: "flex-start" } },
          T({ ...S.label, color: MUTED, width: 28, marginTop: 2 }, n2(i)),
          h(
            View,
            // Anchos explícitos: con flexShrink solo, el título no partía y se
            // montaba sobre el precio. Sin tracking por lo mismo (react-pdf no
            // cuenta el letterSpacing al partir las líneas).
            { style: { width: CONTENT_W - 28 - 130, paddingRight: 10 } },
            T({ fontFamily: LABEL, fontWeight: 500, fontSize: 8, color: INK }, up(it.title)),
            T({ ...S.soft, fontSize: 8, marginTop: 2 }, it.place ?? "Zona · sin dato"),
            it.reserved ? T({ ...S.label, fontSize: 6, color: GOLD_DARK, marginTop: 3 }, "RESERVADA") : null,
          ),
          h(View, { style: { alignItems: "flex-end", width: 130 } }, T({ ...S.serifNum, fontSize: 12, textAlign: "right" }, it.price)),
        ),
        // El folio (números de página reales, P7) en su propia línea bajo la
        // entrada: al extraer el texto no comparte base con nada.
        h(View, { style: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 } }, T({ ...S.serifNum, fontSize: 9.5, color: SOFT }, input.pageOf?.get(it.key) != null ? String(input.pageOf.get(it.key)) : "··")),
      ),
    ),
  );
  return h(
    Page,
    { size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: 56 } },
    T({ ...S.runner, position: "absolute", top: 26, left: MARGIN }, "", { fixed: true, render: ({ subPageNumber }: { subPageNumber: number }) => (subPageNumber > 1 ? "ÍNDICE (CONTINUACIÓN)" : "") }),
    catalog.intro
      ? h(
          View,
          { style: { marginBottom: 26 } },
          T(S.labelGold, "UNA SELECCIÓN PENSADA PARA TI"),
          T({ ...S.h2, marginTop: 6, marginBottom: 8 }, catalog.title || "Catálogo"),
          ...paragraphs(catalog.intro, S.lead),
          catalog.preparedBy ? T({ ...S.soft, marginTop: 10 }, "Un saludo,") : null,
          catalog.preparedBy ? T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 13, color: INK, marginTop: 2 }, catalog.preparedBy) : null,
        )
      : null,
    h(View, { style: { alignItems: "center" } }, T(S.labelGold, "ÍNDICE"), T({ ...S.h2, fontSize: 19, marginTop: 5 }, "En esta selección"), ornament(GOLD, 10)),
    h(View, { style: { marginTop: 14, borderTopWidth: 0.6, borderTopColor: LINE } }),
    catalog.items.length === 0 ? T({ ...S.soft, marginTop: 10 }, "Esta selección no tiene viviendas ahora mismo.") : null,
    ...lines,
    footer(catalog),
  );
}

// ── Vivienda ────────────────────────────────────────────────────────────────

function facts(item: PublicItem): ReactElement {
  const floor = item.floor.endsWith("sin dato") ? "—" : item.floor.replace(/^Planta /, "");
  return h(
    View,
    { wrap: false, style: { flexDirection: "row", marginTop: 12, paddingVertical: 9, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE } },
    dataPoint("Superficie", item.squareMeters != null ? `${item.squareMeters.toLocaleString("es-ES")} m²` : "—"),
    dataPoint("Dormitorios", item.bedrooms != null ? String(item.bedrooms) : "—"),
    dataPoint("Baños", item.bathrooms != null ? String(item.bathrooms) : "—"),
    dataPoint("Planta", floor),
  );
}

function dotLine(text: string, style: Style, key: number): ReactElement {
  return h(
    View,
    { key, style: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2 } },
    h(View, { style: { width: 3, height: 3, borderRadius: 2, backgroundColor: GOLD, marginTop: 5, marginRight: 7 } }),
    h(View, { style: { flexGrow: 1, flexShrink: 1 } }, T(style, text)),
  );
}

function itemPage(input: CatalogPdfInput, item: PublicItem, i: number): ReactElement {
  const x: ItemExport = planItemExport(item);
  const ph = (idx: number) => input.photos.get(photoId(item.key, idx));
  const total = item.photos.length;
  const label = `Nº ${n2(i)} · ${item.title}`;
  const parts: ReactNode[] = [];

  // Apertura (ancla del índice: la página de la vivienda).
  parts.push(
    h(
      View,
      { key: "anchor", id: `viv-${i}` },
      T({ fontSize: 1, color: PAPER }, " ", { render: ({ pageNumber }: { pageNumber: number }) => { input.onPage?.(item.key, pageNumber); return " "; } }),
    ),
  );
  parts.push(h(View, { key: "mark" }, chapterMark(i, input.catalog.items.length)));
  if (x.opening !== null) {
    parts.push(h(View, { key: "op", wrap: false, style: { marginTop: 14 } }, photoBlock(ph(x.opening), PRINT_BOXES.opening.w, PRINT_BOXES.opening.h), T({ ...S.photoCap, marginTop: 5 }, `Foto ${x.opening + 1} de ${total}`)));
  } else {
    parts.push(h(View, { key: "op", wrap: false, style: { marginTop: 14 } }, missing("Sin fotos", CONTENT_W, 180)));
  }
  parts.push(
    h(
      View,
      { key: "head", wrap: false, style: { marginTop: 14 } },
      T(S.labelGold, up(`Nº ${n2(i)} · ${item.operation} · ${item.place ?? "Zona · sin dato"}`)),
      T({ ...S.h2, marginTop: 5 }, item.title),
      h(
        View,
        { style: { flexDirection: "row", alignItems: "baseline", marginTop: 6 } },
        T(S.price, item.price),
        item.reserved ? T({ ...S.label, color: GOLD_DARK, marginLeft: 12 }, "RESERVADA") : null,
      ),
      facts(item),
    ),
  );
  // La vivienda en detalle: características y la descripción completa del
  // catálogo, íntegra y una sola vez (DC9). Un título de capítulo nunca se
  // queda solo al pie: pide unas líneas de su texto en la misma página.
  const kicker = (t: string, top: number) => T({ ...S.labelGold, marginTop: top }, t);
  if (x.copy.length || x.features.length) {
    const featureList = x.features.length
      ? h(
          View,
          { key: "df", style: { marginTop: 8 } },
          h(View, { minPresenceAhead: 30 }, T(S.label, "CARACTERÍSTICAS")),
          h(View, { style: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 } }, ...x.features.map((f, k) => h(View, { key: k, style: { width: "50%", paddingRight: 10 } }, dotLine(f, { ...S.body, fontSize: 9.5, color: SOFT }, k)))),
        )
      : null;
    const blocks = x.copy.map((b, k) =>
      h(
        View,
        { key: `c${k}`, style: { marginTop: k ? (b.heading ? 12 : 6) : 8 } },
        b.heading ? h(View, { minPresenceAhead: 45 }, T(S.h3, b.heading)) : null,
        ...paragraphs(b.text).map((p, j) => h(View, { key: j, style: { marginTop: b.heading && j === 0 ? 4 : 0 } }, p)),
      ),
    );
    parts.push(
      h(
        View,
        { key: "dd", style: { marginTop: 20 } },
        h(View, { minPresenceAhead: 50 }, kicker("LA VIVIENDA EN DETALLE", 0)),
        featureList,
        ...(x.copy.length ? [h(View, { key: "dk", minPresenceAhead: 40, style: { marginTop: x.features.length ? 14 : 6 } }, T(S.label, "DESCRIPCIÓN")), ...blocks] : []),
      ),
    );
  }

  // Más fotos (hasta 6, P2), de dos en dos; el título va con la primera fila.
  if (x.more.length) {
    const cellW = PRINT_BOXES.more.w;
    const cell = (idx: number) => h(View, { key: idx, style: { width: cellW, alignItems: "center" } }, photoBlock(ph(idx), cellW, PRINT_BOXES.more.h), T({ ...S.photoCap, marginTop: 5 }, `Foto ${idx + 1} de ${total}`));
    for (let r = 0; r < x.more.length; r += 2) {
      const row = h(View, { key: `r${r}`, style: { flexDirection: "row", justifyContent: "space-between", marginTop: r ? 12 : 8 } }, ...x.more.slice(r, r + 2).map(cell));
      parts.push(r === 0 ? h(View, { key: "mg0", wrap: false, style: { marginTop: 20 } }, kicker("MÁS FOTOS", 0), row) : h(View, { key: `mg${r}`, wrap: false }, row));
    }
  }

  return h(
    Page,
    { key: item.key, size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: 56 } },
    T({ ...S.runner, position: "absolute", top: 26, left: MARGIN, right: MARGIN }, "", { fixed: true, render: ({ subPageNumber }: { subPageNumber: number }) => (subPageNumber > 1 ? up(`${label} — continuación`) : "") }),
    ...parts,
    footer(input.catalog),
  );
}

// ── Cierre y colofón ────────────────────────────────────────────────────────

function sparkle(color: string): ReactElement {
  // ✦ dibujado (no está en el subconjunto «latin» de las fuentes).
  return h(Svg, { width: 10, height: 10, viewBox: "0 0 24 24", style: { alignSelf: "center" } }, h(Path, { d: "M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z", fill: color }));
}

function closingPage(input: CatalogPdfInput): ReactElement {
  const c = input.catalog;
  const hasCard = !!c.preparedBy || !!c.phone;
  const initials = (c.preparedBy ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const role = c.role === "asesora" ? "TU ASESORA" : "TU ASESOR";
  return h(
    Page,
    { size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: 120, paddingBottom: 40, alignItems: "center" } },
    T(S.labelGold, "CONTACTO"),
    T({ ...S.h1, marginTop: 8, textAlign: "center" }, "Hablemos"),
    ornament(GOLD, 18),
    T({ ...S.body, color: SOFT, marginTop: 18, textAlign: "center", maxWidth: CONTENT_W * 0.6 }, "Si alguna de estas viviendas te encaja, organizamos la visita cuando mejor te venga."),
    hasCard
      ? h(
          View,
          { style: { marginTop: 30, alignItems: "center" } },
          initials ? h(View, { style: { width: 56, height: 56, borderRadius: 28, backgroundColor: INK, alignItems: "center", justifyContent: "center" } }, T({ fontFamily: DISPLAY, fontSize: 17, color: CREAM }, initials)) : null,
          c.preparedBy ? T({ fontFamily: DISPLAY, fontSize: 18, color: INK, marginTop: 14, textAlign: "center" }, c.preparedBy) : null,
          T({ ...S.label, fontSize: 6.5, color: MUTED, marginTop: 6 }, `${role} · BENJAMÍN COUSIÑO PROPIEDADES`),
          c.phone && c.phoneHref
            ? h(
                Link,
                { src: c.phoneHref, style: { textDecoration: "none", marginTop: 22 } },
                h(View, { style: { borderWidth: 0.8, borderColor: INK, backgroundColor: INK, paddingVertical: 9, paddingHorizontal: 22 } }, T({ ...S.label, fontSize: 7.5, color: CREAM }, "LLAMAR")),
              )
            : null,
          c.phone && c.phoneHref ? h(Link, { src: c.phoneHref, style: { textDecoration: "none", marginTop: 14 } }, T({ fontFamily: TEXT, fontSize: 10, color: SOFT }, c.phone)) : null,
        )
      : null,
    T({ ...S.soft, fontSize: 8, color: MUTED, marginTop: 36, textAlign: "center", lineHeight: 1.5, maxWidth: CONTENT_W * 0.7 }, `Selección preparada para ti. Este documento es una copia fija · versión del ${versionLabel(input.capturedAt)}.\nLa selección en línea puede haber cambiado desde entonces.`),
    h(View, { style: { flexGrow: 1 } }),
    sparkle(GOLD),
  );
}

function colophonPage(input: CatalogPdfInput): ReactElement {
  const c = input.catalog;
  const cream = (a: number) => `rgba(251, 248, 243, ${a})`;
  return h(
    Page,
    { size: "A4", style: { backgroundColor: INK, paddingHorizontal: MARGIN, paddingTop: 60, paddingBottom: 40 } },
    h(
      View,
      { style: { flexGrow: 1, alignItems: "center", justifyContent: "center" } },
      logoBlock(input.logoWhite, CONTENT_W * 0.26, 0),
      T({ ...S.label, fontSize: 6.5, color: cream(0.5), marginTop: 8 }, "PRIVATE CLIENT SERVICES"),
      ornament(CREAM, 26, 0.35),
      T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 15, color: cream(0.9), marginTop: 26, textAlign: "center" }, "Una selección preparada para ti."),
      T({ ...S.label, fontSize: 7, letterSpacing: 1.4, color: cream(0.45), marginTop: 12 }, up(c.edition)),
      T({ ...S.soft, fontSize: 7.5, color: cream(0.3), marginTop: 40, textAlign: "center" }, `Selección privada · copia fija · versión del ${versionLabel(input.capturedAt)}`),
    ),
  );
}

export function catalogDocument(input: CatalogPdfInput): ReactElement<DocumentProps> {
  const meta = pdfMetadata(input.catalog);
  return h(
    Document,
    { title: meta.title, author: meta.author, subject: meta.subject, creator: meta.creator, producer: meta.producer, language: meta.language },
    coverPage(input),
    introAndIndexPage(input),
    ...input.catalog.items.map((it, i) => itemPage(input, it, i)),
    closingPage(input),
    colophonPage(input),
  ) as ReactElement<DocumentProps>;
}
