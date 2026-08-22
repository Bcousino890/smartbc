"use client";

import dynamic from "next/dynamic";
import { MapPinned, X } from "lucide-react";
import { useMemo, useState } from "react";
import { decodeZonePolygons, encodeZonePolygons, type ZonePolygon } from "@/lib/zone-polygon";
import { Modal } from "@/components/ui/modal";

// Leaflet toca `window`/`document` al importarse — mismo motivo por el que
// components/admin/clientes/map-polygon-selector.tsx carga su mapa así.
const ZoneDrawMap = dynamic(() => import("./zone-draw-map"), { ssr: false });

interface DrawZoneFilterProps {
  /** Valor crudo del parámetro `zonePoly` de la URL: JSON de ZonePolygon[] o "". */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Filtro de zona dibujada a mano — alternativa al desplegable de
 * distrito/barrio (ZoneFilter) para cuando el área que se quiere cubrir no
 * coincide con ningún distrito/barrio real (o el usuario no lo sabe de
 * memoria). Dibujar una zona y elegir un distrito/barrio son DOS formas
 * alternativas de acotar por ubicación, no combinables: elegir una limpia la
 * otra (ver el comentario en use-particulares-filters.ts). Combinarlas como
 * AND sería confuso en una primera versión — ¿por qué hay menos resultados
 * si añadí una zona nueva? — así que se deja fuera a propósito.
 */
export function DrawZoneFilter({ value, onChange }: DrawZoneFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ZonePolygon[]>([]);

  // Polígonos YA aplicados (los de la URL), no los que se están dibujando
  // ahora mismo dentro del modal.
  const appliedPolygons = useMemo(() => decodeZonePolygons(value), [value]);

  function openModal() {
    setDraft(appliedPolygons);
    setOpen(true);
  }

  function apply() {
    onChange(encodeZonePolygons(draft));
    setOpen(false);
  }

  function clearApplied() {
    onChange("");
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={
          appliedPolygons.length > 0
            ? "flex items-center gap-1.5 rounded-lg border border-gold bg-gold/15 px-3 py-2 text-sm font-medium text-gold-dark"
            : "flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink/70 transition hover:border-gold/40"
        }
      >
        <MapPinned size={14} strokeWidth={1.75} />
        {appliedPolygons.length > 0 ? "Editar zona dibujada" : "Dibujar en el mapa"}
      </button>

      {appliedPolygons.length > 0 && (
        <span className="flex items-center gap-1.5 rounded-lg bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-gold-dark">
          Zonas seleccionadas ({appliedPolygons.length})
          <button
            type="button"
            onClick={clearApplied}
            aria-label="Quitar filtro de zona dibujada"
            className="text-gold-dark/70 transition hover:text-gold-dark"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </span>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Dibujar zona en el mapa"
        subtitle="Usa el icono de polígono (arriba a la izquierda del mapa) para marcar una o varias áreas. Los anuncios se filtran por los que caen dentro."
        size="2xl"
      >
        {open && (
          <div className="flex flex-col gap-4">
            <ZoneDrawMap initialPolygons={draft} onChange={setDraft} />

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink/55">
                {draft.length === 0
                  ? "Ningún polígono dibujado todavía."
                  : `${draft.length} polígono${draft.length !== 1 ? "s" : ""} dibujado${draft.length !== 1 ? "s" : ""}.`}
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-ink/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gold-dark"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
