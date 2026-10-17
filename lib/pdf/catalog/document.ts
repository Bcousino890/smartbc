import { createElement as h, type ReactElement, type ReactNode } from "react";
import { Document, Image, Link, Page, Path, Svg, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { PublicCatalog, PublicItem } from "@/lib/catalogs/public-contract";
import { planItemExport, pdfMetadata, versionLabel, type ItemExport } from "@/lib/catalogs/export/plan";
import { DISPLAY, TEXT, noHyphens, splitOrdinals } from "./fonts";

// ============================================================================
// PDF del catálogo · documento (dirección C · Boutique, D17; P1–P10). A4
// vertical, una página por hoja. El CONTENIDO es la proyección pública (la del
// lector) repartida por planItemExport (todas las secciones, K4; fotos P2).
// Sin la dirección del enlace ni QR (P3): el único enlace externo es `tel:`.
// Índice con números de página correctos en dos pasadas (P7): la primera
// anota la página de cada vivienda (onPage) y la segunda los escribe.
// Escrito con createElement (sin JSX) para poder generarlo también desde los
// scripts de verificación con Node.
// ============================================================================

export const PAPER = "#f4ede1";
export const INK = "#2b2118";
export const ACCENT = "#9b4a2e";
export const MAT = "#fbf7f0";
export const SOFT = "#6b5a48";
const LINE = "#d9c3ad";

const A4_W = 595.28;
const MARGIN = 51; // 18 mm
const CONTENT_W = A4_W - 2 * MARGIN;

export type PdfPhoto = { ok: true; data: Buffer; width: number; height: number } | { ok: false };

export interface CatalogPdfInput {
  catalog: PublicCatalog;
  /** Momento de la captura (la versión que se imprime). */
  capturedAt: Date;
  /** Logo oficial como data URI (loadLogoDataUri), o null. */
  logo: string | null;
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

/** Texto sin partición silábica; en Karla, «º» y «ª» con Fraunces (T1). */
function T(style: Style, s: string, extra: Record<string, unknown> = {}): ReactElement {
  const karla = !style.fontFamily || style.fontFamily === TEXT;
  const children: ReactNode[] = karla && /[ºª]/.test(s)
    ? splitOrdinals(s).map(([t, o], i) => (o ? h(Text, { key: i, style: { fontFamily: DISPLAY } }, t) : t))
    : [s];
  return h(Text, { style: { fontFamily: TEXT, ...style }, hyphenationCallback: noHyphens, ...extra }, ...children);
}

const S = {
  kicker: { fontFamily: TEXT, fontSize: 7.5, letterSpacing: 1.8, color: ACCENT },
  h1: { fontFamily: DISPLAY, fontStyle: "italic", fontSize: 28, lineHeight: 1.12, color: INK },
  h2: { fontFamily: DISPLAY, fontStyle: "italic", fontSize: 19, lineHeight: 1.18, color: INK },
  h3: { fontFamily: DISPLAY, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.25, color: INK },
  body: { fontFamily: TEXT, fontSize: 10.5, lineHeight: 1.5, color: INK },
  lead: { fontFamily: DISPLAY, fontStyle: "italic", fontSize: 12, lineHeight: 1.45, color: INK },
  cap: { fontFamily: DISPLAY, fontStyle: "italic", fontSize: 8, color: SOFT },
  soft: { fontFamily: TEXT, fontSize: 9.5, color: SOFT },
};

function paragraphs(text: string, style: Style = S.body): ReactElement[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => T({ ...style, marginTop: i ? 6 : 0 }, p.replace(/\s*\n\s*/g, " ")));
}

const n2 = (i: number) => String(i + 1).padStart(2, "0");

// ── Fotos ───────────────────────────────────────────────────────────────────

/** Tamaño de la foto dentro de una caja, sin recortar ni deformar. */
function fit(p: { width: number; height: number }, maxW: number, maxH: number): { w: number; h: number } {
  const r = Math.min(maxW / p.width, maxH / p.height);
  return { w: Math.round(p.width * r * 10) / 10, h: Math.round(p.height * r * 10) / 10 };
}

function missing(text: string, w: number, height: number): ReactElement {
  return h(
    View,
    { style: { width: w, height, backgroundColor: "#ece2d3", borderWidth: 0.6, borderColor: LINE, alignItems: "center", justifyContent: "center" } },
    T({ ...S.cap, fontSize: 10 }, text),
  );
}

/** Foto enmarcada; si no se pudo leer, «Foto no disponible» (nunca otra). */
function framed(photo: PdfPhoto | undefined, maxW: number, maxH: number, fallbackRatio = 0.66): ReactElement {
  if (!photo || !photo.ok) return missing("Foto no disponible", maxW, Math.min(maxH, maxW * fallbackRatio));
  const { w, h: hh } = fit(photo, maxW - 10, maxH - 10);
  return h(
    View,
    { style: { alignSelf: "center", padding: 5, backgroundColor: MAT, borderWidth: 0.5, borderColor: "#e4d6c3" } },
    h(Image, { src: { data: photo.data, format: "jpg" }, style: { width: w, height: hh } }),
  );
}

// ── Páginas ─────────────────────────────────────────────────────────────────

function footer(catalog: PublicCatalog): ReactElement {
  return h(
    View,
    { fixed: true, style: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 22, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 4 } },
    T(S.cap, catalog.title || "Catálogo"),
    T(S.cap, "", { render: ({ pageNumber }: { pageNumber: number }) => String(pageNumber) }),
  );
}

