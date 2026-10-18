"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogItemView } from "@/lib/catalogs/types";

// Conversión de un catálogo automático antiguo en selección fija (BCP-01 P4,
// I-8, I-9). No es un cambio de modo: es una conversión de una sola vez, con
// vista previa de la lista y su orden, y revalidación al confirmar. Si la
// lista cambió entre medias, el servidor no convierte y aquí se recarga la
// vista previa para volver a revisarla.

type Res = ActionResult<{ version: number; fingerprint?: string | null; publicChange?: boolean }>;

export interface ConversionPreviewView {
  version: number;
  ids: string[];
  items: CatalogItemView[];
  droppedInclusions: CatalogItemView[];
  archivedManual: CatalogItemView[];
  adjustments: number;
}

export interface ConversionActions {
  preview: (i: { catalogId: string }) => Promise<ActionResult<{ preview: ConversionPreviewView }>>;
  convert: (i: { catalogId: string; expectedVersion: number; expectedIds: string[]; skipNotify?: boolean }) => Promise<Res>;
}

function List({ items, empty }: { items: CatalogItemView[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-ink/50">{empty}</p>;
  return (
    <ol className="max-h-64 space-y-1 overflow-auto text-xs text-ink/75">
      {items.map((it, i) => (
        <li key={it.propertyId} className="flex min-w-0 justify-between gap-2">
          <span className="min-w-0 truncate">
            <span className="mr-1 text-ink/45">{i + 1}.</span>
            {it.bcReference ? <span className="mr-1 text-ink/45">{it.bcReference}</span> : null}
            {it.title}
          </span>
          <span className="shrink-0 text-ink/55">{it.price}</span>
        </li>
      ))}
    </ol>
  );
}

export function ConversionPanel({
  catalogId,
  actions,
  run,
  pending,
  archived,
}: {
  catalogId: string;
  actions: ConversionActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ConversionPreviewView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  async function load(after = false) {
    setLoading(true);
    setError(null);
    const r = await actions.preview({ catalogId });
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPreview(r.preview);
    setRefreshed(after);
  }

  function confirm() {
    if (!preview) return;
    const p = preview;
    run(
      () => actions.convert({ catalogId, expectedVersion: p.version, expectedIds: p.ids }),
      "Catálogo convertido en selección fija: el cliente sigue viendo las mismas viviendas, en el mismo orden.",
      () => setOpen(false),
      () => void load(true),
      "conversión",
    );
  }

  return (
    <div className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2" data-testid="legacy-auto">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-sm text-ink/80">
          <strong>Catálogo automático (antiguo).</strong> Su lista sale de los criterios y se actualiza sola. Para elegir viviendas a mano, conviértelo en selección fija.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            if (!open) void load();
          }}
          disabled={archived}
          aria-expanded={open}
          className="rounded-lg border border-gold/50 bg-white px-3 py-1.5 text-sm text-ink/85 hover:bg-cream-50 disabled:opacity-50"
          data-testid="conversion-open"
        >
          {open ? "Cerrar" : "Ver conversión"}
        </button>
      </div>
      {archived ? <p className="mt-1 text-xs text-ink/55">Reactiva el catálogo para convertirlo.</p> : null}
      {open ? (
        <div className="mt-3 space-y-3 rounded-lg border border-gold/25 bg-white p-3" data-testid="conversion-preview">
          {loading ? <p className="text-xs text-ink/55">Calculando la lista…</p> : null}
          {error ? (
            <p role="alert" className="text-xs text-red-800">
              {error}
            </p>
          ) : null}
          {refreshed ? (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="conversion-refreshed">
              La lista cambió desde la vista previa y no se ha convertido. Esta es la lista de ahora: revísala y confirma otra vez.
            </p>
          ) : null}
          {preview ? (
            <>
              <p className="text-sm text-ink/80">
                Se quedan estas <strong>{preview.items.length}</strong> viviendas, en este orden (lo mismo que ve hoy el cliente):
              </p>
              <List items={preview.items} empty="Ninguna: la selección quedaría vacía." />
              {preview.droppedInclusions.length ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="conversion-dropped">
                  <p className="font-semibold">No pasan ({preview.droppedInclusions.length}): inclusiones que hoy no aparecen (vendidas, archivadas o sin foto).</p>
                  <List items={preview.droppedInclusions} empty="" />
                </div>
              ) : null}
              <ul className="list-disc space-y-1 pl-5 text-xs text-ink/65">
                <li>Se conservan los textos, las fotos elegidas, la portada, el contacto, el enlace compartido y los grupos de la HOME.</li>
                <li>Los criterios y los ajustes ({preview.adjustments}) quedan guardados, sin efecto en la selección fija.</li>
                {preview.archivedManual.length ? (
                  <li>
                    Tu lista manual de antes ({preview.archivedManual.length} que no están en esta selección) queda guardada en el registro de la conversión y se puede recuperar.
                  </li>
                ) : null}
                <li>Después, la lista ya no cambia sola: añades, quitas y ordenas tú (máximo 24).</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || loading || archived}
                  className="rounded-lg bg-gold/90 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="conversion-confirm"
                >
                  Convertir en selección fija
                </button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-ink/60">
                  Cancelar
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
