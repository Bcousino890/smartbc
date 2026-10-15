"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MapPinned, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { MAX_POLYGONS } from "@/lib/clients/brief";
import type { ZonePolygon } from "@/lib/zone-polygon";

// Leaflet toca `window` al importarse: solo en el navegador.
const ZoneDrawMap = dynamic(() => import("@/components/admin/particulares/zone-draw-map"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-lg bg-ink/5" />,
});

/**
 * "Delimitar en el mapa": el agente dibuja una o varias áreas y el match solo
 * sugiere propiedades que caen dentro. Lo dibujado manda sobre los nombres de
 * zona (una propiedad sin coordenadas sí se compara por nombre).
 */
export function AreaPicker({
  value,
  onChange,
  disabled,
}: {
  value: ZonePolygon[];
  onChange: (polygons: ZonePolygon[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ZonePolygon[]>([]);

  function openModal() {
    setDraft(value);
    setOpen(true);
  }

  function apply() {
    onChange(draft.slice(0, MAX_POLYGONS));
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={openModal}
          className={
            value.length > 0
              ? "flex items-center gap-1.5 rounded-lg border border-gold bg-gold/15 px-3 py-2 text-sm font-medium text-gold-dark"
              : "flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink/70 transition hover:border-gold/40"
          }
        >
          <MapPinned size={14} strokeWidth={1.75} />
          {value.length > 0 ? "Editar zona en el mapa" : "Delimitar en el mapa"}
        </button>
        {value.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-lg bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-gold-dark">
            {value.length} {value.length === 1 ? "área dibujada" : "áreas dibujadas"}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([])}
              aria-label="Quitar las áreas dibujadas"
              className="text-gold-dark/70 transition hover:text-gold-dark"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        )}
      </div>
      <p className="text-xs text-ink/55">
        {value.length > 0
          ? "Solo se sugieren propiedades dentro de lo dibujado (las que no tienen ubicación se comparan por nombre de zona)."
          : "Opcional: dibuja el área exacta que le interesa, más precisa que un barrio."}
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delimitar la búsqueda"
        subtitle="Usa el icono de polígono (arriba a la izquierda del mapa) para marcar una o varias áreas. Se sugerirán las propiedades que caen dentro."
        size="2xl"
      >
        {open && (
          <div className="flex flex-col gap-4">
            <ZoneDrawMap initialPolygons={draft} onChange={setDraft} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink/55">
                {draft.length === 0
                  ? "Ningún área dibujada todavía."
                  : `${draft.length} ${draft.length === 1 ? "área dibujada" : "áreas dibujadas"}.`}
                {draft.length > MAX_POLYGONS && ` Se guardarán las ${MAX_POLYGONS} primeras.`}
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
    </div>
  );
}