function logoBlock(logo: string | null, width: number, top: number): ReactElement | null {
  if (!logo) return null;
  return h(Image, { src: logo, style: { width, height: (width * 519) / 3282, alignSelf: "center", marginTop: top } });
}

function coverPage(input: CatalogPdfInput): ReactElement {
  const { catalog } = input;
  const archW = CONTENT_W * 0.62;
  const archH = archW * 1.25;
  const photo = input.photos.get("cover");
  const radius = (archW + 12) / 2;
  const arch = h(
    View,
    { style: { marginTop: 22, width: archW + 12, height: archH + 12, padding: 6, backgroundColor: MAT, borderTopLeftRadius: radius, borderTopRightRadius: radius, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, alignSelf: "center" } },
    photo && photo.ok
      ? h(Image, { src: { data: photo.data, format: "jpg" }, style: { width: archW, height: archH, objectFit: "cover", borderTopLeftRadius: archW / 2, borderTopRightRadius: archW / 2, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 } })
      : h(View, { style: { width: archW, height: archH, backgroundColor: "#e9dccb", borderTopLeftRadius: archW / 2, borderTopRightRadius: archW / 2, alignItems: "center", justifyContent: "center" } }, T(S.cap, photo ? "Foto no disponible" : "")),
  );
  return h(
    Page,
    { size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: 44, paddingBottom: 40 } },
    logoBlock(input.logo, CONTENT_W * 0.44, 0),
    T({ ...S.kicker, textAlign: "center", marginTop: 16 }, `SELECCIÓN PRIVADA · ${catalog.edition}`.toUpperCase()),
    arch,
    T({ ...S.h1, textAlign: "center", marginTop: 20 }, catalog.title || "Catálogo"),
    catalog.preparedBy ? T({ ...S.soft, textAlign: "center", marginTop: 6 }, `Preparada por ${catalog.preparedBy}`) : null,
    h(View, { style: { flexGrow: 1 } }),
    T({ ...S.cap, textAlign: "center" }, `Versión del ${versionLabel(input.capturedAt)}`),
  );
}

function introAndIndexPage(input: CatalogPdfInput): ReactElement {
  const { catalog } = input;
  const lines = catalog.items.map((it, i) =>
    h(
      Link,
      { key: it.key, src: `#viv-${i}`, style: { textDecoration: "none", color: INK } },
      h(
        View,
        { wrap: false, style: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: LINE, borderBottomStyle: "dotted" } },
        T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 10.5, color: ACCENT, width: 26 }, n2(i)),
        h(
          View,
          { style: { flexGrow: 1, flexShrink: 1, paddingRight: 8 } },
          h(
            View,
            { style: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" } },
            T({ fontFamily: TEXT, fontWeight: 600, fontSize: 10, color: INK }, it.title),
            it.reserved ? T({ fontFamily: TEXT, fontWeight: 600, fontSize: 6.5, letterSpacing: 1.2, color: "#fff", backgroundColor: ACCENT, paddingHorizontal: 4, paddingVertical: 1.5, marginLeft: 6 }, "RESERVADA") : null,
          ),
          T({ ...S.soft, fontSize: 8.5, marginTop: 1.5 }, `${it.place ?? "Zona · sin dato"} · ${it.price}`),
        ),
        T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 10.5, color: INK }, input.pageOf?.get(it.key) != null ? String(input.pageOf.get(it.key)) : "··"),
      ),
    ),
  );
  return h(
    Page,
    { size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: 56 } },
    T({ ...S.cap, position: "absolute", top: 26, left: MARGIN }, "", { fixed: true, render: ({ subPageNumber }: { subPageNumber: number }) => (subPageNumber > 1 ? "Índice (continuación)" : "") }),
    catalog.intro
      ? h(
          View,
          { style: { marginBottom: 22 } },
          T(S.kicker, "UNA SELECCIÓN PENSADA PARA TI"),
          T({ ...S.h2, marginTop: 4, marginBottom: 6 }, catalog.title || "Catálogo"),
          ...paragraphs(catalog.intro),
          catalog.preparedBy ? T({ ...S.lead, fontSize: 10.5, marginTop: 8 }, "Un saludo,") : null,
          catalog.preparedBy ? T({ fontFamily: TEXT, fontWeight: 600, fontSize: 10.5 }, catalog.preparedBy) : null,
        )
      : null,
    T(S.kicker, "ÍNDICE"),
    T({ ...S.h2, fontSize: 16, marginTop: 3, marginBottom: 6 }, "En esta selección"),
    catalog.items.length === 0 ? T(S.soft, "Esta selección no tiene viviendas ahora mismo.") : null,
    ...lines,
    footer(catalog),
  );
}

