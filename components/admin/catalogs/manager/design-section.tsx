"use client";

import { ExternalLink } from "lucide-react";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import type { CoverRaw, MetaRaw } from "@/lib/catalogs/manager-state";
import { sharePath } from "@/lib/catalogs/share";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { CoverPicker, type CoverActions } from "../cover-picker";
import { ConflictNote } from "./conflict-note";
import type { FormDraft } from "./use-form-draft";

// Diseño (BCP-01 E2, plan §3.9): título, introducción y portada (vivienda y
// foto, con las reglas y respaldos de C1), con su vista previa. La vista previa
// usa lo ESCRITO (marcado si no está guardado) y la foto efectiva GUARDADA.

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
}) {
  const { title, intro } = metaForm.value;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <form onSubmit={onSaveMeta} className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" data-testid="meta-form">
          {metaForm.conflict ? <ConflictNote saved={metaForm.conflict.raw.title} onDiscard={metaForm.discard} onKeep={metaForm.keepMine} /> : null}
          <label className="block">
            <span className="crm-label-sm text-ink/70">Título</span>
            <input
              id="cm-title"
              value={title}
              onChange={(e) => metaForm.set({ ...metaForm.value, title: e.target.value })}
              maxLength={160}
              required
              className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
            />
          </label>
          <label className="block">
            <span className="crm-label-sm text-ink/70">Introducción</span>
            <textarea
              value={intro}
              onChange={(e) => metaForm.set({ ...metaForm.value, intro: e.target.value })}
              maxLength={2000}
              rows={4}
              className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-60"
            >
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
      </div>
      <div className="min-w-0 space-y-2">
        <p className="crm-label-sm text-ink/60">Vista previa de la portada</p>
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
            }}
          />
        </div>
        {previewToken ? (
          <a
            href={sharePath(previewToken)}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto flex w-fit items-center gap-1 text-sm text-ink/70 underline"
            data-testid="design-preview-link"
          >
            Abrir la vista previa completa <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
