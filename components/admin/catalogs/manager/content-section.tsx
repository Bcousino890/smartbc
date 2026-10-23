"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { materialLabels, type CatalogMaterial } from "@/lib/catalogs/material";
import { CONTENT_FILTERS, matchesContentFilter, matchesQuery, textStateLabel, type ContentFilter, type TextDraft } from "@/lib/catalogs/manager-state";
import type { CatalogTextView } from "@/lib/catalogs/texts";
import { CLEAN, LEVEL, STORY, TextEditor, textDraftKey, textEdited, textSessionKey, type TextActions } from "../catalog-texts-panel";
import { draftsStore, useDraftsVersion } from "./drafts-store";
import { SidePanel } from "./side-panel";
import { CatalogPhotosBlock, type PhotoActions } from "./catalog-photos-block";

// Contenido (BCP-01 E2, plan §3.8): la lista con qué ve hoy el cliente, el
// estado del texto y el material (D-QA8, sin IA), con filtros y búsqueda, y UN
// solo editor abierto (panel lateral en escritorio, pantalla propia en móvil).
// Los textos de las viviendas que salieron de la lista siguen en «reserva»; lo
// escrito para una vivienda que ya no aparece en ningún sitio se puede copiar
// o descartar (no se guarda desde aquí).

type Run = Parameters<typeof TextEditor>[0]["run"];

