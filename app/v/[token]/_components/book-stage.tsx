"use client";

// ============================================================================
// Mecánica del PRIVATE BOOK, extraída de book-mode.tsx para que la comparta el
// catálogo (enmienda visual 2026-10-20, DV12) sin duplicarla:
//
//   · useBookTurn  — el giro en curso: mantiene la hoja saliente montada
//     mientras la página nueva se asienta debajo, ~700 ms (portada ~850 ms).
//     Quien navega decide la página actual; aquí solo vive la animación.
//   · BookStage    — las capas del escenario. TODAS comparten la estructura
//     exacta (página + hueco de sombra, aunque sea null) y se renderizan como
//     ARRAY con key por índice de página: React reconcilia por key y posición,
//     así que una página que sobrevive al cambio de estado (girando ↔ reposo)
//     conserva su nodo DOM — la fotografía no se remonta ni repinta al
//     aterrizar la hoja. Solo cambian las clases.
//   · BookNav      — la navegación editorial: anterior · índice · «06 / 09» ·
//     siguiente.
//
// El giro es un giro real sobre el lomo (rotateY + perspectiva + sombra de
// lomo, ver globals.css). prefers-reduced-motion lo degrada a un fundido.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BookTurn = { from: number; dir: 1 | -1; cover: boolean } | null;

export const BOOK_TURN_MS = 720;
export const BOOK_COVER_TURN_MS = 870;

/**
 * Estado del giro. `begin(from, to, cover)` arranca la animación y la retira
 * sola al terminar; `opened` dice si ya hubo un giro (el fundido de entrada
 * solo aplica al primer montaje: tras el primer giro la página aterrizada no
 * debe volver a fundirse).
 */
export function useBookTurn(ms: { page: number; cover: number } = { page: BOOK_TURN_MS, cover: BOOK_COVER_TURN_MS }) {
  const [turn, setTurn] = useState<BookTurn>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);
  const { page: pageMs, cover: coverMs } = ms;

  const begin = useCallback(
    (from: number, to: number, cover: boolean) => {
      opened.current = true;
      const dir: 1 | -1 = to > from ? 1 : -1;
      setTurn({ from, dir, cover });
      if (turnTimer.current) clearTimeout(turnTimer.current);
      turnTimer.current = setTimeout(() => setTurn(null), cover ? coverMs : pageMs);
    },
    [pageMs, coverMs],
  );

  useEffect(
    () => () => {
      if (turnTimer.current) clearTimeout(turnTimer.current);
    },
    [],
  );

  return { turn, begin, opened };
}

export function BookStage({
  count,
  current,
  turn,
  renderPage,
  sheetBg,
  rtl = false,
  opened,
  className,
}: {
  count: number;
  current: number;
  turn: BookTurn;
  /** Contenido de la página `idx`. */
  renderPage: (idx: number) => ReactNode;
  /** Fondo de la hoja saliente: debe ser opaco (una hoja no es transparente),
   *  del color de la página que se lleva. */
  sheetBg: (idx: number) => string;
  rtl?: boolean;
  /** `true` tras el primer giro: entonces no hay fundido de entrada. */
  opened: boolean;
  className?: string;
}) {
  const rtlClass = rtl ? "vc-rtl" : "";
  const layer = (idx: number, cls: string, opts?: { shade?: "turn" | "under"; hidden?: boolean }) => (
    <div key={`page-${idx}`} aria-hidden={opts?.hidden || undefined} className={cn("absolute inset-0", cls)}>
      {idx >= 0 && idx < count ? renderPage(idx) : null}
      {opts?.shade ? <div className={cn(opts.shade === "turn" ? "vc-turn-shade" : "vc-under-shade", rtlClass)} aria-hidden /> : null}
    </div>
  );

  // El orden del array es el orden de apilado (la última queda encima).
  return (
    <div className={cn("vc-book-stage relative min-h-0 flex-1", className)}>
      {turn
        ? turn.dir === 1
          ? [
              // ── AVANZAR: la nueva página se asienta debajo; la hoja que
              //    dejamos (mismo nodo que tenía en reposo) gira encima.
              layer(current, cn("vc-sheet-settle", rtlClass), { shade: "turn" }),
              layer(turn.from, cn("pointer-events-none vc-sheet-edge", sheetBg(turn.from), turn.cover ? "vc-sheet-out-cover" : "vc-sheet-out-next", rtlClass), {
                hidden: true,
              }),
            ]
          : [
              // ── RETROCEDER: la página que dejamos (mismo nodo) queda
              //    quieta debajo; la hoja anterior vuelve a posarse encima.
              layer(turn.from, "pointer-events-none", { shade: "under", hidden: true }),
              layer(current, cn("vc-sheet-in-prev vc-sheet-edge", sheetBg(current), rtlClass)),
            ]
        : [layer(current, !opened ? "vc-page-in" : "")]}
    </div>
  );
}

export type BookNavLabels = {
  previous: string;
  next: string;
  contents: string;
  /** «de» en «3 de 9» (para lectores de pantalla). */
  pageOf: string;
};

/** Navegación editorial. Oculta en la portada: allí manda «Comenzar». */
export function BookNav({
  current,
  total,
  isDark,
  labels,
  onPrev,
  onNext,
  onContents,
  contentsActive,
  arrows = true,
  extra,
  className,
  ariaLabel = "Book navigation",
}: {
  current: number;
  total: number;
  isDark: boolean;
  labels: BookNavLabels;
  onPrev: () => void;
  onNext: () => void;
  onContents: () => void;
  /** El índice es la página activa (se marca con más presencia). */
  contentsActive: boolean;
  /** Sin flechas (modo desplazamiento del catálogo). */
  arrows?: boolean;
  /** Controles sobrios adicionales, tras el contador (el catálogo). */
  extra?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const arrowClass =
    "vc-focus group flex items-center gap-2 px-2 py-1.5 font-display text-[10px] font-medium uppercase vc-tracked opacity-60 transition-opacity duration-300 hover:opacity-100 disabled:opacity-20 sm:gap-3";
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex shrink-0 items-center justify-between border-t px-4 py-3 sm:px-8 sm:py-3.5 lg:px-12",
        isDark ? "border-cream-50/15 text-cream-50" : "border-ink/10 text-ink",
        className,
      )}
    >
      {arrows ? (
        <button type="button" onClick={onPrev} disabled={current === 0} className={arrowClass}>
          <span aria-hidden className="inline-block transition-transform duration-300 group-hover:-translate-x-0.5 rtl:rotate-180">
            &larr;
          </span>
          <span className="hidden sm:inline">{labels.previous}</span>
        </button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-4 sm:gap-6">
        <button
          type="button"
          onClick={onContents}
          className={cn(
            "vc-focus font-display text-[10px] font-medium uppercase vc-tracked-sm transition-opacity duration-300",
            contentsActive ? "opacity-90" : "opacity-45 hover:opacity-90",
          )}
        >
          {labels.contents}
        </button>
        <span className="font-display text-[10.5px] font-medium vc-nums opacity-70" aria-label={`${current + 1} ${labels.pageOf} ${total}`}>
          {String(current + 1).padStart(2, "0")}
          <span className="mx-1.5 opacity-50">/</span>
          {String(total).padStart(2, "0")}
        </span>
        {extra}
      </div>

      {arrows ? (
        <button type="button" onClick={onNext} disabled={current === total - 1} className={arrowClass}>
          <span className="hidden sm:inline">{labels.next}</span>
          <span aria-hidden className="inline-block transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180">
            &rarr;
          </span>
        </button>
      ) : (
        <span />
      )}
    </nav>
  );
}
