import { catalogFontVariables } from "@/lib/catalogs/fonts";
import styles from "./catalog-cover.module.css";

// Portada Boutique de un catálogo (BCP-01 T5, D17). Sirve de miniatura en la
// estantería de la HOME y de primera página del lector. Lleva el logo oficial
// (D18), que se oculta en las miniaturas pequeñas. Solo
// recibe datos ya públicos (título, introducción, foto de portada por el
// proxy /p/[slug]/[idx], nombre de quien la prepara).

export interface CatalogCoverData {
  title: string;
  subtitle?: string | null;
  /** «nº 03» */
  numberLabel?: string | null;
  /** «Otoño 2026» */
  edition: string;
  /** URL de la foto de portada (proxy neutro) o null. */
  photoUrl?: string | null;
  preparedBy?: string | null;
}

/** La portada escala con el ANCHO de su contenedor (unidades cqi): la misma
 *  pieza sirve de miniatura de 150 px o de página de 600 px sin desajustes. */
export function CatalogCover({
  data,
  className,
  readable = false,
}: {
  data: CatalogCoverData;
  className?: string;
  /** E1 · En el lector, los textos auxiliares no bajan de 12 px (la miniatura
   *  de la HOME conserva su escala). */
  readable?: boolean;
}) {
  const left = ["Selección privada", data.numberLabel].filter(Boolean).join(" · ");
  return (
    <div className={`${styles.frame}${readable ? ` ${styles.readable}` : ""}${className ? ` ${className}` : ""}`}>
    <div className={`${catalogFontVariables} ${styles.cover}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Benjamín Cousiño Propiedades" width={3282} height={519} decoding="async" />
      <div className={styles.kickers}>
        <span>{left}</span>
        <span>{data.edition}</span>
      </div>
      <div className={styles.arch}>
        {data.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.photoUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.noPhoto}>Sin foto de portada</span>
        )}
      </div>
      <h2 className={styles.title}>{data.title}</h2>
      {data.subtitle ? <p className={styles.subtitle}>{data.subtitle}</p> : null}
      <span className={styles.ornament} aria-hidden="true">
        ✦
      </span>
      {data.preparedBy ? (
        <p className={styles.sign}>
          Preparada por <strong>{data.preparedBy}</strong>
        </p>
      ) : null}
    </div>
    </div>
  );
}
