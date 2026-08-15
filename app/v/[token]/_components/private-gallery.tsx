"use client";

// ============================================================================
// PRIVATE GALLERY MODE
//
// La galería es parte de la misma publicación, no un modal genérico: fondo
// tinta opaco, sin fotografía de fondo recortada, y la imagen como única
// protagonista.
//
// Dos vistas:
//   · MOSAICO  — la cuadrícula de miniaturas (recorte razonable, es un índice)
//   · LÁMINA   — una fotografía sola, entera, sobre tinta
//
// En la lámina la imagen NUNCA se amplía: `w-auto h-auto` + `max-h/max-w`
// significa que una foto pequeña se ve a su tamaño natural, centrada, en vez
// de estirarse hasta pixelarse. Y `object-contain` respeta su proporción: no
// se recorta ni se deforma.
//
// El estado vive FUERA de la página (lo iza book-mode / residence-chapter),
// para que una navegación de libro pueda cerrarla ANTES de empezar el giro.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionDictionary } from "@/lib/viewing-collections/i18n";

export function PrivateGallery({
  title,
  photos,
  dict,
  rtl = false,
  /** Índice inicial: null abre en mosaico; un número abre esa lámina. */
  startIndex = null,
  onClose,
}: {
  title: string;
  photos: string[];
  dict: CollectionDictionary;
  rtl?: boolean;
  startIndex?: number | null;
  onClose: () => void;
}) {
  const [index, setIndex] = useState<number | null>(startIndex);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const total = photos.length;

  const step = useCallback(
    (delta: number) => {
      setIndex((i) => (i === null ? null : (i + delta + total) % total));
    },
    [total],
  );

  // Teclado propio. Se captura en la fase de captura y se detiene la
  // propagación: mientras la galería está abierta, las flechas mueven
  // fotografías y NUNCA pasan página por detrás.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      const fwd = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd || e.key === back) {
        e.stopPropagation();
        e.preventDefault();
        if (index !== null) step(e.key === fwd ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, step, index, rtl]);

  // El foco entra en la galería para que el lector de pantalla la anuncie y
  // para que Tab no se escape a la página de debajo antes de tiempo.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // Swipe en la lámina. La galería está por encima del libro y detiene el
  // gesto, así que deslizar aquí no pasa página.
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      dir={rtl ? "rtl" : "ltr"}
      className="vc-gallery fixed inset-0 z-[60] flex flex-col bg-ink outline-none"
      onTouchStart={(e) => {
        e.stopPropagation();
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        if (!touch.current || index === null) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        step((rtl ? dx > 0 : dx < 0) ? 1 : -1);
      }}
    >
      {/* ── Cabecera: el título de la residencia y el cierre. Nada más. ── */}
      <header className="flex shrink-0 items-center justify-between gap-6 px-6 py-4 lg:px-10">
        <p className="min-w-0 truncate font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/45">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="vc-focus shrink-0 font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/70 transition-colors duration-500 hover:text-cream-50"
        >
          {dict.closeGallery}
        </button>
      </header>

      {index === null ? (
        /* ── MOSAICO ─────────────────────────────────────────────────────── */
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 lg:px-10">
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
            {photos.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                className="vc-focus group relative block overflow-hidden bg-cream-50/5"
                aria-label={`${title} — ${i + 1} / ${total}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${title} — ${i + 1}`}
                  loading={i < 6 ? "eager" : "lazy"}
                  decoding="async"
                  className="aspect-[4/3] w-full object-cover opacity-90 transition-all duration-700 ease-out group-hover:scale-[1.02] group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── LÁMINA ──────────────────────────────────────────────────────── */
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 lg:px-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={photos[index]}
              src={photos[index]}
              alt={`${title} — ${index + 1}`}
              decoding="async"
              className="vc-plate h-auto max-h-full w-auto max-w-full object-contain"
            />
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-6 px-6 py-5 lg:px-10">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={total < 2}
              aria-label={dict.previous}
              className="vc-focus group flex items-center gap-3 font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/55 transition-colors duration-500 hover:text-cream-50 disabled:opacity-20"
            >
              <span aria-hidden className="rtl:rotate-180">
                &larr;
              </span>
            </button>

            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setIndex(null)}
                className="vc-focus font-display text-[10px] font-medium uppercase vc-tracked-sm text-cream-50/45 transition-colors duration-500 hover:text-cream-50"
              >
                {dict.galleryAll}
              </button>
              <span
                dir="ltr"
                className="font-display text-[10.5px] font-medium vc-nums text-cream-50/60"
              >
                {String(index + 1).padStart(2, "0")}
                <span className="mx-1.5 opacity-50">/</span>
                {String(total).padStart(2, "0")}
              </span>
            </div>

            <button
              type="button"
              onClick={() => step(1)}
              disabled={total < 2}
              aria-label={dict.next}
              className="vc-focus group flex items-center gap-3 font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/55 transition-colors duration-500 hover:text-cream-50 disabled:opacity-20"
            >
              <span aria-hidden className="rtl:rotate-180">
                &rarr;
              </span>
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