function facts(item: PublicItem): ReactElement {
  const f = (v: string, label: string) =>
    h(View, { key: label, style: { flexGrow: 1, flexBasis: 0, alignItems: "center" } }, T({ fontFamily: TEXT, fontWeight: 600, fontSize: 12.5, color: INK }, v), T({ ...S.soft, fontSize: 7.5 }, label));
  return h(
    View,
    { wrap: false, style: { flexDirection: "row", marginTop: 8, paddingVertical: 6, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE } },
    f(item.squareMeters != null ? String(item.squareMeters) : "—", "m²"),
    f(item.bedrooms != null ? String(item.bedrooms) : "—", "dormitorios"),
    f(item.bathrooms != null ? String(item.bathrooms) : "—", "baños"),
    // La planta ya se nombra sola («Planta 2», «Bajo», «Planta · sin dato»).
    f(item.floor || "Planta · sin dato", ""),
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
  if (x.opening !== null) {
    parts.push(h(View, { key: "op", wrap: false }, framed(ph(x.opening), CONTENT_W, 300), T({ ...S.cap, marginTop: 3 }, `Foto de apertura · ${x.opening + 1} de ${total}`)));
  } else {
    parts.push(h(View, { key: "op", wrap: false }, missing("Sin fotos", CONTENT_W, 190)));
  }
  parts.push(
    h(
      View,
      { key: "head", wrap: false, style: { marginTop: 10 } },
      T(S.kicker, `${`Nº ${n2(i)}`} · ${item.operation} · ${item.place ?? "Zona · sin dato"}`.toUpperCase()),
      h(
        View,
        { style: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 3 } },
        T(S.h2, item.title),
        item.reserved ? T({ fontFamily: TEXT, fontWeight: 600, fontSize: 7, letterSpacing: 1.2, color: "#fff", backgroundColor: ACCENT, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 8 }, "RESERVADA") : null,
      ),
      T({ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 14, color: ACCENT, marginTop: 4 }, item.price),
      facts(item),
    ),
  );
  if (x.leadInOpening) parts.push(T({ ...S.lead, marginTop: 9 }, x.leadInOpening, { key: "lead" }));
  if (x.highlights.length) {
    parts.push(h(View, { key: "hl", style: { marginTop: 6 } }, ...x.highlights.map((t, k) => T({ ...S.body, fontSize: 10 }, `·  ${t}`, { key: k }))));
  }

  // Recorrido: TODAS las secciones, en orden (K4). Ningún título se queda
  // solo al pie: un título va en el mismo bloque irrompible que la foto que le
  // sigue, o pide unas líneas de su texto en la misma página.
  const kicker = (t: string, top: number) => T({ ...S.kicker, marginTop: top }, t);
  let journeyKicker: string | null = x.leadInJourney || x.sections.length ? "EL RECORRIDO" : null;
  if (x.leadInJourney) {
    parts.push(h(View, { key: "rl", style: { marginTop: 16 } }, h(View, { minPresenceAhead: 60 }, kicker(journeyKicker!, 0)), ...paragraphs(x.leadInJourney, S.lead).map((p, k) => h(View, { key: k, style: { marginTop: k ? 0 : 5 } }, p))));
    journeyKicker = null;
  }
  x.sections.forEach((s, k) => {
    const lead: ReactNode[] = [];
    if (journeyKicker) lead.push(h(View, { key: "rk" }, kicker(journeyKicker, 16)));
    if (s.heading) lead.push(T({ ...S.h3, marginTop: journeyKicker ? 5 : 12 }, s.heading, { key: "h" }));
    journeyKicker = null;
    const text = paragraphs(s.text);
    if (s.photo !== null) {
      const p = ph(s.photo);
      const portrait = p && p.ok ? p.height > p.width : false;
      lead.push(h(View, { key: "p", style: { marginTop: 6 } }, framed(p, portrait ? CONTENT_W * 0.55 : CONTENT_W, portrait ? 300 : 250), T({ ...S.cap, marginTop: 3, textAlign: "center" }, `Foto ${s.photo + 1} de ${total}`)));
      parts.push(h(View, { key: `s${k}` }, h(View, { wrap: false }, ...lead), h(View, { style: { marginTop: 6 } }, ...text)));
    } else {
      parts.push(h(View, { key: `s${k}`, style: { marginTop: s.heading ? 0 : 10 } }, h(View, { minPresenceAhead: 45 }, ...lead), ...text));
    }
  });

  // La vivienda en detalle: descripción completa y características.
  if (x.description || x.features.length) {
    const featureList = x.features.length
      ? h(
          View,
          { key: "df", style: { marginTop: x.description ? 10 : 6 } },
          h(View, { minPresenceAhead: 30 }, T({ ...S.kicker, fontSize: 7 }, "CARACTERÍSTICAS")),
          h(View, { style: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 } }, ...x.features.map((f, k) => T({ ...S.body, fontSize: 9.5, width: "50%", paddingRight: 8, marginBottom: 2 }, `·  ${f}`, { key: k }))),
        )
      : null;
    parts.push(
      h(
        View,
        { key: "dd", style: { marginTop: 18 } },
        h(View, { minPresenceAhead: 50 }, kicker("LA VIVIENDA EN DETALLE", 0)),
        ...(x.description ? paragraphs(x.description).map((p, k) => h(View, { key: k, style: { marginTop: k ? 0 : 6 } }, p)) : []),
        featureList,
      ),
    );
  }

  // Más fotos (hasta 6, P2), de dos en dos; el título va con la primera fila.
  if (x.more.length) {
    const cellW = (CONTENT_W - 12) / 2;
    const cell = (idx: number) => h(View, { key: idx, style: { width: cellW, alignItems: "center" } }, framed(ph(idx), cellW, 175), T({ ...S.cap, marginTop: 3 }, `Foto ${idx + 1} de ${total}`));
    for (let r = 0; r < x.more.length; r += 2) {
      const row = h(View, { key: `r${r}`, style: { flexDirection: "row", justifyContent: "space-between", marginTop: r ? 10 : 6 } }, ...x.more.slice(r, r + 2).map(cell));
      parts.push(r === 0 ? h(View, { key: "mg0", wrap: false, style: { marginTop: 18 } }, kicker("MÁS FOTOS", 0), row) : h(View, { key: `mg${r}`, wrap: false }, row));
    }
  }

  return h(
    Page,
    { key: item.key, size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: 56 } },
    T({ ...S.cap, position: "absolute", top: 26, left: MARGIN, right: MARGIN }, "", { fixed: true, render: ({ subPageNumber }: { subPageNumber: number }) => (subPageNumber > 1 ? `${label} — continuación` : "") }),
    ...parts,
    footer(input.catalog),
  );
}

