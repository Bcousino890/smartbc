import { catalogFontVariables } from "@/lib/catalogs/fonts";
import styles from "./catalog-cover.module.css";

// Portada Boutique de un catálogo (BCP-01 T5, D17). Sirve de miniatura en la
// estantería de la HOME y, en la fase 2, de primera página del lector. Solo
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

export function CatalogCover({
  data,
  fontSizePx = 16,
  className,
}: {
  data: CatalogCoverData;
  /** Tamaño base: 16 en una página, ~4 en una miniatura. */
  fontSizePx?: number;
  className?: string;
}) {
  const left = ["Selección privada", data.numberLabel].filter(Boolean).join(" · ");
  return (
    <div
      className={`${catalogFontVariables} ${styles.cover}${className ? ` ${className}` : ""}`}
      style={{ fontSize: `${fontSizePx}px` }}
    >
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
  );
}
