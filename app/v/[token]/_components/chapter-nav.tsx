"use client";

// ============================================================================
// Navegación.
//
// Dos formas del mismo dato según el espacio disponible:
//   · desktop → raíl vertical de números en el margen derecho, al modo de las
//     guardas de un libro. Solo aparece una vez pasada la portada.
//   · móvil   → barra de progreso de 2px y un marcador "01 / 06" discreto.
//
// Nada de barras de aplicación: la tecnología debe ser invisible.
// ============================================================================

import type { PublicViewingStop } from "@/lib/viewing-collections/public-contract";
import { cn } from "@/lib/utils";

export function ChapterRail({
  stops,
  activeOrder,
  visible,
  onSelect,
  onOverview,
}: {
  stops: PublicViewingStop[];
  activeOrder: number | null;
  visible: boolean;
  onSelect: (order: number) => void;
  onOverview: () => void;
}) {
  if (stops.length === 0) return null;

  return (
    <nav
      aria-label="Residencias"
      className={cn(
        "pointer-events-none fixed right-7 top-1/2 z-30 hidden -translate-y-1/2 mix-blend-difference transition-opacity duration-700 lg:block",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <ul className={cn("space-y-4", visible && "pointer-events-auto")}>
        <li>
          <button
            type="button"
            onClick={onOverview}
            className="vc-focus group relative flex items-center justify-end gap-3"
            aria-label="Volver a la jornada"
          >
            <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap font-display text-[9px] font-medium uppercase vc-tracked-sm text-cream-50/0 transition-colors duration-500 group-hover:text-cream-50/70">
              Jornada
            </span>
            <span
              aria-hidden
              className="h-px w-4 bg-cream-50/45 transition-all duration-500 group-hover:w-7 group-hover:bg-cream-50/85"
            />
          </button>
        </li>

        {stops.map((stop) => {
          const active = activeOrder === stop.order;
          return (
            <li key={stop.order}>
              <button
                type="button"
                onClick={() => onSelect(stop.order)}
                aria-current={active ? "true" : undefined}
                className="vc-focus group relative flex items-center justify-end gap-3"
              >
                {/* Fuera del flujo: si ocupara ancho, cada título movería su
                    número a una posición distinta y el raíl saldría en
                    diagonal en vez de en columna. */}
                <span
                  className={cn(
                    "pointer-events-none absolute right-full mr-3 max-w-[13rem] truncate whitespace-nowrap font-display text-[9px] font-medium uppercase vc-tracked-sm transition-colors duration-500",
                    active
                      ? "text-cream-50/75"
                      : "text-cream-50/0 group-hover:text-cream-50/65",
                  )}
                >
                  {stop.title}
                </span>
                <span
                  className={cn(
                    "font-display text-[10px] font-medium vc-nums transition-colors duration-500",
                    active
                      ? "text-cream-50"
                      : "text-cream-50/40 group-hover:text-cream-50/75",
                  )}
                >
                  {String(stop.order).padStart(2, "0")}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-px transition-all duration-500",
                    active
                      ? "w-7 bg-cream-50"
                      : "w-3 bg-cream-50/35 group-hover:w-5 group-hover:bg-cream-50/70",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ProgressBar({
  progress,
  activeOrder,
  total,
  visible,
}: {
  progress: number;
  activeOrder: number | null;
  total: number;
  visible: boolean;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-30 transition-opacity duration-700 lg:hidden",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-center justify-between bg-cream-50/92 px-5 py-2.5 backdrop-blur-sm">
        <span className="font-display text-[9px] font-medium uppercase vc-tracked text-ink/45">
          Private Viewing Collection
        </span>
        {activeOrder != null && (
          <span className="font-display text-[10px] font-medium vc-nums text-ink/55">
            {String(activeOrder).padStart(2, "0")}
            <span className="mx-1 text-ink/25">/</span>
            {String(total).padStart(2, "0")}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label="Progreso de lectura"
        className="h-px w-full bg-ink/10"
      >
        <div
          className="h-full bg-gold transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
    </div>
  );
}
