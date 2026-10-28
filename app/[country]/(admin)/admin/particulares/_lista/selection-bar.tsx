"use client";

import { Loader2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./controls";

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/**
 * Barra flotante al elegir anuncios en la lista: captarlos para el cliente
 * elegido (entran en su lista, se crea su ficha y pasan a su book) o, si aún no
 * hay cliente, avisar de que hay que elegirlo arriba.
 */
export function SelectionBar({
  count,
  clientName,
  capturing,
  allOnPageSelected,
  onCapture,
  onClear,
  onTogglePage,
}: {
  count: number;
  clientName: string | null;
  capturing: boolean;
  allOnPageSelected: boolean;
  onCapture: () => void;
  onClear: () => void;
  onTogglePage: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3" role="region" aria-label="Anuncios seleccionados">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-ink/15 bg-white px-4 py-3 shadow-[0_18px_40px_-12px_rgba(40,28,10,0.45)]">
        <p className="text-sm font-semibold text-ink">
          {count} {count === 1 ? "anuncio seleccionado" : "anuncios seleccionados"}
        </p>
        <button type="button" onClick={onTogglePage} className={cn("text-sm text-ink/70 underline hover:text-ink", FOCUS_RING)}>
          {allOnPageSelected ? "Quitar los de esta página" : "Elegir toda la página"}
        </button>
        {clientName ? (
          <button
            type="button"
            onClick={onCapture}
            disabled={capturing}
            title="Entran en su lista, se crea la ficha de cada piso y pasan a su book"
            className={cn("inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-cream-50 transition hover:bg-ink/90 disabled:opacity-60", FOCUS_RING)}
          >
            {capturing ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <UserPlus size={15} aria-hidden />}
            Captar para {firstName(clientName)} y añadir a su book
          </button>
        ) : (
          <p className="text-sm text-amber-800">Elige un cliente arriba para captarlos para su encargo.</p>
        )}
        <button type="button" onClick={onClear} aria-label="Quitar la selección" className={cn("rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink", FOCUS_RING)}>
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
