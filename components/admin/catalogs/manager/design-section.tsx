"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CatalogCover, countLabel } from "@/components/catalogs/catalog-cover";
import type { CoverRaw, MetaRaw } from "@/lib/catalogs/manager-state";
import { sharePath } from "@/lib/catalogs/share";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { CoverPicker, type CoverActions } from "../cover-picker";
import { ConflictNote } from "./conflict-note";
import type { FormDraft } from "./use-form-draft";
import st from "../studio/studio.module.css";

// Diseño (BCP-01 E2, plan §3.9): título, introducción y portada (vivienda y
// foto, con las reglas y respaldos de C1), con su vista previa. La vista previa
// usa lo ESCRITO (marcado si no está guardado) y la foto efectiva GUARDADA.
// PR7b: interruptor «Acabado fotográfico» (por catálogo, apagado por defecto),
// que se guarda al pulsar como los ajustes de fotos.
// Rediseño 2026-10-23: un panel «Portada y presentación» (título e
// introducción, portada, acabado) y otro con la vista previa; mismos
// formularios y acciones.

type Run = Parameters<typeof CoverPicker>[0]["run"];

export function DesignSection({
  catalog,
  items,
  numberLabel,
  pending,
  run,
  coverActions,
  coverRefreshKey,
  metaForm,
  coverForm,
  contactName,
  onSaveMeta,
  coverNotice,
  previewToken,
  photoFinish,
  onPhotoFinish,
}: {
  catalog: CatalogDetail;
  items: CatalogItemView[];
  numberLabel?: string | null;
  pending: boolean;
  run: Run;
  coverActions: CoverActions;
  /** E3: vuelve a leer las fotos de la portada tras cada cambio. */
  coverRefreshKey?: string;
  metaForm: FormDraft<MetaRaw>;
  coverForm: FormDraft<CoverRaw>;
  contactName: string;
  onSaveMeta: (e: React.FormEvent) => void;
  coverNotice: string | null;
  /** Token del enlace ACTIVO (o null): «Abrir la vista previa completa». */
  previewToken: string | null;
  /** PR7b: acabado fotográfico guardado del catálogo. */
  photoFinish: boolean;
  onPhotoFinish: (on: boolean) => void;
}) {
  const { title, intro } = metaForm.value;
  // PR7b: la casilla responde al pulsar; vuelve a lo guardado al llegar el
  // catálogo actualizado (o si el guardado falla y no cambia nada).
  const [finishShown, setFinishShown] = useState(photoFinish);
  useEffect(() => setFinishShown(photoFinish), [photoFinish, pending]);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className={`${st.panel} min-w-0 space-y-5 p-4 sm:p-5`} aria-labelledby="ds-title">
        <div>
          <h2 id="ds-title" className="text-base font-medium text-ink">
            Portada y presentación
          </h2>
          <p className="mt-0.5 text-sm text-ink/65">La primera impresión del catálogo: título, introducción, foto de portada y acabado.</p>
        </div>
        <form onSubmit={onSaveMeta} className="space-y-3" data-testid="meta-form">
          {metaForm.conflict ? <ConflictNote saved={metaForm.conflict.raw.title} onDiscard={metaForm.discard} onKeep={metaForm.keepMine} /> : null}
          <label className="block">
            <span className="crm-label-sm text-ink/70">Título</span>
            <input
              id="cm-title"
              value={title}
              onChange={(e) => metaForm.set({ ...metaForm.value, title: e.target.value })}
              maxLength={160}
              required
              className={`${st.input} mt-1 w-full text-sm`}
            />
          </label>
          <label className="block">
            <span className="crm-label-sm text-ink/70">Introducción</span>
            <textarea
              value={intro}
              onChange={(e) => metaForm.set({ ...metaForm.value, intro: e.target.value })}
              maxLength={2000}
              rows={4}
              className={`${st.input} mt-1 w-full text-sm`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className={`${st.btnPrimary} text-sm`}>
              Guardar
            </button>
            {metaForm.edited ? (
              <span className="text-xs font-semibold text-amber-800" data-testid="meta-unsaved">
                Cambios sin guardar
              </span>
            ) : null}
          </div>
        </form>
        {coverNotice ? (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="cover-discarded">
            {coverNotice}
          </p>
        ) : null}
        <CoverPicker catalogId={catalog.id} items={items} cover={catalog.cover} actions={coverActions} run={run} pending={pending} form={coverForm} refreshKey={coverRefreshKey} />
        <label className="flex items-start gap-3 border-t border-[color:var(--st-line)] pt-4" data-testid="photo-finish">
          <input
            type="checkbox"
            checked={finishShown}
            disabled={pending}
            onChange={(e) => {
              setFinishShown(e.target.checked);
              onPhotoFinish(e.target.checked);
            }}
            className="mt-0.5 h-4 w-4 accent-[#856329]"
            aria-describedby="cm-finish-note"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Acabado fotográfico</span>
            <span id="cm-finish-note" className="block text-xs text-ink/60">
              Ajusta el tono de cada foto sobre una copia y añade un filete fino a la apertura y la portada; las fotos del CRM no cambian.
            </span>
          </span>
        </label>
      </section>
      <aside className={`${st.panel} min-w-0 space-y-3 p-4 sm:p-5`} aria-labelledby="ds-preview">
        <h2 id="ds-preview" className="text-base font-medium text-ink">
          Vista previa de la portada
        </h2>
        {metaForm.edited ? (
          <p className="text-xs text-amber-800" data-testid="preview-unsaved">
            Con cambios sin guardar: el cliente sigue viendo lo guardado.
          </p>
        ) : null}
        <div className="mx-auto aspect-[150/212] w-full max-w-[240px] overflow-hidden rounded-sm shadow-[0_10px_24px_-14px_rgba(60,40,20,0.45)]" data-check-overflow="portada">
          <CatalogCover
            data={{
              title: title || catalog.title,
              subtitle: intro || null,
              numberLabel,
              edition: catalog.edition,
              photoUrl: catalog.cover.effectivePhotoUrl ?? null,
              preparedBy: contactName.trim() || null,
              countLabel: countLabel(items.length),
            }}
          />
        </div>
        {previewToken ? (
          <a
            href={sharePath(previewToken)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${st.link} mx-auto flex w-fit items-center gap-1 text-sm`}
            data-testid="design-preview-link"
          >
            Abrir la vista previa completa <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </aside>
    </div>
  );
}
