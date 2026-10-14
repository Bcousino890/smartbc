import type { ReactNode } from "react";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import type { ItemLayout, JourneyPage } from "@/lib/catalogs/journey-layout";
import type { PublicCatalog, PublicItem, PublicPhoto } from "@/lib/catalogs/public-contract";
import { shareExpiryLabel } from "@/lib/catalogs/share";
import { ReaderImage } from "./reader-image";
import { ScrollRegion } from "./scroll-region";
import styles from "./reader.module.css";

// Páginas del lector C · Boutique (BCP-01 T8). Solo pintan el contrato
// público; no saben nada de la sincronización.

export type PhotoUrl = (src: string, width: number) => string;

const SRCSET_WIDTHS = [640, 1080, 1600, 1920];

export function photoProps(photo: PublicPhoto, url: PhotoUrl, sizes: string) {
  return {
    src: url(photo.src, 1080),
    srcSet: SRCSET_WIDTHS.map((w) => `${url(photo.src, w)} ${w}w`).join(", "),
    sizes,
  };
}

const FRAME: Record<PublicPhoto["orientation"], { cls: string; ratio: number | null }> = {
  landscape: { cls: styles.frameLandscape, ratio: 3 / 2 },
  portrait: { cls: styles.framePortrait, ratio: 2 / 3 },
  square: { cls: styles.frameSquare, ratio: 1 },
  unknown: { cls: styles.frameUnknown, ratio: null },
};

/** La foto llena el marco si su proporción se parece (±20 %); si no, se ve
 *  entera sobre el color del marco, sin recortar la vivienda. */
export function FramedPhoto({
  photo,
  url,
  sizes,
  onOpen,
  label,
}: {
  photo: PublicPhoto | undefined;
  url: PhotoUrl;
  sizes: string;
  onOpen?: () => void;
  label: string;
}) {
  if (!photo) {
    return (
      <div className={`${styles.frame} ${styles.noPhoto}`} data-check-overflow="foto">
        Sin fotos
      </div>
    );
  }
  const f = FRAME[photo.orientation];
  const ratio = photo.width && photo.height ? photo.width / photo.height : null;
  const fits = f.ratio !== null && ratio !== null && Math.abs(ratio / f.ratio - 1) <= 0.2;
  const cls = `${styles.frame} ${f.cls} ${fits ? styles.fitCover : styles.fitContain}`;
  const img = (
    <ReaderImage variant="frame" {...photoProps(photo, url, sizes)} alt="" decoding="async" />
  );
  return onOpen ? (
    <button type="button" className={cls} onClick={onOpen} aria-label={label}>
      {img}
    </button>
  ) : (
    <div className={cls}>{img}</div>
  );
}

export function n2(i: number): string {
  return String(i + 1).padStart(2, "0");
}

export function CoverPage({ catalog, url }: { catalog: PublicCatalog; url: PhotoUrl }) {
  return (
    <section className={`${styles.page} ${styles.coverPage}`} aria-label="Portada">
      <div className={styles.coverInner}>
        <CatalogCover
          readable
          data={{
            title: catalog.title,
            subtitle: null,
            edition: catalog.edition,
            photoUrl: catalog.coverPhoto ? url(catalog.coverPhoto, 1080) : null,
            preparedBy: catalog.preparedBy,
          }}
        />
      </div>
    </section>
  );
}

export function IntroPage({ catalog }: { catalog: PublicCatalog }) {
  return (
    <section className={`${styles.page} ${styles.introPage}`} aria-label="Introducción">
      <p className={styles.kicker}>Una selección pensada para ti</p>
      <h2 className={styles.introTitle}>{catalog.title}</h2>
      <p className={styles.introBody}>{catalog.intro}</p>
      {catalog.preparedBy ? (
        <p className={styles.introSign}>
          <span>Un saludo,</span>
          <strong>{catalog.preparedBy}</strong>
        </p>
      ) : null}
    </section>
  );
}

