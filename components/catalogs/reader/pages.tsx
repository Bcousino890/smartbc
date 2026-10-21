import type { ReactNode } from "react";
import { ChapterMark, DataPoint, Label, Ornament, Rule, StatusLine } from "@/app/v/[token]/_components/editorial";
import { CatalogCover, countLabel } from "@/components/catalogs/catalog-cover";
import { contactRoleLabel } from "@/lib/catalogs/contact-format";
import { COVER_FALLBACK_WIDTH, COVER_SIZES, coverPhotoWidth, coverSrcSet } from "@/lib/catalogs/cover-srcset";
import type { PublicCatalog, PublicItem, PublicPhoto } from "@/lib/catalogs/public-contract";
import { shareExpiryLabel } from "@/lib/catalogs/share";
import { cn } from "@/lib/utils";
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

function num(v: number | null): ReactNode {
  return v === null ? <span className="text-ink/30">—</span> : v.toLocaleString("es-ES");
}

/** «Ver 12 fotografías» */
function photosWord(n: number): string {
  return `Ver ${n} ${n === 1 ? "fotografía" : "fotografías"}`;
}

// ─── Portada ─────────────────────────────────────────────────────────────────

export function CoverPage({ catalog, url, onBegin }: { catalog: PublicCatalog; url: PhotoUrl; onBegin?: () => void }) {
  // PR7a: la portada va a sangre y en retina pedía 1.600 px para 2.880. Con
  // `srcset` acotado al ancho real de la foto (hasta 2.560, el máximo
  // guardado) el navegador pide la variante que le corresponde. Misma caja,
  // misma posición, mismo recorte; `src` sigue siendo la variante de siempre.
  const cover = catalog.coverPhoto;
  return (
    <section className={cn(styles.page, styles.coverPage)} aria-label="Portada">
      <CatalogCover
        readable
        onBegin={onBegin}
        data={{
          title: catalog.title,
          subtitle: null,
          edition: catalog.edition,
          photoUrl: cover ? url(cover, COVER_FALLBACK_WIDTH) : null,
          photoSrcSet: cover ? coverSrcSet(url, cover, coverPhotoWidth(catalog)) : null,
          photoSizes: COVER_SIZES,
          preparedBy: catalog.preparedBy,
          countLabel: countLabel(catalog.items.length),
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
  const hasIntro = !!catalog.intro;
  return (
    <section className={cn(styles.page, styles.indexPage)} aria-label="Índice">
      <div className={cn(styles.indexLayout, hasIntro && styles.indexWithIntro)}>
        {hasIntro ? (
          <div className={styles.introCol} aria-label="Introducción">
            <Label tone="gold">Una selección pensada para ti</Label>
            <h2 className="mt-3 font-serif text-[26px] font-normal vc-tight text-ink sm:text-[32px] lg:text-[38px]">{catalog.title}</h2>
            <Ornament className="mx-0 mt-6" />
            <p className="mt-6 whitespace-pre-line break-words font-sans text-[15px] leading-relaxed text-ink/80">{catalog.intro}</p>
            {catalog.preparedBy ? (
              <p className="mt-7 font-sans text-[13px] text-ink/55">
                Un saludo,
                <span className="mt-1 block font-serif text-[22px] italic text-ink">{catalog.preparedBy}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={styles.indexCol}>
          <header className="text-center">
            <Label tone="gold">Índice</Label>
            <h2 className="mt-3 font-serif text-[26px] font-normal vc-tight text-ink sm:text-[32px] lg:text-[40px]">En esta selección</h2>
            {!hasIntro ? <p className="mt-3 font-sans text-[13px] text-ink/50">{catalog.title}</p> : null}
            {pdf && catalog.items.length ? <PdfDownload pdf={pdf} variant="index" /> : null}
            <Ornament className="mt-6" />
          </header>

          {catalog.items.length === 0 ? (
            <div className="mt-10 text-center" data-testid="empty-state">
              <h3 className="font-serif text-[22px] font-normal text-ink">Esta selección no tiene viviendas ahora mismo</h3>
              <p className="mt-3 font-sans text-[14px] leading-relaxed text-ink/55">Se actualizará en cuanto haya opciones nuevas. Esta página se actualiza sola.</p>
            </div>
          ) : (
            <ScrollRegion label="Índice" variant="index" cue="Más viviendas ↓">
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
                      <span className="font-display text-[10.5px] font-medium uppercase vc-tracked vc-nums text-ink/30">{n2(i)}</span>
                      <span className="min-w-0">
                        <span className="block break-words font-display text-[12px] font-medium uppercase vc-tracked-sm text-ink transition-colors duration-500 group-hover:text-gold-dark sm:text-[13px]">
                          {it.title}
                        </span>
                        <span className="mt-0.5 block font-sans text-[11.5px] text-ink/45">{it.place ?? "Zona · sin dato"}</span>
                      </span>
                      <span className="max-w-[8.5rem] justify-self-end break-words text-right font-serif text-[18px] leading-tight vc-nums text-ink sm:max-w-[11rem] sm:text-[20px] lg:text-[22px]">{it.price}</span>
                      {/* En una columna, el estado o el folio van bajo el precio. */}
                      <span
                        className={cn(
                          "col-start-3 row-start-2 justify-self-end whitespace-nowrap font-display text-[9.5px] font-medium uppercase vc-tracked-sm sm:col-start-auto sm:row-start-auto",
                          it.reserved ? "text-gold-dark" : "text-ink/30",
                        )}
                      >
                        {it.reserved ? "Reservada" : `p. ${folioOf(it.key)}`}
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
  const p = item.photos[photo];
  return (
    <div className={styles.photoCol}>
      {p ? (
        <button type="button" className={cn(styles.photoBtn, "vc-focus group")} onClick={() => onOpenGallery(photo)} aria-haspopup="dialog" aria-label={`Ver las fotos de ${item.title}`}>
          <ReaderImage variant="frame" {...photoProps(p, url, sizes)} alt={item.title} decoding="async" />
          {item.photos.length > 1 ? (
            <span className="pointer-events-none absolute bottom-6 right-6 border border-cream-50/45 bg-ink/55 px-4 py-2.5 font-display text-[9.5px] font-medium uppercase vc-tracked text-cream-50 backdrop-blur-sm">
              {photosWord(item.photos.length)}
            </span>
          ) : null}
        </button>
      ) : (
        <div className={styles.photoEmpty} data-check-overflow="foto">
          <Label className="text-ink/30">Sin fotos</Label>
        </div>
      )}
    </div>
  );
}

function ItemHead({ item, index, total }: { item: PublicItem; index: number; total: number }) {
  return (
    <>
      <div className="flex items-center gap-4 md:gap-5">
        <ChapterMark index={index + 1} total={total} />
        <span aria-hidden className="h-px flex-1 bg-ink/12" />
      </div>
      <Label tone="gold" className="mt-4 md:mt-7">
        {[item.operation, item.place].filter(Boolean).join(" · ")}
      </Label>
      <h2 className="mt-2 max-w-[18ch] break-words font-serif text-[26px] font-normal vc-tight text-ink sm:text-[30px] md:text-[34px] lg:text-[42px]" data-check-overflow="titulo" data-testid="item-title">
        {item.title}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 md:mt-5">
        <p className="font-serif text-[23px] leading-none vc-nums text-ink md:text-[26px] lg:text-[30px]">{item.price}</p>
        {item.reserved ? <StatusLine tone="alert">Reservada</StatusLine> : null}
      </div>
      <Rule className="my-4 md:my-6" />
    </>
  );
}

export function KeyFacts({ item }: { item: PublicItem }) {
  const floor = item.floor.endsWith("sin dato") ? null : item.floor.replace(/^Planta /, "");
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4 md:gap-x-10" aria-label="Datos clave">
      <DataPoint
        label="Superficie"
        value={
          item.squareMeters === null ? (
            <span className="text-ink/30">—</span>
          ) : (
            <>
              {item.squareMeters.toLocaleString("es-ES")}
              <span className="ms-1 text-[13px] text-ink/45">m²</span>
            </>
          )
        }
      />
      <DataPoint label="Dormitorios" value={num(item.bedrooms)} />
      <DataPoint label="Baños" value={num(item.bathrooms)} />
      <DataPoint label="Planta" value={floor ?? <span className="text-ink/30">—</span>} />
    </div>
  );
}

/** Miniaturas de la apertura: las primeras fotos elegibles (sin la de
 *  apertura) y el acceso a la galería completa. */
const THUMBS_MAX = 6;

function Thumbs({ item, url, onOpenGallery }: { item: PublicItem; url: PhotoUrl; onOpenGallery: (photo: number) => void }) {
  const others = item.photos.map((_, i) => i).filter((i) => i !== item.coverIndex);
  if (!others.length) return null;
  const shown = others.slice(0, THUMBS_MAX);
  return (
    <div className="mt-6 md:mt-8" data-testid="thumbs">
      <ul className={styles.thumbs}>
        {shown.map((i) => (
          <li key={item.photos[i].key}>
            <button type="button" className={cn(styles.thumb, "vc-focus")} onClick={() => onOpenGallery(i)} aria-haspopup="dialog" aria-label={`Foto ${i + 1} de ${item.photos.length}`}>
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
  if (item.photos.length <= 1) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenGallery(item.coverIndex)}
      aria-haspopup="dialog"
      data-testid="gallery-open"
      className="vc-focus group mt-5 inline-flex items-center gap-3 self-start font-display text-[10.5px] font-medium uppercase vc-tracked text-ink/60 transition-colors duration-500 hover:text-ink"
    >
      {photosWord(item.photos.length)}
      <span aria-hidden className="inline-block transition-transform duration-500 group-hover:translate-x-1">
        &rarr;
      </span>
    </button>
  );
}

function Features({ item }: { item: PublicItem }) {
  if (!item.features.length) return null;
  return (
    <div className="mt-7" data-testid="features">
      <Label>Características</Label>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2" aria-label="Características">
        {item.features.map((f, i) => (
          <li key={`${i}-${f}`} className="flex items-center gap-2 font-sans text-[13px] text-ink/70">
            <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-gold/70" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ficha técnica completa, con «sin dato» explícito. */
function FullFacts({ item, className }: { item: PublicItem; className?: string }) {
  const rows: Array<[string, string | null]> = [
    ["Operación", item.operation],
    ["Precio", item.price],
    ["Zona", item.place],
    ["Superficie", item.squareMeters === null ? null : `${item.squareMeters.toLocaleString("es-ES")} m²`],
    ["Dormitorios", item.bedrooms === null ? null : item.bedrooms.toLocaleString("es-ES")],
    ["Baños", item.bathrooms === null ? null : item.bathrooms.toLocaleString("es-ES")],
    ["Planta", item.floor.endsWith("sin dato") ? null : item.floor],
  ];
  return (
    <dl className={cn("w-full", className)} data-testid="full-facts">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-ink/10 py-3">
          <dt>
            <Label>{k}</Label>
          </dt>
          <dd className="min-w-0 break-words text-right font-serif text-[17px] leading-none vc-nums text-ink md:text-[19px]">
            {v ?? <span className="font-sans text-[12px] italic text-ink/40">sin dato</span>}
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
          {b.heading ? <h3 className="font-serif text-[21px] font-normal leading-tight text-ink md:text-[24px]">{b.heading}</h3> : null}
          <p className={cn("whitespace-pre-line break-words font-sans text-[15px] leading-[1.75] text-ink/85", b.heading && "mt-3")}>{b.text}</p>
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
  const hasCopy = item.copy.length > 0;
  const head = (
    <>
      <ChapterMark index={index + 1} total={total} />
      <Label tone="gold" className="mt-6">
        La vivienda en detalle
      </Label>
      <h2 className="mt-2 break-words font-serif text-[24px] font-normal vc-tight text-ink md:text-[30px]">{item.title}</h2>
      <FullFacts item={item} className="mt-6" />
      <Features item={item} />
      <GalleryLink item={item} onOpenGallery={onOpenGallery} />
      {extra}
    </>
  );
  const copyLabel = (
    <>
      <Label tone="gold">Descripción</Label>
      <Ornament className="mx-0 mb-6 mt-5" />
    </>
  );
  if (single || !hasCopy) {
    return (
      <section className={cn(styles.page, styles.composed)} aria-label={`${item.title} · en detalle`} data-part="detail">
        <div className={styles.panel}>
          <ScrollRegion label={`${item.title} · en detalle`}>
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
    <section className={cn(styles.page, styles.twoPanels)} aria-label={`${item.title} · en detalle`} data-part="detail">
      <div className={styles.panel}>
        <ScrollRegion label={`${item.title} · ficha`}>
          <div className={cn(styles.panelInner, "flex flex-col")}>{head}</div>
        </ScrollRegion>
      </div>
      <div className={styles.panel} aria-label={`${item.title} · descripción`}>
        <ScrollRegion label={`${item.title} · descripción`}>
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
    <section className={cn(styles.page, styles.centered)} aria-label="Contacto">
      <div className={styles.centeredInner}>
        <Label tone="gold">Contacto</Label>
        <h2 className="mt-3 font-serif text-[32px] font-normal vc-tight text-ink lg:text-[40px]">Hablemos</h2>
        <Ornament className="mt-7" />
        <p className="mt-7 max-w-[36ch] font-sans text-[14px] leading-relaxed text-ink/60">Si alguna de estas viviendas te encaja, organizamos la visita cuando mejor te venga.</p>

        {hasCard ? (
          <div className="mt-9 flex w-full flex-col items-center" data-testid="contact-card">
            {initials ? (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ink font-serif text-[22px] text-cream-50 md:h-24 md:w-24 md:text-[26px]" aria-hidden>
                {initials}
              </span>
            ) : null}
            {catalog.preparedBy ? <p className="mt-5 break-words font-serif text-[25px] text-ink">{catalog.preparedBy}</p> : null}
            <p className="mt-2 font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/40">{contactRoleLabel(catalog.role)} · Benjamín Cousiño Propiedades</p>
            <div className="mt-8 flex flex-wrap items-start justify-center gap-2.5">
              {catalog.phone && catalog.phoneHref ? (
                <a
                  href={catalog.phoneHref}
                  data-testid="call"
                  className="vc-focus border border-ink bg-ink px-7 py-3.5 font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-500 hover:bg-ink-soft"
                >
                  Llamar
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

        <p className="mt-12 max-w-[42ch] font-sans text-[11px] leading-relaxed text-ink/40">
          Selección preparada para ti. Se actualiza sola cuando hay cambios · disponible hasta el {shareExpiryLabel(expiresAt)}.
        </p>
      </div>
    </section>
  );
}

export function ColophonPage({ catalog, expiresAt }: { catalog: PublicCatalog; expiresAt: string }) {
  return (
    <section className={cn(styles.page, styles.centered, styles.dark)} aria-label="Colofón">
      <div className={cn(styles.centeredInner, "text-cream-50")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Benjamín Cousiño Propiedades" width={3282} height={519} decoding="async" className="mx-auto h-auto w-[120px] select-none brightness-0 invert" />
        <p className="mt-3 font-display text-[9px] font-medium uppercase vc-tracked text-cream-50/50">Private Client Services</p>
        <Ornament tone="cream" className="mt-9" />
        <p className="mt-9 font-serif text-[20px] italic leading-relaxed text-cream-50/90 lg:text-[23px]">Una selección preparada para ti.</p>
        <p className="mt-4 font-display text-[10px] font-medium uppercase vc-tracked-sm text-cream-50/45">{catalog.edition}</p>
        <p className="mt-12 font-sans text-[11px] leading-relaxed text-cream-50/30">Selección privada · disponible hasta el {shareExpiryLabel(expiresAt)}</p>
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
