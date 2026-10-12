"use client";

import { ChevronDown, Images } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { type PhotoSource, richerSource } from "./photo-sources";

/**
 * «Seleccionar fuente de fotos»: un `<select>` nativo (teclado, lector de
 * pantalla y selector táctil del móvil gratis). Cada opción lleva su nº de fotos.
 */
export function PhotoSourcePicker({
  sources,
  activeId,
  onChange,
}: {
  sources: PhotoSource[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const selectId = useId();
  const hintId = useId();
  const richer = richerSource(sources, activeId);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-ink/10 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor={selectId} className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink">
        <Images size={16} strokeWidth={1.75} className="text-gold-dark" aria-hidden="true" />
        Seleccionar fuente de fotos:
      </label>
      <div className="relative min-w-0 flex-1">
        <select
          id={selectId}
          value={activeId}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={richer ? hintId : undefined}
          className={cn(
            "min-h-10 w-full appearance-none truncate rounded-lg border border-ink/15 bg-cream-50 py-2 pl-3 pr-9 text-sm font-medium text-ink",
            "hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold",
          )}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} ({s.photos.length})
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/55" />
      </div>
      {richer && (
        <p id={hintId} className="text-xs text-ink/60 sm:max-w-[11rem]">
          {richer.portalLabel} tiene más fotos ({richer.photos.length}).
        </p>
      )}
    </div>
  );
}
