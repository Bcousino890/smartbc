"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { materialLabels, type CatalogMaterial } from "@/lib/catalogs/material";
import { CONTENT_FILTERS, matchesContentFilter, matchesQuery, textStateLabel, type ContentFilter, type TextDraft } from "@/lib/catalogs/manager-state";
import type { CatalogTextView } from "@/lib/catalogs/texts";
import { CLEAN, LEVEL, STORY, TextEditor, textDraftKey, textEdited, textSessionKey, type TextActions } from "../catalog-texts-panel";
import { draftsStore, useDraftsVersion } from "./drafts-store";
import { SidePanel } from "./side-panel";
import { CatalogPhotosBlock, type PhotoActions } from "./catalog-photos-block";
import st from "../studio/studio.module.css";

// Contenido (BCP-01 E2, plan §3.8): la lista con qué ve hoy el cliente, el
// estado del texto y el material (D-QA8, sin IA), con filtros y búsqueda, y UN
// solo editor abierto (panel lateral en escritorio, pantalla propia en móvil).
// Los textos de las viviendas que salieron de la lista siguen en «reserva»; lo
// escrito para una vivienda que ya no aparece en ningún sitio se puede copiar
// o descartar (no se guarda desde aquí).
// Rediseño 2026-10-23 («Textos y fotos», D6, D9): lista con lo que ve el
// cliente dicho en positivo (una descripción válida de la ficha no es un
// error) y los avisos reales en ámbar; editor enfocado con dos pestañas
// internas, «Título y descripción» y «Fotos», que siguen montadas las dos.

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
  thumbs = {},
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
  /** Miniatura de cada vivienda de la lista (la de Viviendas). */
  thumbs?: Record<string, string | null>;
}) {
  useDraftsVersion();
  const filter = draftsStore.ui<ContentFilter>(catalogId, "contentFilter") ?? "todas";
  const query = draftsStore.ui<string>(catalogId, "contentQuery") ?? "";
  const lastOpener = useRef<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"texto" | "fotos">("texto");

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
    const facts = !t.published && !(t.draft && (t.draft.body || t.draft.lead || t.draft.title)) && t.level === "facts";
    // «Sin descripción» ya lo dice el estado cuando el cliente solo ve datos y fotos.
    const labels = m ? materialLabels(m).filter((l) => !(facts && l === "Sin descripción")) : null;
    const unsaved = textEdited(catalogId, t.propertyId);
    const stale = !!t.published && !t.published.current;
    const thumb = thumbs[t.propertyId];
    // D9: sin texto propio, se dice qué ve el cliente; solo es aviso si no
    // hay descripción (solo datos y fotos) o si lo publicado dejó de verse.
    const state = t.published || (t.draft && (t.draft.body || t.draft.lead || t.draft.title)) ? textStateLabel(t) : facts ? "Sin descripción: solo datos y fotos" : `Usa la ${t.level === "story" ? "historia aprobada" : "descripción de la ficha"}`;
    const tone = stale || facts ? "text-amber-800" : t.published ? st.green : "text-ink/60";
    return (
      <li
        key={t.propertyId}
        className={`grid grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3 px-3 py-3 ${active ? "bg-gold/10" : ""}`}
        data-testid="text-row"
        data-check-overflow="texto"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
        ) : (
          <span className="h-10 w-10 rounded bg-[color:var(--st-soft)]" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <button
            type="button"
            id={`text-open-${t.propertyId}`}
            onClick={() => onOpen(active ? null : t.propertyId)}
            aria-expanded={active}
            aria-label={`${active ? "Cerrar" : "Editar"} el texto de «${t.title}»`}
            className="block w-full min-w-0 rounded text-left"
          >
            <span className="line-clamp-2 text-sm font-medium text-ink hover:underline hover:underline-offset-4">{t.published?.title ?? t.title}</span>
            <span className="mt-0.5 block truncate text-xs text-ink/55">
              {[t.bcReference, t.area].filter(Boolean).join(" · ")}
              {t.published?.title ? (
                <span data-testid="row-crm-title">
                  {t.bcReference || t.area ? " · " : ""}En la ficha: {t.title}
                </span>
              ) : null}
            </span>
          </button>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className={tone} data-testid="text-state">
              {state}
            </span>
            {labels?.length ? (
              <span className="text-amber-800" data-testid="text-material">
                · {labels.join(" · ")}
              </span>
            ) : (
              <span className="sr-only" data-testid="text-material">
                {labels === null ? "—" : "Material completo"}
              </span>
            )}
            {unsaved ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-800" data-testid="row-unsaved">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Cambios sin guardar
              </span>
            ) : null}
          </p>
          <details className={`mt-1 min-w-0 text-xs text-ink/60 ${openId ? "hidden" : ""}`} data-testid="text-level">
            <summary className="cursor-pointer">
              El cliente ve: <strong className="font-medium text-ink/75">{LEVEL[t.level]}</strong> · Por qué
            </summary>
            <p className="mt-1">
              Manda el texto publicado aquí; si no hay, la historia aprobada; si no, la descripción limpia; si no, solo datos y fotos. {CLEAN[t.source.clean]} · {STORY[t.source.story]}.
              {stale ? ` Lo publicado dejó de verse: cambió ${t.published!.changed.join(", ") || "la ficha"}.` : ""}
            </p>
          </details>
        </div>
      </li>
    );
  }

  const counts = Object.fromEntries(CONTENT_FILTERS.map((f) => [f.id, texts.filter((t) => matchesContentFilter(f.id, t, ctx(t))).length])) as Record<ContentFilter, number>;

  const listed = texts.filter((t) => t.inList);
  const nOwn = listed.filter((t) => t.published?.current).length;
  const nSource = listed.filter((t) => !t.published && (t.level === "clean" || t.level === "story")).length;
  const nFacts = listed.filter((t) => t.level === "facts").length;

  const listCol = (
    <div className={`min-w-0 space-y-3 ${openId ? "hidden xl:block" : ""}`} data-testid="texts-panel">
      <div className={openId ? "hidden" : ""}>
        <h2 className="text-base font-medium text-ink">Lo que leerá el cliente</h2>
        <p className="mt-0.5 text-sm text-ink/65" data-testid="texts-summary">
          {listed.length} vivienda{listed.length === 1 ? "" : "s"} · {nOwn} con texto propio publicado · {nSource} con la descripción de la ficha
          {nFacts ? <span className="text-amber-800"> · {nFacts} sin descripción</span> : null}. Solo para este catálogo: la ficha de la propiedad no cambia.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por estado" className="flex min-w-0 flex-wrap gap-1">
          {CONTENT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => draftsStore.setUi(catalogId, "contentFilter", f.id)}
              className={`${st.pill} ${filter === f.id ? st.pillOn : ""} text-sm`}
              data-testid={`filter-${f.id}`}
            >
              {f.label} <span className={st.pillCount}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="sr-only">Buscar vivienda</span>
        <input
          type="search"
          value={query}
          onChange={(e) => draftsStore.setUi(catalogId, "contentQuery", e.target.value)}
          placeholder="Buscar vivienda o referencia"
          className={`${st.input} w-full text-sm`}
        />
      </label>

      {listed.length === 0 ? <p className="text-sm text-ink/60">Este catálogo todavía no tiene viviendas.</p> : null}
      {inList.length ? (
        <ul className={`${st.panel} divide-y divide-gold/10 overflow-hidden`}>{inList.map(row)}</ul>
      ) : texts.some((t) => t.inList) ? (
        <p className={`${st.panel} px-4 py-6 text-center text-sm text-ink/60`}>Ninguna vivienda con este filtro.</p>
      ) : null}
      {reserve.length ? (
        <div className="space-y-2" data-testid="texts-reserve">
          <h3 className="crm-label-sm text-ink/70">Textos en reserva ({reserve.length})</h3>
          <p className="text-xs text-ink/50">Viviendas que ya no están en la lista: su texto se conserva por si vuelven. Bórralo solo si ya no lo quieres.</p>
          <ul className={`${st.panel} divide-y divide-gold/10 overflow-hidden`}>{reserve.map(row)}</ul>
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
    <div className={openId ? "xl:grid xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)] xl:items-start xl:gap-4" : ""}>
      {listCol}
      {openId ? (
        <SidePanel
          label={`Texto de «${open?.title ?? "vivienda"}»`}
          heading={open?.title ?? "Vivienda"}
          sub={
            open ? (
              <>
                <span className="font-medium text-ink/75">Editar vivienda</span>
                {" · "}
                {open.bcReference ? `${open.bcReference} · ` : ""}
                {pos >= 0 ? `${pos + 1} de ${order.length}` : open.inList ? "fuera del filtro" : "en reserva"} · Solo cambia este catálogo
                {textEdited(catalogId, open.propertyId) ? <span className="ml-2 font-medium text-amber-800">· Cambios sin guardar</span> : null}
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
              {open.inList ? <EditorTabs tab={editorTab} onTab={setEditorTab} /> : null}
              {/* Las dos pestañas siguen montadas (I7): cambiar no cancela la IA
                  ni pierde nada de lo escrito. */}
              <div id="ed-panel-texto" role={open.inList ? "tabpanel" : undefined} aria-labelledby={open.inList ? "ed-tab-texto" : undefined} hidden={open.inList && editorTab !== "texto"} className="space-y-3">
                <p className="rounded-md bg-[color:var(--st-soft)] px-3 py-2 text-xs text-ink/70" data-testid="editor-level">
                  <strong className="font-medium">Qué ve el cliente:</strong> {LEVEL[open.level]}. Manda el texto publicado aquí; si no hay, la historia aprobada; si no, la
                  descripción limpia; si no, solo datos y fotos.
                  {material[open.propertyId] && materialLabels(material[open.propertyId]).length ? ` Material: ${materialLabels(material[open.propertyId]).join(" · ")}.` : ""}
                </p>
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
              </div>
              {open.inList ? (
                <div id="ed-panel-fotos" role="tabpanel" aria-labelledby="ed-tab-fotos" hidden={editorTab !== "fotos"}>
                  <CatalogPhotosBlock
                    key={`photos-${open.propertyId}`}
                    catalogId={catalogId}
                    propertyId={open.propertyId}
                    actions={photoActions}
                    run={photoRun}
                    pending={pending}
                    refreshKey={refreshKey}
                  />
                  {editorTab === "fotos" && message ? <div className="mt-3">{message}</div> : null}
                </div>
              ) : null}
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

/** Pestañas internas del editor (rediseño 2026-10-23, I7): ← → entre las dos. */
function EditorTabs({ tab, onTab }: { tab: "texto" | "fotos"; onTab: (t: "texto" | "fotos") => void }) {
  const tabs = [
    ["texto", "Título y descripción"],
    ["fotos", "Fotos"],
  ] as const;
  return (
    <div
      role="tablist"
      aria-label="Partes de la vivienda"
      className={st.tabs}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = tab === "texto" ? "fotos" : "texto";
        onTab(next);
        requestAnimationFrame(() => document.getElementById(`ed-tab-${next}`)?.focus());
      }}
      data-testid="editor-tabs"
    >
      {tabs.map(([id, label]) => (
        <button
          key={id}
          id={`ed-tab-${id}`}
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-controls={`ed-panel-${id}`}
          tabIndex={tab === id ? 0 : -1}
          onClick={() => onTab(id)}
          className={`${st.tab} ${tab === id ? st.tabOn : ""} text-sm`}
          data-testid={`editor-tab-${id}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
