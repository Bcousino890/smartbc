import type { ReactNode } from "react";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import type { PublicCatalog, PublicItem, PublicPhoto } from "@/lib/catalogs/public-contract";
import { shareExpiryLabel } from "@/lib/catalogs/share";
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
    // eslint-disable-next-line @next/next/no-img-element
    <img {...photoProps(photo, url, sizes)} alt="" decoding="async" />
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
  firstItemPage,
}: {
  catalog: PublicCatalog;
  onOpen: (key: string) => void;
  firstItemPage: number;
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
                <span className={styles.ixPage}>{firstItemPage + i}</span>
                <span className={styles.ixMeta}>
                  <span>{it.place ?? "Zona · sin dato"}</span>
                  <span className={styles.ixPrice}>{it.price}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
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

export function TextPage({
  catalog,
  item,
  index,
  page,
  url,
  onOpenGallery,
}: {
  catalog: PublicCatalog;
  item: PublicItem;
  index: number;
  page: number;
  url: PhotoUrl;
  onOpenGallery: (photo: number) => void;
}) {
  return (
    <section className={`${styles.page} ${styles.textPage}`} aria-label={item.title}>
      <div className={styles.textScroll}>
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
      <KeyFacts item={item} />
      {item.description ? (
        <>
          <span className={styles.ornament} aria-hidden="true">
            ✦
          </span>
          <p className={styles.desc}>{item.description}</p>
        </>
      ) : null}
      {item.features.length ? (
        <ul className={styles.features} aria-label="Características">
          {item.features.map((f, i) => (
            <li key={`${i}-${f}`}>{f}</li>
          ))}
        </ul>
      ) : null}
      {item.photos.length > 1 ? (
        <>
          <div className={styles.thumbs}>
            {item.photos.slice(0, 8).map((p, i) => (
              <button key={p.src} type="button" className={styles.thumb} onClick={() => onOpenGallery(i)} aria-label={`Foto ${i + 1} de ${item.photos.length}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url(p.src, 640)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
          <button type="button" className={styles.galleryOpen} onClick={() => onOpenGallery(0)}>
            Ver las {item.photos.length} fotos
          </button>
        </>
      ) : null}
      </div>
      <p className={styles.folio}>— {page} —</p>
    </section>
  );
}

export function ClosingPage({ catalog, expiresAt }: { catalog: PublicCatalog; expiresAt: string }) {
  return (
    <section className={`${styles.page} ${styles.closingPage}`} aria-label="Contacto">
      <p className={styles.kicker}>Contacto</p>
      <h2 className={styles.closingTitle}>Hablemos</h2>
      <p className={styles.lede}>Si alguna de estas viviendas te encaja, organizamos la visita cuando mejor te venga.</p>
      <dl className={styles.contact}>
        {catalog.preparedBy ? (
          <div>
            <dt>Asesor</dt>
            <dd>{catalog.preparedBy}</dd>
          </div>
        ) : null}
        <div>
          <dt>Teléfono</dt>
          <dd>
            <a href={`tel:${catalog.phone.replace(/\s+/g, "")}`}>{catalog.phone}</a>
          </dd>
        </div>
      </dl>
      <p className={styles.note}>Esta selección se actualiza sola cuando hay cambios. Disponible hasta el {shareExpiryLabel(expiresAt)}.</p>
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
