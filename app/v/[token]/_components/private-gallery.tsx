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
// de estirarse hasta pixelarse. Y `object-contain` respeta su proporción.
//
// ── Cómo se toca ────────────────────────────────────────────────────────────
// Todo lo que uno intenta instintivamente funciona: los tercios laterales de
// la lámina pasan foto, el fondo alrededor de la imagen cierra, y los botones
// tienen 44px de alto real (no los 12px de texto que tenían al principio).
// Esc vuelve al mosaico si vienes de él, y cierra desde el mosaico.
//
// Se monta con createPortal en el <body>: así no hereda la opacidad de un
// capítulo cancelado (que va al 60%) ni queda atrapada en su contexto de
// apilamiento. Y mientras está abierta se bloquea el scroll del documento,
// para no aparecer en otro sitio al cerrarla.
//
// El estado vive FUERA de la página (lo iza book-mode / residence-chapter),
// para que una navegación de libro pueda cerrarla ANTES de empezar el giro.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CollectionDictionary } from "@/lib/viewing-collections/i18n";
import { cn } from "@/lib/utils";

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
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const total = photos.length;
  /** Si se abrió directamente en una lámina, Esc cierra en vez de volver. */
  const openedOnPlate = useRef(startIndex !== null);

  useEffect(() => setMounted(true), []);

  const step = useCallback(
    (delta: number) => {
      setIndex((i) => (i === null ? null : (i + delta + total) % total));
    },
    [total],
  );

  /** Esc: desde la lámina se vuelve al mosaico (si se vino de él); desde el
   *  mosaico se cierra. Es lo que hace cualquier visor de fotos. */
  const escape = useCallback(() => {
    if (index !== null && !openedOnPlate.current) setIndex(null);
    else onClose();
  }, [index, onClose]);

  // Teclado propio, en fase de captura: mientras la galería está abierta las
  // flechas mueven fotografías y NUNCA pasan página por detrás. Se tragan
  // también las teclas de scroll, que si no desplazarían el fondo.
  useEffect(() => {
    const SWALLOW = [
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " ",
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        escape();
        return;
      }
      const fwd = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd || e.key === back) {
        e.stopPropagation();
        if (index !== null) {
          e.preventDefault();
          step(e.key === fwd ? 1 : -1);
        }
        return;
      }
      if (SWALLOW.includes(e.key)) e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [escape, step, index, rtl]);

  // Bloqueo del scroll del documento y devolución del foco al cerrar.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    // Compensar la barra de scroll para que el fondo no dé un salto lateral.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      opener?.focus?.();
    };
  }, []);

  // Precarga de las láminas vecinas: pasar foto no debe dejar hueco negro.
  useEffect(() => {
    if (index === null) return;
    for (const i of [index + 1, index - 1]) {
      const url = photos[(i + total) % total];
      if (url) {
        const img = new window.Image();
        img.src = url;
      }
    }
  }, [index, photos, total]);

  // Swipe en la lámina. La galería detiene el gesto, así que no pasa página.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const endTouch = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touch.current || index === null) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    step((rtl ? dx > 0 : dx < 0) ? 1 : -1);
  };

  const chrome =
    "font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/60 transition-colors duration-500 hover:text-cream-50";

  if (!mounted) return null;

  return createPortal(
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
      onTouchEnd={endTouch}
      onTouchCancel={() => {
        touch.current = null;
      }}
    >
      {/* ── Cabecera: el título de la residencia y el cierre ── */}
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 lg:px-8">
        <p className="min-w-0 truncate font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/45">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          className={cn("vc-focus shrink-0 px-2 py-4", chrome)}
        >
          {dict.closeGallery}
        </button>
      </header>

      {index === null ? (
        /* ── MOSAICO ─────────────────────────────────────────────────────── */
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 lg:px-8">
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
                  className="aspect-[4/3] w-full object-cover opacity-90 transition-opacity duration-500 group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── LÁMINA ──────────────────────────────────────────────────────── */
        <>
          <div
            className="relative min-h-0 flex-1"
            /* El fondo alrededor de la imagen cierra, como en cualquier visor.
               Solo si el clic cae en este contenedor, no en sus hijos. */
            onClick={(e) => {
              if (e.target === e.currentTarget) escape();
            }}
          >
            <div className="pointer-events-none flex h-full items-center justify-center px-4 lg:px-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[index]}
                alt={`${title} — ${index + 1}`}
                decoding="async"
                className="vc-plate h-auto max-h-full w-auto max-w-full object-contain"
              />
            </div>

            {/* Tercios laterales: pasar foto tocando, sin apuntar a un icono.
                Invisibles a propósito — el cursor ya lo insinúa. */}
            {total > 1 && (
              <>
                <button
                  type="button"
                  aria-label={dict.previous}
                  onClick={() => step(-1)}
                  className="vc-focus absolute inset-y-0 start-0 w-[28%] cursor-w-resize focus-visible:bg-cream-50/5"
                />
                <button
                  type="button"
                  aria-label={dict.next}
                  onClick={() => step(1)}
                  className="vc-focus absolute inset-y-0 end-0 w-[28%] cursor-e-resize focus-visible:bg-cream-50/5"
                />
              </>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-4 px-2 lg:px-6">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={total < 2}
              aria-label={dict.previous}
              className={cn(
                "vc-focus px-5 py-4 text-[14px] disabled:opacity-20",
                chrome,
              )}
            >
              <span aria-hidden className="rtl:hidden">
                &larr;
              </span>
              <span aria-hidden className="hidden rtl:inline">
                &rarr;
              </span>
            </button>

            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => setIndex(null)}
                className={cn("vc-focus px-2 py-4 vc-tracked-sm", chrome)}
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
              className={cn(
                "vc-focus px-5 py-4 text-[14px] disabled:opacity-20",
                chrome,
              )}
            >
              <span aria-hidden className="rtl:hidden">
                &rarr;
              </span>
              <span aria-hidden className="hidden rtl:inline">
                &larr;
              </span>
            </button>
          </footer>
        </>
      )}
    </div>,
    document.body,
  );
}
