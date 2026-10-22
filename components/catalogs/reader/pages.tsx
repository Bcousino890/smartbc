import type { ReactNode } from "react";
import { ChapterMark, DataPoint, Label, Ornament, Rule, StatusLine } from "@/app/v/[token]/_components/editorial";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import { formatDateShort, formatNumber } from "@/lib/catalogs/i18n";
import type { PublicCatalog, PublicItem, PublicPhoto } from "@/lib/catalogs/public-contract";
import { cn } from "@/lib/utils";
import { useReaderLang } from "./lang-context";
import { PdfDownload, type ReaderPdf } from "./pdf-download";
import { ReaderImage } from "./reader-image";
import { ScrollRegion } from "./scroll-region";
import styles from "./reader.module.css";

// Páginas del lector (enmienda visual 2026-10-20): la publicación del
// itinerario como referencia, adaptada al catálogo. Solo pintan el contrato
// público; no saben nada de la sincronización. Las primitivas editoriales
// (Label, Rule, Ornament, DataPoint, ChapterMark, StatusLine) son las de
// app/v/[token]/_components/editorial.tsx (DV12). Sin fechas, horas, estados
// de visita, referencias BC, direcciones ni enlaces a la ficha (DV2, DV3).
// Idiomas (PR4): las etiquetas fijas salen del diccionario del enlace
// (lang-context.tsx); las cifras, los precios y el teléfono van SIEMPRE en
// LTR (dir="ltr", que aísla la dirección), también en árabe y hebreo. Las
// alineaciones son lógicas (text-start/text-end) para que el índice se lea
// en el sentido del idioma. El CONTENIDO (títulos, zona, descripción,
// características, introducción y contacto), que sigue en español hasta el
// PR6, va en <bdi>: en una página RTL conserva su propio orden (la
// puntuación de una frase española no salta al otro lado) y en LTR no
// cambia nada. StatePage no usa el contexto: la pinta también
// la página de servidor con un enlace no válido (siempre en español).

export type PhotoUrl = (src: string, width: number) => string;

const SRCSET_WIDTHS = [640, 1080, 1600, 1920];

export function photoProps(photo: PublicPhoto, url: PhotoUrl, sizes: string) {
  return {
    src: url(photo.src, 1080),
    srcSet: SRCSET_WIDTHS.map((w) => `${url(photo.src, w)} ${w}w`).join(", "),
    sizes,
  };
}

export function n2(i: number): string {
  return String(i + 1).padStart(2, "0");
}

const PHOTO_SIZES = "(min-width: 900px) and (min-height: 620px) 50vw, 100vw";

const DASH = <span className="text-ink/30">—</span>;

/** Cifra en el formato del idioma y aislada en LTR (también en RTL). */
function Num({ value, suffix }: { value: number | null; suffix?: ReactNode }) {
  const { lang } = useReaderLang();
  if (value === null) return DASH;
  return (
    <span dir="ltr">
      {formatNumber(value, lang)}
      {suffix}
    </span>
  );
}

// ─── Portada ─────────────────────────────────────────────────────────────────

export function CoverPage({ catalog, url, onBegin }: { catalog: PublicCatalog; url: PhotoUrl; onBegin?: () => void }) {
  const { dict } = useReaderLang();
  return (
    <section className={cn(styles.page, styles.coverPage)} aria-label={dict.cover}>
      <CatalogCover
        readable
        onBegin={onBegin}
        labels={{ kicker: dict.privateSelection, preparedBy: dict.preparedBy, begin: dict.begin }}
        data={{
          title: catalog.title,
          subtitle: null,
          edition: catalog.edition,
          photoUrl: catalog.coverPhoto ? url(catalog.coverPhoto, 1600) : null,
          preparedBy: catalog.preparedBy,
          countLabel: dict.homesCount(catalog.items.length),
        }}
      />
    </section>
  );
}

// ─── Índice (con la introducción) ────────────────────────────────────────────

