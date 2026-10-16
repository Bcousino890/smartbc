"use client";

import { useEffect, useRef } from "react";
import type { PublicItem } from "@/lib/catalogs/public-contract";
import { photoProps, type PhotoUrl } from "./pages";
import { ReaderImage } from "./reader-image";
import styles from "./reader.module.css";

// Galería a pantalla completa (BCP-01 T8). Teclado (← → Esc) lo gestiona el
// lector; aquí, botones y deslizar. Las actualizaciones en vivo se aplican al
// momento con la galería abierta (E4).

export function Gallery({
  item,
  photo,
  url,
  onStep,
  onClose,
  notice,
  onDismiss,
}: {
  item: PublicItem;
  photo: number;
  url: PhotoUrl;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
  /** Aviso del lector (p. ej. «Esa foto ya no forma parte del catálogo»): la
   *  galería tapa el aviso de la página, así que lo repite aquí (E3). */
  notice?: string | null;
  onDismiss?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const p = item.photos[photo];

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (!p) return null;
  const many = item.photos.length > 1;
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={`Fotos de ${item.title}`} data-testid="gallery">
      <div className={styles.lbTop}>
        <span className={styles.lbTitle}>{item.title}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar la galería">
          ✕
        </button>
      </div>
      <div
        className={styles.lbStage}
        onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s || !many) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) onStep(dx < 0 ? 1 : -1);
        }}
      >
        <ReaderImage key={p.src} variant="gallery" {...photoProps(p, url, "100vw")} alt={`Foto ${photo + 1} de ${item.photos.length}`} />
        {notice ? (
          <div className={styles.lbNotice} role="status" data-testid="gallery-notice">
            <span>{notice}</span>
            {onDismiss ? (
              <button type="button" onClick={onDismiss} aria-label="Cerrar aviso">
                ×
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className={styles.lbBottom}>
        <button type="button" onClick={() => onStep(-1)} disabled={!many} aria-label="Foto anterior">
          ←
        </button>
        <span aria-live="polite">
          {photo + 1} / {item.photos.length}
        </span>
        <button type="button" onClick={() => onStep(1)} disabled={!many} aria-label="Foto siguiente">
          →
        </button>
      </div>
    </div>
  );
}
