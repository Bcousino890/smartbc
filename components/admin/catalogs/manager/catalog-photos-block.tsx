"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogPhotoItem, CatalogPhotosView } from "@/lib/catalogs/types";

// «Fotos en este catálogo» (BCP-01 E3). En el panel de la vivienda de
// Contenido. Cada cambio se guarda AL PULSAR (E3-4), aparte del texto, y pasa
// por el «run» del gestor (mensajes, medición y aviso al lector). Reglas:
//   · E3-1: la última foto en uso no se puede excluir (botón desactivado y su
//     motivo; SQL lo vuelve a comprobar);
//   · E3-2: una excluida no se ofrece como apertura;
//   · excluir la apertura ELEGIDA o la foto de la PORTADA DEL CATÁLOGO pide
//     confirmación y dice qué respaldo entra (E3-7, D-QA19 y corrección 3);
//   · los ajustes que ya no aplican (fotos borradas o reimportadas) se avisan
//     y se pueden quitar (E3-5).
// No cambia la ficha ni las fotos del CRM.
// PR7b: con el acabado fotográfico del catálogo activo, cada foto en uso
// ofrece «Sin acabado en esta foto» (se guarda al pulsar).

type Res = ActionResult<{ version: number; fingerprint?: string | null; publicChange?: boolean }>;

export interface PhotoActions {
  list: (i: { catalogId: string; propertyId: string }) => Promise<ActionResult<{ view: CatalogPhotosView }>>;
  setExcluded: (i: { catalogId: string; propertyId: string; photoId: string; excluded: boolean; skipNotify?: boolean }) => Promise<Res>;
  setOpening: (i: { catalogId: string; propertyId: string; photoId: string | null; skipNotify?: boolean }) => Promise<Res>;
  /** PR7b · «Sin acabado en esta foto». */
  setNoFinish: (i: { catalogId: string; propertyId: string; photoId: string; noFinish: boolean; skipNotify?: boolean }) => Promise<Res>;
}

const SOURCE: Record<CatalogPhotosView["openingSource"], string> = {
  chosen: "la elegida",
  "crm-cover": "automática: la portada en el CRM",
  first: "automática: la primera foto en uso",
  none: "ninguna (sin fotos en uso)",
};