export function IndexPage({
  catalog,
  onOpen,
  folioOf,
  pdf = null,
}: {
  catalog: PublicCatalog;
  onOpen: (key: string) => void;
  /** Folio de la apertura de cada vivienda (cuenta todas sus partes). */
  folioOf: (key: string) => number;
  /** Descarga del PDF; null = no se ofrece (sin conexión). */
  pdf?: ReaderPdf | null;
}) {
  const { dict } = useReaderLang();
  const hasIntro = !!catalog.intro;
  return (
    <section className={cn(styles.page, styles.indexPage)} aria-label={dict.contents}>
      <div className={cn(styles.indexLayout, hasIntro && styles.indexWithIntro)}>
        {hasIntro ? (
          <div className={styles.introCol} aria-label={dict.introduction}>
            <Label tone="gold">{dict.introLabel}</Label>
            <h2 className="mt-3 font-serif text-[26px] font-normal vc-tight text-ink sm:text-[32px] lg:text-[38px]"><bdi>{catalog.title}</bdi></h2>
            <Ornament className="mx-0 mt-6" />
            <p className="mt-6 whitespace-pre-line break-words font-sans text-[15px] leading-relaxed text-ink/80"><bdi>{catalog.intro}</bdi></p>
            {catalog.preparedBy ? (
              <p className="mt-7 font-sans text-[13px] text-ink/55">
                {dict.greeting}
                <span className="mt-1 block font-serif text-[22px] italic text-ink"><bdi>{catalog.preparedBy}</bdi></span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={styles.indexCol}>
          <header className="text-center">
            <Label tone="gold">{dict.contents}</Label>
            <h2 className="mt-3 font-serif text-[26px] font-normal vc-tight text-ink sm:text-[32px] lg:text-[40px]">{dict.inThisSelection}</h2>
            {!hasIntro ? <p className="mt-3 font-sans text-[13px] text-ink/50"><bdi>{catalog.title}</bdi></p> : null}
            {pdf && catalog.items.length ? <PdfDownload pdf={pdf} variant="index" /> : null}
            <Ornament className="mt-6" />
          </header>

          {catalog.items.length === 0 ? (
            <div className="mt-10 text-center" data-testid="empty-state">
              <h3 className="font-serif text-[22px] font-normal text-ink">{dict.emptyTitle}</h3>
              <p className="mt-3 font-sans text-[14px] leading-relaxed text-ink/55">{dict.emptyHint}</p>
            </div>
          ) : (
            <ScrollRegion label={dict.contents} variant="index" cue={dict.moreHomes}>
              <Rule className="mt-8" />
              <ol>
                {catalog.items.map((it, i) => (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => onOpen(it.key)}
                      className="vc-focus group grid w-full grid-cols-[2.2rem_1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-3 text-start transition-colors duration-500 sm:grid-cols-[3rem_1fr_auto_auto] sm:gap-x-6 sm:py-4 lg:py-5"
                      data-check-overflow="indice"
                    >
                      <span dir="ltr" className="font-display text-[10.5px] font-medium uppercase vc-tracked vc-nums text-ink/30">{n2(i)}</span>
                      <span className="min-w-0">
                        <span className="block break-words font-display text-[12px] font-medium uppercase vc-tracked-sm text-ink transition-colors duration-500 group-hover:text-gold-dark sm:text-[13px]">
                          <bdi>{it.title}</bdi>
                        </span>
                        <span className="mt-0.5 block font-sans text-[11.5px] text-ink/45">{it.place ? <bdi>{it.place}</bdi> : dict.placeNoData}</span>
                      </span>
                      <span dir="ltr" className="max-w-[8.5rem] justify-self-end break-words text-end font-serif text-[18px] leading-tight vc-nums text-ink sm:max-w-[11rem] sm:text-[20px] lg:text-[22px]">{it.price}</span>
                      {/* En una columna, el estado o el folio van bajo el precio. */}
                      <span
                        className={cn(
                          "col-start-3 row-start-2 justify-self-end whitespace-nowrap font-display text-[9.5px] font-medium uppercase vc-tracked-sm sm:col-start-auto sm:row-start-auto",
                          it.reserved ? "text-gold-dark" : "text-ink/30",
                        )}
                      >
                        {it.reserved ? dict.reserved : dict.pageAbbr(folioOf(it.key))}
                      </span>
                    </button>
                    <Rule />
                  </li>
                ))}
              </ol>
            </ScrollRegion>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Piezas de una vivienda ──────────────────────────────────────────────────

/** Fotografía a página: abre la galería; «Ver N fotografías» como en la referencia. */
function PhotoColumn({
  item,
  photo,
  url,
  sizes = PHOTO_SIZES,
  onOpenGallery,
}: {
  item: PublicItem;
  photo: number;
  url: PhotoUrl;
  sizes?: string;
  onOpenGallery: (photo: number) => void;
}) {
  const { dict } = useReaderLang();
  const p = item.photos[photo];
  return (
    <div className={styles.photoCol}>
      {p ? (
        <button type="button" className={cn(styles.photoBtn, "vc-focus group")} onClick={() => onOpenGallery(photo)} aria-haspopup="dialog" aria-label={dict.viewPhotosOf(item.title)}>
          <ReaderImage variant="frame" {...photoProps(p, url, sizes)} alt={item.title} decoding="async" />
          {item.photos.length > 1 ? (
            <span className="pointer-events-none absolute bottom-6 end-6 border border-cream-50/45 bg-ink/55 px-4 py-2.5 font-display text-[9.5px] font-medium uppercase vc-tracked text-cream-50 backdrop-blur-sm">
              {dict.viewPhotos(item.photos.length)}
            </span>
          ) : null}
        </button>
      ) : (
        <div className={styles.photoEmpty} data-check-overflow="foto">
          <Label className="text-ink/30">{dict.noPhotos}</Label>
        </div>
      )}
    </div>
  );
}

function ItemHead({ item, index, total }: { item: PublicItem; index: number; total: number }) {
  const { dict } = useReaderLang();
  return (
    <>
      <div className="flex items-center gap-4 md:gap-5">
        <ChapterMark index={index + 1} total={total} />
        <span aria-hidden className="h-px flex-1 bg-ink/12" />
      </div>
      <Label tone="gold" className="mt-4 md:mt-7">
        {item.operation}
        {item.place ? (
          <>
            {" · "}
            <bdi>{item.place}</bdi>
          </>
        ) : null}
      </Label>
      <h2 className="mt-2 max-w-[18ch] break-words font-serif text-[26px] font-normal vc-tight text-ink sm:text-[30px] md:text-[34px] lg:text-[42px]" data-check-overflow="titulo" data-testid="item-title">
        <bdi>{item.title}</bdi>
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 md:mt-5">
        <p dir="ltr" className="font-serif text-[23px] leading-none vc-nums text-ink md:text-[26px] lg:text-[30px]">{item.price}</p>
        {item.reserved ? <StatusLine tone="alert">{dict.reserved}</StatusLine> : null}
      </div>
      <Rule className="my-4 md:my-6" />
    </>
  );
}

export function KeyFacts({ item }: { item: PublicItem }) {
  const { dict } = useReaderLang();
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4 md:gap-x-10" aria-label={dict.keyFacts}>
      <DataPoint label={dict.surface} value={<Num value={item.squareMeters} suffix={<span className="ms-1 text-[13px] text-ink/45">m²</span>} />} />
      <DataPoint label={dict.bedrooms} value={<Num value={item.bedrooms} />} />
      <DataPoint label={dict.bathrooms} value={<Num value={item.bathrooms} />} />
      <DataPoint label={dict.floor} value={item.floorShort ?? DASH} />
    </div>
  );
}

/** Miniaturas de la apertura: las primeras fotos elegibles (sin la de
 *  apertura) y el acceso a la galería completa. */
const THUMBS_MAX = 6;

function Thumbs({ item, url, onOpenGallery }: { item: PublicItem; url: PhotoUrl; onOpenGallery: (photo: number) => void }) {
  const { dict } = useReaderLang();
  const others = item.photos.map((_, i) => i).filter((i) => i !== item.coverIndex);
  if (!others.length) return null;
  const shown = others.slice(0, THUMBS_MAX);
  return (
    <div className="mt-6 md:mt-8" data-testid="thumbs">
      <ul className={styles.thumbs}>
        {shown.map((i) => (
          <li key={item.photos[i].key}>
            <button type="button" className={cn(styles.thumb, "vc-focus")} onClick={() => onOpenGallery(i)} aria-haspopup="dialog" aria-label={dict.photoNofM(i + 1, item.photos.length)}>
              <ReaderImage variant="thumb" src={url(item.photos[i].src, 640)} alt="" loading="lazy" decoding="async" />
            </button>
          </li>
        ))}
      </ul>
      <GalleryLink item={item} onOpenGallery={onOpenGallery} />
    </div>
  );
}

function GalleryLink({ item, onOpenGallery }: { item: PublicItem; onOpenGallery: (photo: number) => void }) {
  const { dict } = useReaderLang();
  if (item.photos.length <= 1) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenGallery(item.coverIndex)}
      aria-haspopup="dialog"
      data-testid="gallery-open"
      className="vc-focus group mt-5 inline-flex items-center gap-3 self-start font-display text-[10.5px] font-medium uppercase vc-tracked text-ink/60 transition-colors duration-500 hover:text-ink"
    >
      {dict.viewPhotos(item.photos.length)}
      <span aria-hidden className="inline-block transition-transform duration-500 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1">
        &rarr;
      </span>
    </button>
  );
}

function Features({ item }: { item: PublicItem }) {
  const { dict } = useReaderLang();
  if (!item.features.length) return null;
  return (
    <div className="mt-7" data-testid="features">
      <Label>{dict.features}</Label>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2" aria-label={dict.features}>
        {item.features.map((f, i) => (
          <li key={`${i}-${f}`} className="flex items-center gap-2 font-sans text-[13px] text-ink/70">
            <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-gold/70" />
            <bdi>{f}</bdi>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ficha técnica completa, con «sin dato» explícito. */
function FullFacts({ item, className }: { item: PublicItem; className?: string }) {
  const { dict, lang } = useReaderLang();
  // [etiqueta, valor, ¿es una cifra (LTR)?]
  const rows: Array<[string, string | null, boolean]> = [
    [dict.operation, item.operation, false],
    [dict.price, item.price, true],
    [dict.place, item.place, false], // contenido: se aísla abajo con <bdi>
    [dict.surface, item.squareMeters === null ? null : `${formatNumber(item.squareMeters, lang)} m²`, true],
    [dict.bedrooms, item.bedrooms === null ? null : formatNumber(item.bedrooms, lang), true],
    [dict.bathrooms, item.bathrooms === null ? null : formatNumber(item.bathrooms, lang), true],
    [dict.floor, item.floorShort === null ? null : item.floor, false],
  ];
  return (
    <dl className={cn("w-full", className)} data-testid="full-facts">
      {rows.map(([k, v, ltr]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-ink/10 py-3">
          <dt>
            <Label>{k}</Label>
          </dt>
          <dd className="min-w-0 break-words text-end font-serif text-[17px] leading-none vc-nums text-ink md:text-[19px]">
            {v === null ? <span className="font-sans text-[12px] italic text-ink/40">{dict.noData}</span> : ltr ? <span dir="ltr">{v}</span> : <bdi>{v}</bdi>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** La descripción completa del catálogo (DC3): íntegra, una sola vez. */
function Copy({ item }: { item: PublicItem }) {
  return (
    <div className="flex flex-col gap-6" data-testid="full-description">
      {item.copy.map((b, i) => (
        <div key={i} data-testid={b.heading ? "story-chapter" : "copy-block"}>
          {b.heading ? <h3 className="font-serif text-[21px] font-normal leading-tight text-ink md:text-[24px]"><bdi>{b.heading}</bdi></h3> : null}
          <p className={cn("whitespace-pre-line break-words font-sans text-[15px] leading-[1.75] text-ink/85", b.heading && "mt-3")}><bdi>{b.text}</bdi></p>
        </div>
      ))}
    </div>
  );
}

// ─── Pantalla 1 · Apertura ───────────────────────────────────────────────────

/** Foto de apertura grande, título, operación, precio, datos clave,
 *  miniaturas y acceso a la galería (DC1). En doble composición, panel |
 *  fotografía alternando de lado; en una columna, la foto arriba. */
export function OpeningSpread({
  item,
  index,
  total,
  url,
  flipped,
  onOpenGallery,
}: {
  item: PublicItem;
  index: number;
  total: number;
  url: PhotoUrl;
  /** Fotografía a la izquierda (alterna por vivienda, como la referencia). */
  flipped: boolean;
  onOpenGallery: (photo: number) => void;
}) {
  return (
    <section className={cn(styles.page, styles.split, flipped && styles.flip)} aria-label={item.title} data-part="open">
      <div className={styles.panel}>
        <ScrollRegion label={item.title}>
          <div className={cn(styles.panelInner, "flex flex-col")}>
            <ItemHead item={item} index={index} total={total} />
            <KeyFacts item={item} />
            <Thumbs item={item} url={url} onOpenGallery={onOpenGallery} />
          </div>
        </ScrollRegion>
      </div>
      <PhotoColumn item={item} photo={item.coverIndex} url={url} onOpenGallery={onOpenGallery} />
    </section>
  );
}

// ─── Pantalla 2 · Detalle ────────────────────────────────────────────────────

/** Título, ficha técnica, características y la descripción completa (DC1,
 *  DC4). La descripción se desplaza DENTRO de la pantalla con su señal; no se
 *  recorta ni crea páginas. En doble composición: datos | descripción; en una
 *  columna (o sin descripción), todo en un panel. */
export function DetailSpread({
  item,
  index,
  total,
  single,
  onOpenGallery,
  extra,
}: {
  item: PublicItem;
  index: number;
  total: number;
  /** Una columna: un solo panel que se desplaza. */
  single: boolean;
  onOpenGallery: (photo: number) => void;
  /** Bloque adicional bajo los datos (la opinión del cliente, PR B). */
  extra?: ReactNode;
}) {
  const { dict } = useReaderLang();
  const hasCopy = item.copy.length > 0;
  const head = (
    <>
      <ChapterMark index={index + 1} total={total} />
      <Label tone="gold" className="mt-6">
        {dict.inDetail}
      </Label>
      <h2 className="mt-2 break-words font-serif text-[24px] font-normal vc-tight text-ink md:text-[30px]"><bdi>{item.title}</bdi></h2>
      <FullFacts item={item} className="mt-6" />
      <Features item={item} />
      <GalleryLink item={item} onOpenGallery={onOpenGallery} />
      {extra}
    </>
  );
  const copyLabel = (
    <>
      <Label tone="gold">{dict.description}</Label>
      <Ornament className="mx-0 mb-6 mt-5" />
    </>
  );
  if (single || !hasCopy) {
    return (
      <section className={cn(styles.page, styles.composed)} aria-label={dict.detailOf(item.title)} data-part="detail">
        <div className={styles.panel}>
          <ScrollRegion label={dict.detailOf(item.title)}>
            <div className={cn(styles.panelInner, "flex flex-col")}>
              {head}
              {hasCopy ? (
                <div className="mt-10">
                  {copyLabel}
                  <Copy item={item} />
                </div>
              ) : null}
            </div>
          </ScrollRegion>
        </div>
      </section>
    );
  }
  return (
    <section className={cn(styles.page, styles.twoPanels)} aria-label={dict.detailOf(item.title)} data-part="detail">
      <div className={styles.panel}>
        <ScrollRegion label={dict.sheetOf(item.title)}>
          <div className={cn(styles.panelInner, "flex flex-col")}>{head}</div>
        </ScrollRegion>
      </div>
      <div className={styles.panel} aria-label={dict.descriptionOf(item.title)}>
        <ScrollRegion label={dict.descriptionOf(item.title)}>
          <div className={cn(styles.panelInner, "flex flex-col")}>
            {copyLabel}
            <Copy item={item} />
          </div>
        </ScrollRegion>
      </div>
    </section>
  );
}

// ─── Cierre «Hablemos» (D20) y colofón ───────────────────────────────────────

export function ClosingPage({ catalog, expiresAt, pdf = null }: { catalog: PublicCatalog; expiresAt: string; pdf?: ReaderPdf | null }) {
  const { dict, lang } = useReaderLang();
  const hasCard = !!catalog.preparedBy || !!catalog.phone;
  const initials = (catalog.preparedBy ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const pdfBlock = pdf && catalog.items.length ? <PdfDownload pdf={pdf} variant="closing" /> : null;
  return (
    <section className={cn(styles.page, styles.centered)} aria-label={dict.contact}>
      <div className={styles.centeredInner}>
        <Label tone="gold">{dict.contact}</Label>
        <h2 className="mt-3 font-serif text-[32px] font-normal vc-tight text-ink lg:text-[40px]">{dict.letsTalk}</h2>
        <Ornament className="mt-7" />
        <p className="mt-7 max-w-[36ch] font-sans text-[14px] leading-relaxed text-ink/60">{dict.closingHint}</p>

        {hasCard ? (
          <div className="mt-9 flex w-full flex-col items-center" data-testid="contact-card">
            {initials ? (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ink font-serif text-[22px] text-cream-50 md:h-24 md:w-24 md:text-[26px]" aria-hidden>
                {initials}
              </span>
            ) : null}
            {catalog.preparedBy ? <p className="mt-5 break-words font-serif text-[25px] text-ink"><bdi>{catalog.preparedBy}</bdi></p> : null}
            <p className="mt-2 font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/40">{dict.advisor(catalog.role)} · Benjamín Cousiño Propiedades</p>
            <div className="mt-8 flex flex-wrap items-start justify-center gap-2.5">
              {catalog.phone && catalog.phoneHref ? (
                <a
                  href={catalog.phoneHref}
                  data-testid="call"
                  className="vc-focus border border-ink bg-ink px-7 py-3.5 font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-500 hover:bg-ink-soft"
                >
                  {dict.call}
                </a>
              ) : null}
              {pdfBlock}
            </div>
            {catalog.phone && catalog.phoneHref ? (
              <p className="mt-7 font-sans text-[12px] text-ink/50">
                <a dir="ltr" href={catalog.phoneHref} className="vc-focus vc-underline transition-colors duration-500 hover:text-ink">
                  {catalog.phone}
                </a>
              </p>
            ) : null}
          </div>
        ) : pdfBlock ? (
          <div className="mt-9 flex flex-col items-center">{pdfBlock}</div>
        ) : null}

        <p className="mt-12 max-w-[42ch] font-sans text-[11px] leading-relaxed text-ink/40">{dict.closingFooter(formatDateShort(expiresAt, lang))}</p>
      </div>
    </section>
  );
}

export function ColophonPage({ catalog, expiresAt }: { catalog: PublicCatalog; expiresAt: string }) {
  const { dict, lang } = useReaderLang();
  return (
    <section className={cn(styles.page, styles.centered, styles.dark)} aria-label={dict.colophon}>
      <div className={cn(styles.centeredInner, "text-cream-50")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Benjamín Cousiño Propiedades" width={3282} height={519} decoding="async" className="mx-auto h-auto w-[120px] select-none brightness-0 invert" />
        <p className="mt-3 font-display text-[9px] font-medium uppercase vc-tracked text-cream-50/50">Private Client Services</p>
        <Ornament tone="cream" className="mt-9" />
        <p className="mt-9 font-serif text-[20px] italic leading-relaxed text-cream-50/90 lg:text-[23px]">{dict.colophonLine}</p>
        <p className="mt-4 font-display text-[10px] font-medium uppercase vc-tracked-sm text-cream-50/45">{catalog.edition}</p>
        <p className="mt-12 font-sans text-[11px] leading-relaxed text-cream-50/30">{dict.colophonFooter(formatDateShort(expiresAt, lang))}</p>
      </div>
    </section>
  );
}

// ─── Estados ─────────────────────────────────────────────────────────────────

export function StatePage({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <section className={cn(styles.page, styles.centered)}>
      <div className={styles.centeredInner}>
        <Label tone="gold">{kicker}</Label>
        <h1 className="mt-3 font-serif text-[28px] font-normal vc-tight text-ink md:text-[36px]">{title}</h1>
        <Ornament className="mt-7" />
        <div className="mt-7 max-w-[36ch] font-sans text-[14px] leading-relaxed text-ink/60">{children}</div>
      </div>
    </section>
  );
}
