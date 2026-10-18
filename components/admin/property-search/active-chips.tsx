"use client";

import { X } from "lucide-react";

export type FilterChip = { key: string; label: string; clear: () => void };

// Chips de filtros activos (cada uno se quita con su ×) y «Limpiar todo»
// (BCP-01, P1). No pinta nada si no hay chips.
export function ActiveChips({
  chips,
  onClearAll,
}: {
  chips: FilterChip[];
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          title="Quitar este filtro"
          className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-gold-dark transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
        >
          <span>{c.label}</span>
          <X size={12} strokeWidth={2} />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs font-medium text-ink/55 underline-offset-2 transition hover:text-rose-700 hover:underline"
      >
        Limpiar todo
      </button>
    </div>
  );
}
