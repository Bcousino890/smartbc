import styles from "./catalog-cover.module.css";

// Portada del catálogo (enmienda visual 2026-10-20, DV9): la portada de la
// publicación del itinerario adaptada al catálogo. Sirve de miniatura en la
// estantería de la HOME, de vista previa en Diseño y de primera página del
// lector. Lleva el logo oficial (D18) en blanco, que se oculta en las
// miniaturas pequeñas. Solo recibe datos ya públicos (título, introducción,
// foto de portada por el proxy /p/[slug]/[idx], nombre de quien la prepara).
// Sin cliente, sin fecha: es una selección, no un itinerario.

export interface CatalogCoverData {
  title: string;
  subtitle?: string | null;
  /** «nº 03» */
  numberLabel?: string | null;
  /** «Otoño 2026» */
  edition: string;
  /** URL de la foto de portada (proxy neutro) o null. */
  photoUrl?: string | null;
  /** PR7a · `srcset` acotado al ancho real de la foto (solo el lector; la
   *  miniatura de la HOME y la vista previa siguen con la variante única). */
  photoSrcSet?: string | null;
  /** PR7a · `sizes` del `srcset` («100vw» en el lector: la foto va a sangre). */
  photoSizes?: string | null;
  preparedBy?: string | null;
  /** «Cuatro viviendas» (o null si no se sabe). */
  countLabel?: string | null;
}

const ES_WORDS = ["", "Una", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez", "Once", "Doce"];

/** «Cuatro viviendas», «Una vivienda», «24 viviendas». */
export function countLabel(n: number): string {
  return `${ES_WORDS[n] ?? n} ${n === 1 ? "vivienda" : "viviendas"}`;
}

/** La portada escala con el ANCHO de su contenedor (unidades cqi): la misma
 *  pieza sirve de miniatura de 150 px o de página de 600 px sin desajustes. */
export function CatalogCover({
  data,
  className,
  readable = false,
  onBegin,
}: {
  data: CatalogCoverData;
  className?: string;
  /** En el lector: textos auxiliares de 12 px mínimo, foto prioritaria y el
   *  movimiento de la referencia (la miniatura de la HOME conserva su escala). */
  readable?: boolean;
  /** «Comenzar» (solo en el lector). */
  onBegin?: () => void;
}) {
  const kicker = ["Selección privada", data.numberLabel].filter(Boolean).join(" · ");
  return (
    <div className={`${styles.frame}${readable ? ` ${styles.readable}` : ""}${className ? ` ${className}` : ""}`}>
      <div className={styles.cover}>
        {data.photoUrl ? (
          <div className={styles.photo} aria-hidden="true">
            <div className={readable ? "vc-kenburns h-full w-full" : "h-full w-full"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.photoUrl}
                srcSet={data.photoSrcSet ?? undefined}
                sizes={data.photoSrcSet ? (data.photoSizes ?? undefined) : undefined}
                alt=""
                loading={readable ? "eager" : "lazy"}
                fetchPriority={readable ? "high" : undefined}
                decoding="async"
              />
            </div>
            <div className={styles.veil} />
            <div className={styles.veil2} />
          </div>
        ) : null}

        <div className={`${styles.brand}${readable ? " vc-cover-in" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/logo.png" alt="Benjamín Cousiño Propiedades" width={3282} height={519} decoding="async" />
          <span className={styles.tagline}>Private Client Services</span>
        </div>

        <div className={styles.body}>
          <p className={`${styles.kicker}${readable ? " vc-cover-in vc-cover-in-d1" : ""}`}>{kicker}</p>
          {/* En un div propio: como hijo directo de la columna flexible, el
              -webkit-box del recorte a cuatro líneas se «bloquificaba» y el
              título quedaba con cero líneas (comprobado en Chromium). */}
          <div className={`w-full${readable ? " vc-cover-in vc-cover-in-d1" : ""}`}>
            <h2 className={styles.title}>{data.title}</h2>
          </div>
          <span className={`${styles.ornament}${readable ? " vc-cover-in vc-cover-in-d2" : ""}`} aria-hidden="true" />
          {data.preparedBy ? (
            <>
              <p className={`${styles.preparedLabel}${readable ? " vc-cover-in vc-cover-in-d2" : ""}`}>Preparada por</p>
              <p className={`${styles.preparedBy}${readable ? " vc-cover-in vc-cover-in-d2" : ""}`}>{data.preparedBy}</p>
            </>
          ) : null}
          <div className={`${styles.meta}${readable ? " vc-cover-in vc-cover-in-d3" : ""}`}>
            <p className={styles.edition}>{data.edition}</p>
            {data.countLabel ? <p className={styles.count}>{data.countLabel}</p> : null}
          </div>
          {!readable && data.subtitle ? <p className={styles.subtitle}>{data.subtitle}</p> : null}
          {!readable && !data.photoUrl ? <p className={styles.noPhoto}>Sin foto de portada</p> : null}
        </div>

        {onBegin ? (
          <button type="button" onClick={onBegin} className={`${styles.begin}${readable ? " vc-cover-in vc-cover-in-d4" : ""}`}>
            <span className={styles.beginLabel}>Comenzar</span>
            <span className={styles.beginLine} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
