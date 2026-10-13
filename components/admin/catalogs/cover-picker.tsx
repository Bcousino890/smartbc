"use client";

import { useEffect, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogCoverState, CatalogItemView, CoverPhotoOption } from "@/lib/catalogs/types";

// Portada elegida (BCP-01 ampliación C1). Una vivienda de la lista y, si se
// quiere, una de sus fotos; no cambia el orden. Si la vivienda sale de la
// lista o la foto desaparece, el lector usa la regla de respaldo y aquí se
// avisa. Las fotos se ven por el proxy neutro (sin URL de almacenamiento).

type Res = ActionResult<{ version: number; fingerprint?: string | null; publicChange?: boolean }>;

export interface CoverActions {
  set: (i: { catalogId: string; propertyId: string | null; photoId?: string | null; skipNotify?: boolean }) => Promise<Res>;
  photos: (i: { catalogId: string; propertyId: string }) => Promise<ActionResult<{ photos: CoverPhotoOption[] }>>;
}

export function CoverPicker({
  catalogId,
  items,
  cover,
  actions,
  run,
  pending,
}: {
  catalogId: string;
  items: CatalogItemView[];
  cover: CatalogCoverState;
  actions: CoverActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
}) {
  const inList = cover.chosenPropertyId && items.some((it) => it.propertyId === cover.chosenPropertyId) ? cover.chosenPropertyId : "";
  const [propertyId, setPropertyId] = useState<string>(inList || "");
  const [photos, setPhotos] = useState<CoverPhotoOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const chosenTitle = items.find((it) => it.propertyId === cover.chosenPropertyId)?.title ?? null;

  useEffect(() => {
    setPhotos(null);
    if (!propertyId) return;
    setError(null);
    start(async () => {
      const r = await actions.photos({ catalogId, propertyId });
      if (r.ok) setPhotos(r.photos);
      else setError(r.error);
    });
  }, [catalogId, propertyId, actions]);

  function choose(photoId: string | null) {
    if (!propertyId) return;
    run(() => actions.set({ catalogId, propertyId, photoId }), "Portada elegida.", undefined, undefined, "portada");
  }

  return (
    <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="cp-title" data-testid="cover-picker">
      <h3 id="cp-title" className="crm-label-sm text-ink/70">
        Portada
      </h3>
      <p className="text-xs text-ink/60" data-testid="cover-current">
        {cover.chosenPropertyId
          ? `Elegida: ${chosenTitle ?? "una vivienda que ya no está en el catálogo"}${cover.chosenPhotoId ? " (foto concreta)" : " (su foto de portada)"}.`
          : "Automática: la primera vivienda con foto."}{" "}
        No cambia el orden de la lista.
      </p>
      {cover.warnings.map((w) => (
        <p key={w} className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900" data-testid="cover-warning">
          {w}
        </p>
      ))}
      <label className="block">
        <span className="sr-only">Vivienda de la portada</span>
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          disabled={pending || items.length === 0}
          aria-label="Vivienda de la portada"
          className="w-full rounded-lg border border-gold/25 bg-white px-2 py-2 text-sm text-ink"
        >
          <option value="">Elige una vivienda del catálogo…</option>
          {items.map((it) => (
            <option key={it.propertyId} value={it.propertyId}>
              {[it.bcReference, it.title].filter(Boolean).join(" · ")}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {propertyId ? (
        busy && !photos ? (
          <p className="text-xs text-ink/50">Cargando fotos…</p>
        ) : photos && photos.length === 0 ? (
          <p className="text-xs text-amber-900">Esta vivienda no tiene fotos: la portada usaría la primera vivienda con foto.</p>
        ) : photos ? (
          <ul className="grid grid-cols-3 gap-2" aria-label="Fotos de la vivienda" data-testid="cover-photos">
            {photos.map((ph, i) => {
              const selected = cover.chosenPropertyId === propertyId && cover.chosenPhotoId === ph.id;
              return (
                <li key={ph.id}>
                  <button
                    type="button"
                    onClick={() => choose(ph.id)}
                    disabled={pending}
                    aria-label={`Usar la foto ${i + 1} como portada${ph.isCover ? " (portada de la vivienda)" : ""}`}
                    aria-pressed={selected}
                    className={`block aspect-[3/4] w-full overflow-hidden rounded-md border-2 bg-cream-200 ${selected ? "border-gold" : "border-transparent"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose(null)}
          disabled={pending || !propertyId}
          className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-ink/80 hover:bg-white disabled:opacity-50"
        >
          Usar su foto de portada
        </button>
        {cover.chosenPropertyId ? (
          <button
            type="button"
            onClick={() => run(() => actions.set({ catalogId, propertyId: null, photoId: null }), "Portada automática.", () => setPropertyId(""), undefined, "portada")}
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-xs text-ink/70 underline disabled:opacity-50"
          >
            Volver a la portada automática
          </button>
        ) : null}
      </div>
    </section>
  );
}