function ornament(): ReactElement {
  // ✦ dibujado (no está en el subconjunto «latin» de las fuentes).
  return h(Svg, { width: 12, height: 12, viewBox: "0 0 24 24", style: { alignSelf: "center" } }, h(Path, { d: "M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z", fill: ACCENT }));
}

function closingPage(input: CatalogPdfInput): ReactElement {
  const c = input.catalog;
  const hasCard = !!c.preparedBy || !!c.phone;
  return h(
    Page,
    { size: "A4", style: { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: 70, paddingBottom: 40, alignItems: "center" } },
    logoBlock(input.logo, CONTENT_W * 0.52, 0),
    T({ ...S.kicker, marginTop: 34, textAlign: "center" }, "CONTACTO"),
    T({ ...S.h2, marginTop: 4, textAlign: "center" }, "Hablemos"),
    T({ ...S.body, marginTop: 8, textAlign: "center" }, "Si alguna de estas viviendas te encaja, organizamos la visita cuando mejor te venga."),
    hasCard
      ? h(
          View,
          { style: { marginTop: 20, width: CONTENT_W * 0.66, paddingVertical: 16, paddingHorizontal: 14, backgroundColor: MAT, borderWidth: 0.6, borderColor: LINE, alignItems: "center" } },
          T(S.kicker, c.role === "asesora" ? "TU ASESORA" : "TU ASESOR"),
          c.preparedBy ? T({ ...S.h3, fontSize: 16, marginTop: 4 }, c.preparedBy) : null,
          c.phone && c.phoneHref ? h(Link, { src: c.phoneHref, style: { textDecoration: "none", color: INK, marginTop: 5 } }, T({ fontFamily: TEXT, fontSize: 12.5 }, c.phone)) : null,
        )
      : null,
    T({ ...S.cap, marginTop: 24, textAlign: "center", lineHeight: 1.5 }, `Este documento es una copia fija · versión del ${versionLabel(input.capturedAt)}.\nLa selección en línea puede haber cambiado desde entonces.`),
    h(View, { style: { flexGrow: 1 } }),
    ornament(),
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
  ) as ReactElement<DocumentProps>;
}