export function IndexPage({
  catalog,
  onOpen,
  folioOf,
}: {
  catalog: PublicCatalog;
  onOpen: (key: string) => void;
  /** Folio de la apertura de cada vivienda (cuenta todas sus partes). */
  folioOf: (key: string) => number;
}) {
  return (
    <section className={`${styles.page} ${styles.indexPage}`} aria-label="Índice">
      <header className={styles.indexHead}>
        <p className={styles.kicker}>Índice</p>
        <h2 className={styles.indexTitle}>En esta selección</h2>
      </header>
      {catalog.items.length === 0 ? (
        <div className={styles.emptyBox} data-testid="empty-state">
          <h3 className={styles.stateTitle}>Esta selección no tiene viviendas ahora mismo</h3>
          <p className={styles.lede}>Se actualizará en cuanto haya opciones nuevas. Esta página se actualiza sola.</p>
          <span className={styles.ornament} aria-hidden="true">
            ✦
          </span>
        </div>
      ) : (
        <ScrollRegion label="Índice" variant="index" cue="Más viviendas ↓">
        <ol className={styles.indexList}>
          {catalog.items.map((it, i) => (
            <li key={it.key}>
              <button type="button" className={styles.indexLink} onClick={() => onOpen(it.key)} data-check-overflow="indice">
                <span className={styles.ixN}>{n2(i)}</span>
                <span className={styles.indexName}>
                  {it.title}
                  {it.reserved ? <span className={styles.ixReserved}>Reservada</span> : null}
                </span>
                <span className={styles.ixDots} aria-hidden="true" />
                <span className={styles.ixPage}>{folioOf(it.key)}</span>
                <span className={styles.ixMeta}>
                  <span>{it.place ?? "Zona · sin dato"}</span>
                  <span className={styles.ixPrice}>{it.price}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        </ScrollRegion>
      )}
    </section>
  );
}

function Fact({ value, unit, label }: { value: number | null; unit: string; label: string }) {
  if (value === null) {
    return (
      <li>
        <span className={styles.unknown}>
          {label} · sin dato
        </span>
      </li>
    );
  }
  return (
    <li>
      <strong>{value.toLocaleString("es-ES")}</strong>
      <span className={styles.unit}>{unit}</span>
    </li>
  );
}

export function KeyFacts({ item }: { item: PublicItem }) {
  return (
    <ul className={styles.facts} aria-label="Datos clave">
      <Fact value={item.squareMeters} unit="m²" label="m²" />
      <Fact value={item.bedrooms} unit="dorm." label="Dormitorios" />
      <Fact value={item.bathrooms} unit={item.bathrooms === 1 ? "baño" : "baños"} label="Baños" />
      <li>{item.floor.endsWith("sin dato") ? <span className={styles.unknown}>{item.floor}</span> : <strong>{item.floor}</strong>}</li>
    </ul>
  );
}

export function PhotoPage({
  item,
  index,
  url,
  sizes,
  onOpenGallery,
}: {
  item: PublicItem;
  index: number;
  url: PhotoUrl;
  sizes: string;
  onOpenGallery: (photo: number) => void;
}) {
  return (
    <section className={`${styles.page} ${styles.photoPage}`} aria-label={`Foto de ${item.title}`}>
      <FramedPhoto
        photo={item.photos[item.coverIndex]}
        url={url}
        sizes={sizes}
        label={`Ver las fotos de ${item.title}`}
        onOpen={item.photos.length ? () => onOpenGallery(item.coverIndex) : undefined}
      />
      <p className={styles.caption}>
        <span className={styles.plate}>Lámina {n2(index)}</span>
        {item.title}
      </p>
    </section>
  );
}

function ItemHeader({ catalog, item, index }: { catalog: PublicCatalog; item: PublicItem; index: number }) {
  return (
    <>
      <p className={styles.runner}>
        {catalog.title} · {catalog.edition}
      </p>
      <p className={styles.kicker}>
        <span className={styles.itemN}>{n2(index)}</span>{" "}
        {[item.operation, item.place].filter(Boolean).join(" · ")}
      </p>
      <h2 className={styles.itemTitle} data-check-overflow="titulo">
        {item.title}
      </h2>
      <p className={styles.price}>
        {item.price}
        {item.reserved ? <span className={styles.reserved}>Reservada</span> : null}
      </p>
    </>
  );
}

/** Entrada breve y hasta tres puntos verificados (literales de la ficha). */
function LeadAndHighlights({ item }: { item: PublicItem }) {
  return (
    <>
      {item.lead ? (
        <p className={styles.leadText} data-testid="lead">
          {item.lead}
        </p>
      ) : null}
      {item.highlights.length ? (
        <ul className={styles.highlights} aria-label="Puntos destacados" data-testid="highlights">
          {item.highlights.slice(0, 3).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Thumbs({ item, url, onOpenGallery }: { item: PublicItem; url: PhotoUrl; onOpenGallery: (photo: number) => void }) {
  if (item.photos.length <= 1) return null;
  return (
    <>
      <div className={styles.thumbs}>
        {item.photos.slice(0, 8).map((p, i) => (
          <button key={p.src} type="button" className={styles.thumb} onClick={() => onOpenGallery(i)} aria-label={`Foto ${i + 1} de ${item.photos.length}`}>
            <ReaderImage variant="thumb" src={url(p.src, 640)} alt="" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      <button type="button" className={styles.galleryOpen} onClick={() => onOpenGallery(0)}>
        Ver las {item.photos.length} fotos
      </button>
    </>
  );
}

function Features({ item }: { item: PublicItem }) {
  if (!item.features.length) return null;
  return (
    <ul className={styles.features} aria-label="Características">
      {item.features.map((f, i) => (
        <li key={`${i}-${f}`}>{f}</li>
      ))}
    </ul>
  );
}

/** Ficha completa: todos los datos estructurados, con «sin dato» explícito.
 *  En la ficha breve, operación, precio y zona ya están en la cabecera de la
 *  misma página y no se repiten. */
function FullFacts({ item, compact = false }: { item: PublicItem; compact?: boolean }) {
  const rows: Array<[string, string | null]> = [
    ...(compact
      ? []
      : ([
          ["Operación", item.operation],
          ["Precio", item.price],
          ["Zona", item.place],
        ] as Array<[string, string | null]>)),
    ["Superficie", item.squareMeters === null ? null : `${item.squareMeters.toLocaleString("es-ES")} m²`],
    ["Dormitorios", item.bedrooms === null ? null : item.bedrooms.toLocaleString("es-ES")],
    ["Baños", item.bathrooms === null ? null : item.bathrooms.toLocaleString("es-ES")],
    ["Planta", item.floor.endsWith("sin dato") ? null : item.floor],
  ];
  return (
    <dl className={styles.factList} data-testid="full-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? <span className={styles.unknown}>sin dato</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionText({ section }: { section: PublicItem["sections"][number] }) {
  return (
    <div className={styles.section} data-testid="journey-section">
      {section.heading ? <h3 className={styles.sectionHeading}>{section.heading}</h3> : null}
      <p className={styles.sectionText}>{section.text}</p>
    </div>
  );
}

function GalleryLink({ item, onOpenGallery }: { item: PublicItem; onOpenGallery: (photo: number) => void }) {
  if (item.photos.length <= 1) return null;
  return (
    <button type="button" className={styles.galleryOpen} onClick={() => onOpenGallery(0)}>
      Ver las {item.photos.length} fotos
    </button>
  );
}

/** E1 (D-QA6) · Mosaico adaptable de hasta 4 fotos elegibles de la galería. */
function Mosaic({ item, url, onOpenGallery }: { item: PublicItem; url: PhotoUrl; onOpenGallery: (photo: number) => void }) {
  const tiles = item.mosaic.filter((i) => item.photos[i]).slice(0, 4);
  if (!tiles.length) return null;
  return (
    <div className={`${styles.mosaic} ${styles[`mosaic${tiles.length}`] ?? ""}`} data-testid="mosaic">
      {tiles.map((i) => (
        <button key={i} type="button" className={styles.mosaicTile} onClick={() => onOpenGallery(i)} aria-label={`Foto ${i + 1} de ${item.photos.length}`}>
          <ReaderImage variant="thumb" src={url(item.photos[i].src, 640)} alt="" loading="lazy" decoding="async" />
        </button>
      ))}
    </div>
  );
}

/** E1 (D-QA6) · Ficha breve: datos completos, características y mosaico. */
function BriefBody({ item, url, onOpenGallery }: { item: PublicItem; url: PhotoUrl; onOpenGallery: (photo: number) => void }) {
  return (
    <div className={styles.brief} data-testid="brief">
      <FullFacts item={item} compact />
      <Features item={item} />
      <Mosaic item={item} url={url} onOpenGallery={onOpenGallery} />
      <GalleryLink item={item} onOpenGallery={onOpenGallery} />
    </div>
  );
}

/** Doble página · apertura (derecha): datos clave, entrada y puntos; o la
 *  ficha breve. Una entrada larga (D-QA2) no va aquí: abre el recorrido. */
export function OpeningPage({
  catalog,
  item,
  index,
  folio,
  url,
  layout,
  onOpenGallery,
  onContinue,
}: {
  catalog: PublicCatalog;
  item: PublicItem;
  index: number;
  folio: number;
  url: PhotoUrl;
  layout: ItemLayout;
  onOpenGallery: (photo: number) => void;
  /** Ir a la primera doble página del recorrido (null si no hay). */
  onContinue: (() => void) | null;
}) {
  const showLead = layout.introInOpening;
  return (
    <section className={`${styles.page} ${styles.textPage}`} aria-label={item.title} data-part="open">
      <ScrollRegion label={item.title}>
        <ItemHeader catalog={catalog} item={item} index={index} />
        {layout.brief ? (
          <>
            {showLead ? <LeadAndHighlights item={item} /> : <LeadAndHighlights item={{ ...item, lead: null }} />}
            <BriefBody item={item} url={url} onOpenGallery={onOpenGallery} />
          </>
        ) : (
          <>
            <KeyFacts item={item} />
            {(showLead && item.lead) || item.highlights.length ? (
              <span className={styles.ornament} aria-hidden="true">
                ✦
              </span>
            ) : null}
            {showLead ? <LeadAndHighlights item={item} /> : <LeadAndHighlights item={{ ...item, lead: null }} />}
            <Thumbs item={item} url={url} onOpenGallery={onOpenGallery} />
            {!showLead && onContinue ? (
              <button type="button" className={styles.continueLink} onClick={onContinue} data-testid="to-journey">
                Sigue · La vivienda →
              </button>
            ) : null}
          </>
        )}
      </ScrollRegion>
      <p className={styles.folio}>— {folio} —</p>
    </section>
  );
}

/** Doble página · recorrido: los bloques de una página (entrada larga y
 *  secciones), con su foto pequeña si la lleva. Sin foto adecuada y sola en
 *  su doble página, es una página de texto compuesta (D-QA3). */
export function JourneyTextPage({
  item,
  page,
  inlinePhoto,
  composed,
  folio,
  more,
  url,
  onOpenGallery,
}: {
  item: PublicItem;
  page: JourneyPage;
  inlinePhoto: number | null;
  /** Sola en su doble página y sin foto: composición tipográfica centrada. */
  composed: boolean;
  folio: number | null;
  /** Quedan secciones fuera del recorrido: enlace al detalle. */
  more: { label: string; onClick: () => void } | null;
  url: PhotoUrl;
  onOpenGallery: (photo: number) => void;
}) {
  return (
    <section
      className={`${styles.page} ${styles.textPage} ${styles.journeyPage} ${composed ? styles.composedPage : ""}`}
      aria-label={`${item.title} · recorrido`}
      data-composed={composed ? "true" : undefined}
    >
      <ScrollRegion label={`${item.title} · recorrido`}>
        <p className={styles.runner}>{item.title}</p>
        {composed ? (
          <span className={styles.ornament} aria-hidden="true">
            ✦
          </span>
        ) : null}
        {inlinePhoto !== null && item.photos[inlinePhoto] ? (
          <div className={styles.inlinePhoto}>
            <FramedPhoto
              photo={item.photos[inlinePhoto]}
              url={url}
              sizes="(min-width: 900px) and (min-height: 620px) 30vh, 100vw"
              label={`Ver las fotos de ${item.title}`}
              onOpen={() => onOpenGallery(inlinePhoto)}
            />
          </div>
        ) : null}
        {page.blocks.map((b) =>
          b.kind === "intro" ? (
            <p key="intro" className={styles.introBlock} data-testid="journey-intro">
              {item.lead}
            </p>
          ) : (
            <SectionText key={b.index} section={item.sections[b.index]} />
          ),
        )}
        {composed ? <GalleryLink item={item} onOpenGallery={onOpenGallery} /> : null}
        {more ? (
          <button type="button" className={styles.galleryOpen} onClick={more.onClick} data-testid="to-detail">
            {more.label}
          </button>
        ) : null}
      </ScrollRegion>
      {folio !== null ? <p className={styles.folio}>— {folio} —</p> : null}
    </section>
  );
}

export function JourneyPhotoPage({
  item,
  photo,
  url,
  onOpenGallery,
}: {
  item: PublicItem;
  photo: number;
  url: PhotoUrl;
  onOpenGallery: (photo: number) => void;
}) {
  return (
    <section className={`${styles.page} ${styles.photoPage}`} aria-label={`Foto de ${item.title}`}>
      <FramedPhoto
        photo={item.photos[photo]}
        url={url}
        sizes="(min-width: 900px) and (min-height: 620px) 45vh, 100vw"
        label={`Ver las fotos de ${item.title}`}
        onOpen={() => onOpenGallery(photo)}
      />
    </section>
  );
}

/** Doble página · detalle (izquierda): ficha completa y características. */
export function DetailFactsPage({
  item,
  index,
  folio,
  url,
  onOpenGallery,
}: {
  item: PublicItem;
  index: number;
  folio: number | null;
  url: PhotoUrl;
  onOpenGallery: (photo: number) => void;
}) {
  return (
    <section className={`${styles.page} ${styles.textPage}`} aria-label={`${item.title} · ficha completa`} data-part="detail">
      <ScrollRegion label={`${item.title} · ficha completa`}>
        <p className={styles.kicker}>
          <span className={styles.itemN}>{n2(index)}</span> La vivienda en detalle
        </p>
        <h2 className={styles.detailTitle}>{item.title}</h2>
        <FullFacts item={item} />
        <Features item={item} />
        <Thumbs item={item} url={url} onOpenGallery={onOpenGallery} />
      </ScrollRegion>
      {folio !== null ? <p className={styles.folio}>— {folio} —</p> : null}
    </section>
  );
}

/** Doble página · detalle (derecha): la descripción completa, íntegra. Si el
 *  recorrido de una historia no alcanza, «La historia completa» (L1) con
 *  todos los capítulos, y después la descripción de la ficha si la hay. */
export function DescriptionPage({ item, folio, story }: { item: PublicItem; folio: number; story: boolean }) {
  const label = story ? "La historia completa" : "Descripción completa";
  return (
    <section className={`${styles.page} ${styles.textPage}`} aria-label={`${item.title} · ${label.toLowerCase()}`}>
      <ScrollRegion label={`${item.title} · ${label.toLowerCase()}`}>
        <p className={styles.kicker}>{label}</p>
        <span className={styles.ornament} aria-hidden="true">
          ✦
        </span>
        {story ? (
          <div className={styles.storyFull} data-testid="story-full">
            {item.lead ? <p className={styles.introBlock}>{item.lead}</p> : null}
            {item.sections.map((sec, i) => (
              <div key={i} className={styles.section} data-testid="story-chapter">
                {sec.heading ? <h3 className={styles.sectionHeading}>{sec.heading}</h3> : null}
                <p className={styles.sectionText}>{sec.text}</p>
              </div>
            ))}
          </div>
        ) : null}
        {story && item.description ? <p className={`${styles.kicker} ${styles.subKicker}`}>Descripción de la ficha</p> : null}
        {item.description ? (
          <p className={styles.desc} data-testid="full-description">
            {item.description}
          </p>
        ) : null}
      </ScrollRegion>
      <p className={styles.folio}>— {folio} —</p>
    </section>
  );
}

/**
 * Una página (móvil): la vivienda es UNA hoja continua. Apertura, el
 * recorrido entero alternando con sus fotos, y la ficha completa y la
 * descripción íntegra plegables. Ficha breve: datos desplegados y mosaico.
 */
export function ItemSheetPage({
  catalog,
  item,
  index,
  folio,
  url,
  layout,
  onOpenGallery,
}: {
  catalog: PublicCatalog;
  item: PublicItem;
  index: number;
  folio: number;
  url: PhotoUrl;
  layout: ItemLayout;
  onOpenGallery: (photo: number) => void;
}) {
  return (
    <section className={`${styles.page} ${styles.textPage}`} aria-label={item.title} data-part="sheet">
      <ScrollRegion label={item.title}>
        <ItemHeader catalog={catalog} item={item} index={index} />
        {layout.brief ? (
          <>
            <LeadAndHighlights item={item} />
            <BriefBody item={item} url={url} onOpenGallery={onOpenGallery} />
          </>
        ) : (
          <>
            <KeyFacts item={item} />
            {item.lead || item.highlights.length ? (
              <span className={styles.ornament} aria-hidden="true">
                ✦
              </span>
            ) : null}
            <LeadAndHighlights item={item} />
            {item.sections.map((sec, i) => (
              <div key={i} className={styles.sheetSection}>
                {sec.photo !== null && item.photos[sec.photo] ? (
                  <div className={styles.sheetPhoto}>
                    <FramedPhoto
                      photo={item.photos[sec.photo]}
                      url={url}
                      sizes="100vw"
                      label={`Ver las fotos de ${item.title}`}
                      onOpen={() => onOpenGallery(sec.photo!)}
                    />
                  </div>
                ) : null}
                <SectionText section={sec} />
              </div>
            ))}
            <details className={styles.fold} data-testid="fold-facts">
              <summary>Ficha completa</summary>
              <FullFacts item={item} />
              <Features item={item} />
            </details>
            {item.description ? (
              <details className={styles.fold} data-testid="fold-description">
                <summary>Descripción completa</summary>
                <p className={styles.desc} data-testid="full-description">
                  {item.description}
                </p>
              </details>
            ) : null}
            <Thumbs item={item} url={url} onOpenGallery={onOpenGallery} />
          </>
        )}
      </ScrollRegion>
      <p className={styles.folio}>— {folio} —</p>
    </section>
  );
}

/** Cierre «Hablemos» (D20): marca, tarjeta del asesor y UNA acción (llamar).
 *  El contacto es el guardado en el catálogo; si falta un dato, no se pinta. */
export function ClosingPage({ catalog, expiresAt }: { catalog: PublicCatalog; expiresAt: string }) {
  const hasCard = !!catalog.preparedBy || !!catalog.phone;
  return (
    <section className={`${styles.page} ${styles.closingPage}`} aria-label="Contacto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.closingLogo} src="/logo.png" alt="Benjamín Cousiño Propiedades" width={3282} height={519} decoding="async" />
      <span className={styles.closingRule} aria-hidden="true" />
      <p className={styles.kicker}>Contacto</p>
      <h2 className={styles.closingTitle}>Hablemos</h2>
      <p className={styles.lede}>Si alguna de estas viviendas te encaja, organizamos la visita cuando mejor te venga.</p>
      {hasCard ? (
        <div className={styles.contactCard} data-testid="contact-card">
          <p className={styles.contactRole}>{catalog.role === "asesora" ? "Tu asesora" : "Tu asesor"}</p>
          {catalog.preparedBy ? <p className={styles.contactName}>{catalog.preparedBy}</p> : null}
          {catalog.phone && catalog.phoneHref ? (
            <>
              <a className={styles.callButton} href={catalog.phoneHref} data-testid="call">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
                </svg>
                Llamar
              </a>
              <span className={styles.contactNumber}>{catalog.phone}</span>
            </>
          ) : null}
        </div>
      ) : null}
      <p className={styles.closingFoot}>
        Selección preparada para ti. Se actualiza sola cuando hay cambios · disponible hasta el {shareExpiryLabel(expiresAt)}.
      </p>
      <span className={styles.ornament} aria-hidden="true">
        ✦
      </span>
    </section>
  );
}

export function StatePage({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <section className={`${styles.page} ${styles.statePage}`}>
      <p className={styles.kicker}>{kicker}</p>
      <h1 className={styles.stateTitle}>{title}</h1>
      {children}
      <span className={styles.ornament} aria-hidden="true">
        ✦
      </span>
    </section>
  );
}