export function ContentSection({
  catalogId,
  texts,
  material,
  actions,
  run,
  pending,
  storyHref,
  openId,
  onOpen,
  refresh,
  message,
  photoActions,
  photoRun,
  refreshKey,
}: {
  catalogId: string;
  texts: CatalogTextView[];
  material: Record<string, CatalogMaterial>;
  actions: TextActions;
  run: Run;
  pending: boolean;
  storyHref: (slug: string) => string;
  openId: string | null;
  onOpen: (propertyId: string | null) => void;
  refresh: () => void;
  message: ReactNode;
  /** E3 · fotos en este catálogo (se guardan al pulsar, aparte del texto). */
  photoActions: PhotoActions;
  photoRun: Parameters<typeof CatalogPhotosBlock>[0]["run"];
  refreshKey: string;
}) {
  useDraftsVersion();
  const filter = draftsStore.ui<ContentFilter>(catalogId, "contentFilter") ?? "todas";
  const query = draftsStore.ui<string>(catalogId, "contentQuery") ?? "";
  const lastOpener = useRef<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const ctx = (t: CatalogTextView) => ({ material: material[t.propertyId], edited: textEdited(catalogId, t.propertyId) });
  const visible = texts.filter((t) => matchesContentFilter(filter, t, ctx(t)) && matchesQuery(query, t));
  const inList = visible.filter((t) => t.inList);
  const reserve = visible.filter((t) => !t.inList);
  const order = [...inList, ...reserve];
  const open = openId ? texts.find((t) => t.propertyId === openId) ?? null : null;
  const pos = open ? order.findIndex((t) => t.propertyId === open.propertyId) : -1;
  const orphans = draftsStore
    .draftKeys(catalogId)
    .filter((k) => k.startsWith("text:") && !texts.some((t) => textDraftKey(t.propertyId) === k))
    .map((k) => ({ key: k, draft: draftsStore.draft<TextDraft>(catalogId, k)! }))
    .filter((o) => o.draft);

  useEffect(() => {
    if (openId) {
      lastOpener.current = openId;
      return;
    }
    const pid = lastOpener.current;
    if (!pid) return;
    lastOpener.current = null;
    requestAnimationFrame(() => document.getElementById(`text-open-${pid}`)?.focus());
  }, [openId]);

  function row(t: CatalogTextView) {
    const active = openId === t.propertyId;
    const m = material[t.propertyId];
    const labels = m ? materialLabels(m) : null;
    const unsaved = textEdited(catalogId, t.propertyId);
    const stale = !!t.published && !t.published.current;
    return (
      <li key={t.propertyId} className={`grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] ${active ? "bg-gold/10" : ""}`} data-testid="text-row" data-check-overflow="texto">
        <div className="min-w-0">
          <button
            type="button"
            id={`text-open-${t.propertyId}`}
            onClick={() => onOpen(active ? null : t.propertyId)}
            aria-expanded={active}
            aria-label={`${active ? "Cerrar" : "Editar"} el texto de «${t.title}»`}
            className="block w-full min-w-0 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <p className="truncate text-sm text-ink">
              {t.bcReference ? <span className="mr-2 text-xs text-ink/45">{t.bcReference}</span> : null}
              {t.published?.title ?? t.title}
            </p>
            {t.published?.title ? (
              <p className="truncate text-xs text-ink/45" data-testid="row-crm-title">
                En la ficha: {t.title}
              </p>
            ) : null}
          </button>
          {unsaved ? (
            <p className="text-xs font-semibold text-amber-800" data-testid="row-unsaved">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" aria-hidden="true" />
              Cambios sin guardar
            </p>
          ) : null}
        </div>
        <details className="min-w-0 text-xs text-ink/65" data-testid="text-level">
          <summary className="cursor-pointer">
            <span className="sm:hidden">El cliente ve: </span>
            <strong className="font-semibold text-ink/80">{LEVEL[t.level]}</strong> <span className="text-ink/45">· Por qué</span>
          </summary>
          <p className="mt-1">
            Manda el texto publicado aquí; si no hay, la historia aprobada; si no, la descripción limpia; si no, solo datos y fotos. {CLEAN[t.source.clean]} · {STORY[t.source.story]}.
            {stale ? ` Lo publicado dejó de verse: cambió ${t.published!.changed.join(", ") || "la ficha"}.` : ""}
          </p>
        </details>
        <div className="min-w-0 text-xs">
          <p className={stale ? "text-amber-800" : "text-ink/65"} data-testid="text-state">
            {textStateLabel(t)}
          </p>
          <p className={labels?.length ? "text-amber-800" : "text-ink/45"} data-testid="text-material">
            {labels === null ? "—" : labels.length ? labels.join(" · ") : "Material completo"}
          </p>
        </div>
      </li>
    );
  }

  const counts = Object.fromEntries(CONTENT_FILTERS.map((f) => [f.id, texts.filter((t) => matchesContentFilter(f.id, t, ctx(t))).length])) as Record<ContentFilter, number>;

  const listCol = (
    <div className={`min-w-0 space-y-3 ${openId ? "hidden xl:block" : ""}`} data-testid="texts-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por estado" className="flex min-w-0 flex-wrap gap-1">
          {CONTENT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => draftsStore.setUi(catalogId, "contentFilter", f.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                filter === f.id ? "border-ink bg-ink text-cream-50" : "border-gold/30 text-ink/70 hover:bg-white"
              }`}
              data-testid={`filter-${f.id}`}
            >
              {f.label} · {counts[f.id]}
            </button>
          ))}
        </div>
        <label className="ml-auto w-full sm:w-56">
          <span className="sr-only">Buscar vivienda</span>
          <input
            type="search"
            value={query}
            onChange={(e) => draftsStore.setUi(catalogId, "contentQuery", e.target.value)}
            placeholder="Buscar vivienda"
            className="w-full rounded-lg border border-gold/25 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-gold"
          />
        </label>
      </div>
      <p className="text-xs text-ink/55">Solo para este catálogo: la ficha de la propiedad no cambia.</p>

      {texts.filter((t) => t.inList).length === 0 ? <p className="text-xs text-ink/50">Este catálogo todavía no tiene viviendas.</p> : null}
      {inList.length ? (
        <ul className="divide-y divide-gold/10 overflow-hidden rounded-xl border border-gold/15 bg-white/60">
          <li className="hidden px-3 py-1.5 text-xs uppercase tracking-wide text-ink/45 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-3" aria-hidden="true">
            <span>Vivienda</span>
            <span>Qué ve el cliente</span>
            <span>Texto · material</span>
          </li>
          {inList.map(row)}
        </ul>
      ) : texts.some((t) => t.inList) ? (
        <p className="rounded-xl border border-dashed border-gold/25 px-4 py-6 text-center text-sm text-ink/55">Ninguna vivienda con este filtro.</p>
      ) : null}
      {reserve.length ? (
        <div className="space-y-2" data-testid="texts-reserve">
          <h3 className="crm-label-sm text-ink/60">Textos en reserva ({reserve.length})</h3>
          <p className="text-xs text-ink/50">Viviendas que ya no están en la lista: su texto se conserva por si vuelven. Bórralo solo si ya no lo quieres.</p>
          <ul className="divide-y divide-gold/10 overflow-hidden rounded-xl border border-gold/15 bg-white/60">{reserve.map(row)}</ul>
        </div>
      ) : null}
      {orphans.length ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3" data-testid="orphan-drafts">
          <h3 className="crm-label-sm text-amber-900">Cambios sin guardar de viviendas que ya no están ({orphans.length})</h3>
          <p className="text-xs text-amber-900">No se pueden guardar desde aquí. Copia lo que necesites o descártalo.</p>
          <ul className="space-y-2">
            {orphans.map(({ key, draft }) => {
              const text = [draft.value.lead, draft.value.body].filter(Boolean).join("\n\n");
              return (
                <li key={key} className="space-y-1 rounded-lg bg-white/80 p-2 text-xs text-ink/75">
                  <p className="line-clamp-3 whitespace-pre-wrap">{text || "—"}</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="underline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(text);
                          setCopied(key);
                        } catch {
                          setCopied(null);
                        }
                      }}
                    >
                      {copied === key ? "Copiado" : "Copiar"}
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        draftsStore.discardDraft(catalogId, key);
                        draftsStore.updateSession(catalogId, textSessionKey(key.slice(5)), () => undefined);
                      }}
                    >
                      Descartar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={openId ? "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:items-start xl:gap-4" : ""}>
      {listCol}
      {openId ? (
        <SidePanel
          label={`Texto de «${open?.title ?? "vivienda"}»`}
          heading={open?.title ?? "Vivienda"}
          sub={
            open ? (
              <>
                {open.bcReference ? `${open.bcReference} · ` : ""}
                {pos >= 0 ? `${pos + 1} de ${order.length}` : open.inList ? "fuera del filtro" : "en reserva"}
                {textEdited(catalogId, open.propertyId) ? <span className="ml-2 font-semibold text-amber-800">· Cambios sin guardar</span> : null}
              </>
            ) : null
          }
          backLabel="Textos y fotos"
          onClose={() => onOpen(null)}
          onPrev={pos > 0 ? () => onOpen(order[pos - 1].propertyId) : null}
          onNext={pos >= 0 && pos < order.length - 1 ? () => onOpen(order[pos + 1].propertyId) : null}
          testId="text-panel"
        >
          {open ? (
            <>
              <p className="rounded-lg bg-cream-50 px-2 py-1.5 text-xs text-ink/70" data-testid="editor-level">
                <strong>Qué ve el cliente:</strong> {LEVEL[open.level]}. Manda el texto publicado aquí; si no hay, la historia aprobada; si no, la descripción limpia;
                si no, solo datos y fotos.
                {material[open.propertyId] && materialLabels(material[open.propertyId]).length ? ` Material: ${materialLabels(material[open.propertyId]).join(" · ")}.` : ""}
              </p>
              {open.inList ? (
                <CatalogPhotosBlock
                  key={`photos-${open.propertyId}`}
                  catalogId={catalogId}
                  propertyId={open.propertyId}
                  actions={photoActions}
                  run={photoRun}
                  pending={pending}
                  refreshKey={refreshKey}
                />
              ) : null}
              <TextEditor
                key={open.propertyId}
                catalogId={catalogId}
                view={open}
                actions={actions}
                run={run}
                pending={pending}
                storyHref={storyHref(open.slug)}
                refresh={refresh}
                message={message}
              />
            </>
          ) : (
            <p className="text-sm text-ink/60" data-testid="text-gone">
              Esta vivienda ya no está en el catálogo ni tiene texto en reserva.
            </p>
          )}
        </SidePanel>
      ) : null}
    </div>
  );
}