export function CatalogPhotosBlock({
  catalogId,
  propertyId,
  actions,
  run,
  pending,
  refreshKey,
}: {
  catalogId: string;
  propertyId: string;
  actions: PhotoActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
  /** Cambia cuando el catálogo se refresca (para volver a leer). */
  refreshKey?: string;
}) {
  const listRef = useRef(actions.list);
  listRef.current = actions.list;
  const [view, setView] = useState<CatalogPhotosView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listRef.current({ catalogId, propertyId });
    if (r.ok) {
      setView(r.view);
      setError(null);
    } else setError(r.error);
  }, [catalogId, propertyId]);

  useEffect(() => {
    setView(null);
    void load();
  }, [load, refreshKey]);

  function exclude(ph: CatalogPhotoItem) {
    const notes: string[] = [];
    if (ph.catalogCover) notes.push("Es la foto de la portada del catálogo: la portada pasará a la foto de apertura de esta vivienda en este catálogo.");
    if (ph.chosen) notes.push("Es la foto de apertura elegida: la apertura vuelve a ser la automática (la portada en el CRM o la primera en uso).");
    if (notes.length && !window.confirm(`${notes.join(" ")}\n\n¿No usarla en este catálogo?`)) return;
    const okMsg = ph.opening ? "Foto excluida de este catálogo. La apertura pasa a su respaldo." : "Foto excluida de este catálogo.";
    run(() => actions.setExcluded({ catalogId, propertyId, photoId: ph.photoId, excluded: true }), okMsg, () => void load(), undefined, "fotos");
  }
  function restore(photoId: string, msg = "Foto de nuevo en uso en este catálogo.") {
    run(() => actions.setExcluded({ catalogId, propertyId, photoId, excluded: false }), msg, () => void load(), undefined, "fotos");
  }
  function opening(photoId: string | null) {
    run(
      () => actions.setOpening({ catalogId, propertyId, photoId }),
      photoId ? "Foto de apertura elegida." : "Apertura automática.",
      () => void load(),
      undefined,
      "fotos",
    );
  }
  function noFinish(photoId: string, on: boolean) {
    run(
      () => actions.setNoFinish({ catalogId, propertyId, photoId, noFinish: on }),
      on ? "Esta foto se verá sin acabado." : "Esta foto vuelve a llevar el acabado.",
      () => void load(),
      undefined,
      "fotos",
    );
  }
  function clearStale() {
    if (!view) return;
    const ids = view.stale.excluded;
    const all = async (): Promise<Res> => {
      let last: Res = { ok: true, version: 0 };
      for (const id of ids) {
        last = await actions.setExcluded({ catalogId, propertyId, photoId: id, excluded: false });
        if (!last.ok) return last;
      }
      if (view.stale.opening) last = await actions.setOpening({ catalogId, propertyId, photoId: null });
      return last;
    };
    run(all, "Ajustes antiguos quitados.", () => void load(), undefined, "fotos");
  }

  const btn = "rounded-md border border-gold/40 px-2 py-1 text-xs text-ink/80 hover:bg-white disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold";
  const staleCount = view ? view.stale.excluded.length + (view.stale.opening ? 1 : 0) : 0;

  return (
    <section aria-labelledby="cpb-title" className="space-y-2 rounded-lg border border-gold/15 bg-cream-50/60 p-2" data-testid="catalog-photos">
      <h3 id="cpb-title" className="crm-label-sm text-ink/70">
        Fotos en este catálogo
      </h3>
      <p className="text-xs text-ink/60" data-testid="catalog-photos-note">
        Estos ajustes solo cambian este catálogo; no cambian la ficha ni las fotos del CRM. Si dejas de usar la foto de apertura o la de la portada del catálogo, se usa su respaldo.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {!view ? (
        error ? null : <p className="text-xs text-ink/50">Cargando fotos…</p>
      ) : (
        <>
          <p className="text-xs text-ink/70" data-testid="catalog-photos-count">
            Se usan {view.used} de {view.total} fotos · Apertura: {SOURCE[view.openingSource]}.
          </p>
          {staleCount ? (
            <div className="space-y-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900" data-testid="catalog-photos-stale">
              <p>
                {staleCount === 1 ? "Un ajuste ya no se aplica" : `${staleCount} ajustes ya no se aplican`}: esas fotos se borraron o se volvieron a importar en el CRM, así que ahora se ven todas las fotos actuales. Revísalas.
              </p>
              <button type="button" className={btn} onClick={clearStale} disabled={pending}>
                Quitar los ajustes antiguos
              </button>
            </div>
          ) : null}
          {view.photos.length === 0 ? (
            <p className="text-xs text-amber-900">Esta vivienda no tiene fotos: el lector la enseña «Sin fotos».</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Fotos de la vivienda en este catálogo" data-testid="catalog-photos-list">
              {view.photos.map((ph, i) => {
                const last = !ph.excluded && view.used <= 1;
                const tags = [
                  ph.opening ? (ph.chosen ? "Apertura (elegida)" : "Apertura") : null,
                  ph.excluded ? "No se usa en este catálogo" : null,
                  ph.catalogCover ? "Portada del catálogo" : null,
                  ph.crmCover ? "Portada en el CRM" : null,
                ].filter(Boolean) as string[];
                return (
                  <li key={ph.photoId} className={`space-y-1 rounded-md p-1 ${ph.excluded ? "bg-ink/5" : "bg-white"}`} data-testid="catalog-photo" data-excluded={ph.excluded ? "1" : "0"}>
                    <div className={`aspect-[4/3] overflow-hidden rounded bg-cream-200 ${ph.excluded ? "opacity-40" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ph.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    {tags.length ? <p className="text-xs text-ink/70">{tags.join(" · ")}</p> : null}
                    <div className="flex flex-wrap gap-1">
                      {ph.excluded ? (
                        <button type="button" className={btn} onClick={() => restore(ph.photoId)} disabled={pending} aria-label={`Volver a usar la foto ${i + 1}`}>
                          Volver a usarla
                        </button>
                      ) : (
                        <>
                          {!ph.chosen ? (
                            <button type="button" className={btn} onClick={() => opening(ph.photoId)} disabled={pending} aria-label={`Usar la foto ${i + 1} como foto de apertura`}>
                              Usar como apertura
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={btn}
                            onClick={() => exclude(ph)}
                            disabled={pending || last}
                            title={last ? "Es la última foto en uso. Para que la vivienda no aparezca, quítala o exclúyela en Viviendas." : undefined}
                            aria-label={`No usar la foto ${i + 1} en este catálogo`}
                          >
                            No usar en este catálogo
                          </button>
                        </>
                      )}
                    </div>
                    {last ? <p className="text-xs text-ink/50">Última foto en uso: no se puede excluir.</p> : null}
                    {view.finish && !ph.excluded ? (
                      <label className="flex items-center gap-1.5 text-xs text-ink/70" data-testid="photo-no-finish">
                        <input
                          type="checkbox"
                          checked={ph.noFinish}
                          disabled={pending}
                          onChange={(e) => noFinish(ph.photoId, e.target.checked)}
                          className="h-3.5 w-3.5 accent-[#b8956a]"
                          aria-label={`Sin acabado en la foto ${i + 1}`}
                        />
                        Sin acabado en esta foto
                      </label>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {view.openingSource === "chosen" ? (
            <button type="button" className={btn} onClick={() => opening(null)} disabled={pending}>
              Volver a la apertura automática
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
