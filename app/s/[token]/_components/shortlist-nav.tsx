"use client";

// ============================================================================
// La navegación entre los tres momentos de la selección.
//
// Decidir y ordenar son dos tareas distintas y se hacen en sitios distintos:
// con diecinueve residencias, mezclarlas obliga a recorrer una página
// interminable. Esta barra es el índice de esa separación.
//
// Discreta a propósito: rótulos y cifras, un filete de progreso y nada más.
// No es una barra de herramientas.
// ============================================================================

import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import { cn } from "@/lib/utils";

export type ShortlistMode = "review" | "priorities" | "summary";

export function ShortlistNav({
  t,
  mode,
  onMode,
  pending,
  total,
  counts,
}: {
  t: ShortlistDictionary;
  mode: ShortlistMode;
  onMode: (m: ShortlistMode) => void;
  pending: number;
  total: number;
  counts: { must: number; maybe: number; no: number };
}) {
  const decided = total - pending;

  return (
    <div className="sticky top-0 z-30 border-b border-ink/8 bg-cream-50/95 backdrop-blur">
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        <nav
          aria-label={t.summaryTitle}
          className="flex items-stretch gap-1 overflow-x-auto"
        >
          <Tab
            active={mode === "review"}
            onClick={() => onMode("review")}
            label={t.modeReview}
            /* «Revisar» cuenta lo que FALTA, no el total: es lo único
               accionable. Sin pendientes, una marca en vez de un cero. */
            value={pending === 0 ? "✓" : String(pending)}
            done={pending === 0}
          />
          <Tab
            active={mode === "priorities"}
            onClick={() => onMode("priorities")}
            label={t.modePriorities}
            value={String(counts.must)}
          />
          <Tab
            active={mode === "summary"}
            onClick={() => onMode("summary")}
            label={t.modeSummary}
          />
        </nav>
      </div>

      {/* Progreso: una línea de pelo, sin porcentajes ni cifras grandes. */}
      <div
        className="h-px w-full bg-ink/10"
        role="progressbar"
        aria-valuenow={decided}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={t.reviewed(decided, total)}
      >
        <div
          className="h-px bg-gold transition-[width] duration-700 ease-out"
          style={{ width: total ? `${(decided / total) * 100}%` : "0%" }}
        />
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
  value,
  done,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  value?: string;
  done?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "vc-focus relative shrink-0 px-3 py-4 font-display text-[9.5px] font-medium uppercase vc-tracked-sm transition-colors duration-300 sm:px-4 sm:text-[10px]",
        active ? "text-ink" : "text-ink/40 hover:text-ink/70",
      )}
    >
      {label}
      {value && (
        <span
          className={cn(
            "ms-1.5 vc-nums",
            done ? "text-gold-dark" : active ? "text-gold-dark" : "text-ink/25",
          )}
        >
          {value}
        </span>
      )}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-2 bottom-0 h-px origin-left bg-ink transition-transform duration-500 ease-out",
          active ? "scale-x-100" : "scale-x-0",
        )}
      />
    </button>
  );
}
