"use client";

// Piezas compartidas por los dos bloques de matching de la ficha (catálogo y
// portales) cuando el cliente tiene encargos múltiples (solo España): para qué
// encargo se está buscando, el vacío de un encargo en pausa o cerrado y la
// marca del elemento que llega destacado desde un aviso de la campanita.

import { PauseCircle, Sparkles } from "lucide-react";
import type { EncargoStatus } from "@/lib/encargos/model";

/** Lo que los bloques necesitan saber del encargo elegido. */
export type MatchingEncargo = {
  id: string;
  label: string;
  status: EncargoStatus;
  isPrimary: boolean;
};

/** Clases del elemento destacado: anillo visible (no solo color) + la etiqueta «Nuevo». */
export const HIGHLIGHT_RING = "ring-2 ring-gold ring-offset-2 ring-offset-white";

export function MatchingFor({ encargo }: { encargo: MatchingEncargo }) {
  return (
    <p className="mt-1 text-xs text-ink/55">
      Para el encargo <strong className="font-semibold text-ink">«{encargo.label}»</strong>
      {encargo.isPrimary ? " (principal)" : ""}
    </p>
  );
}

/** Un encargo en pausa o cerrado no hace matching: se dice en vez de enseñar una lista vacía. */
export function EncargoInactive({ encargo }: { encargo: MatchingEncargo }) {
  const paused = encargo.status === "paused";
  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-ink/20 bg-white/50 px-4 py-5 text-xs text-ink/65">
      <PauseCircle size={15} aria-hidden className="mt-px shrink-0 text-ink/45" />
      <p>
        <strong className="font-semibold text-ink">
          Encargo {paused ? "en pausa" : "cerrado"}: no hace matching.
        </strong>{" "}
        {paused
          ? "Reactívalo desde la sección Encargos del Resumen para volver a buscar."
          : "Si el cliente vuelve a buscar, reactívalo desde la sección Encargos del Resumen."}
      </p>
    </div>
  );
}

/**
 * Etiqueta del elemento que llega del aviso. Texto, no solo color. Dice «Del aviso» y no «Nuevo»: un
 * aviso del pase inicial trae stock que ya existía, no algo recién publicado.
 */
export function NoticeBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-cream-50">
      <Sparkles size={11} aria-hidden />
      Del aviso
    </span>
  );
}
