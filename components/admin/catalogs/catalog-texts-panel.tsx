"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { DraftCheck, DraftProposal } from "@/lib/catalogs/ai-draft";
import type { CatalogTextView } from "@/lib/catalogs/texts";
import { organizeDescription, paragraphsOf, SECTION_LABELS } from "@/lib/catalogs/structure";
import { approvableParts, changedLabel, partsLabel, publishedMatchesLibrary, type CopyPart, type CopyParts } from "@/lib/catalogs/copy-rules";
import { areaById, areaLabel, areaOptions } from "@/lib/catalogs/areas";
import { areaTextLabel } from "@/lib/catalogs/area-texts";
import {
  editTextDraft,
  isEdited,
  keepMineText,
  saveFailed,
  savedTextOf,
  shownTextOf,
  textAdapter,
  textKey,
  textPendingSave,
  textSaveSucceeded,
  type TextDraft,
  type TextRaw,
} from "@/lib/catalogs/manager-state";
import { draftsStore, useDraftsVersion } from "./manager/drafts-store";
import { SidePanelFooter } from "./manager/side-panel";

// Textos de las viviendas del catálogo (BCP-01 ampliación C2, Z5). Todo se
// queda en el catálogo: nunca toca la ficha global ni las historias.
//   · Diagnóstico: qué ve hoy el cliente y de dónde sale (texto del
//     catálogo, historia aprobada, descripción limpia o solo datos).
//   · Editor (expediente 2026-10-20-bcp-01-compacto-y-opiniones, DC5–DC7):
//     el TÍTULO y la DESCRIPCIÓN de la vivienda en este catálogo; la entrada y
//     los puntos (de C2) quedan plegados en «Más opciones» y no hacen falta
//     para publicar. Basta un título.
//   · IA solo al pulsar: devuelve una PROPUESTA; si el texto cambió mientras
//     tanto, no se pisa (se ofrece «Usar la propuesta»). Nunca publica.
//   · Publicar: sin contacto, URL ni precio, y cada aviso corregido o
//     confirmado. Si la ficha cambia, lo publicado deja de verse y aquí se
//     dice qué cambió; el texto se conserva para revisarlo.
// E2: la lista vive en manager/content-section.tsx; aquí quedan el editor
// (controlado por el almacén de borradores del gestor) y sus tipos.

type Res = ActionResult<{ version: number; fingerprint?: string | null; publicChange?: boolean }>;
type Proposal = ActionResult<{ proposal: DraftProposal; check: DraftCheck }>;
type JourneyPreview = { lead: string | null; highlights: string[]; sections: Array<{ heading: string | null; text: string; photo: boolean }>; words: number; copy: Array<{ heading: string | null; text: string }>; missing: string[] };
type Preview = ActionResult<{ preview: JourneyPreview; check: DraftCheck }>;

export interface TextActions {
  prepare: (i: { catalogId: string; propertyId: string }) => Promise<Proposal>;
  draft: (i: { catalogId: string; propertyId: string }) => Promise<Proposal>;
  save: (i: {
    catalogId: string;
    propertyId: string;
    title?: string | null;
    body: string | null;
    lead: string | null;
    highlights: string[];
    origin?: "manual" | "ai_clean" | "ai_draft";
    expectedRev: number | null;
    skipNotify?: boolean;
  }) => Promise<ActionResult<{ version: number; rev: number; check: DraftCheck; fingerprint?: string | null; publicChange?: boolean }>>;
  publish: (i: { catalogId: string; propertyId: string; expectedRev: number; confirmed: string[]; skipNotify?: boolean }) => Promise<Res>;
  withdraw: (i: { catalogId: string; propertyId: string; skipNotify?: boolean }) => Promise<Res>;
  remove: (i: { catalogId: string; propertyId: string; skipNotify?: boolean }) => Promise<Res>;
  preview: (i: { catalogId: string; propertyId: string; title?: string | null; body: string | null; lead: string | null; highlights: string[] }) => Promise<Preview>;
  /** 0219 · Aprobar lo PUBLICADO como texto de la vivienda (biblioteca). */
  approveCopy: (i: { catalogId: string; propertyId: string; parts: CopyParts }) => Promise<CopyRes>;
  /** 0219 · Retirar el título, la descripción o todo de la biblioteca. */
  withdrawCopy: (i: { catalogId: string; propertyId: string; part: CopyPart }) => Promise<CopyRes>;
  /** 0220 · Confirmar la zona (`areaId` null = «Sin zona verificada»). */
  confirmArea: (i: { catalogId: string; propertyId: string; areaId: string | null; skipNotify?: boolean }) => Promise<Res>;
  /** 0220 · Quitar la confirmación (vuelve la zona de la ficha). */
  clearArea: (i: { catalogId: string; propertyId: string; skipNotify?: boolean }) => Promise<Res>;
  /** 0222 · Guardar en este catálogo su copia de la plantilla de la zona. */
  applyAreaText: (i: { catalogId: string; propertyId: string; skipNotify?: boolean }) => Promise<Res>;
  /** 0222 · Quitar la plantilla de este catálogo. */
  removeAreaText: (i: { catalogId: string; propertyId: string; skipNotify?: boolean }) => Promise<Res>;
}
type CopyRes = ActionResult<{ version: number; status: "created" | "unchanged"; seq: number; publicChange: false }>;

export const LEVEL: Record<CatalogTextView["level"], string> = {
  text: "Texto del catálogo",
  story: "Historia aprobada",
  clean: "Descripción limpia de la ficha",
  facts: "Solo datos y fotos",
};
export const CLEAN: Record<CatalogTextView["source"]["clean"], string> = {
  none: "Sin versión limpia para clientes",
  stale: "Versión limpia caducada (la ficha cambió)",
  current: "Versión limpia vigente",
  empty: "La ficha no tiene texto",
};
export const STORY: Record<CatalogTextView["source"]["story"], string> = {
  none: "Sin historia",
  pending: "Historia pendiente de revisar",
  current: "Historia aprobada vigente",
  stale: "Historia aprobada no vigente (la ficha cambió)",
};
const BLOCKER: Record<string, string> = {
  text_has_contact: "Tiene un teléfono, un correo o una web",
  text_has_price: "Menciona un precio (el precio ya se ve aparte y se actualiza solo)",
};
const WHERE: Record<string, string> = { title: "título", body: "descripción", lead: "entrada", highlight: "puntos" };

type TextSession = {
  origin: "manual" | "ai_clean" | "ai_draft";
  check: DraftCheck | null;
  confirmed: string[];
  proposal: DraftProposal | null;
  preview: JourneyPreview | null;
};
const EMPTY_SESSION: TextSession = { origin: "manual", check: null, confirmed: [], proposal: null, preview: null };
const EMPTY_KEY = textKey({ title: null, lead: null, body: null, highlights: [] });

export const textDraftKey = (propertyId: string) => `text:${propertyId}`;
export const textSessionKey = (propertyId: string) => `textSession:${propertyId}`;

/** E2 · ¿Hay cambios sin guardar (D-QA9) en el texto de esta vivienda? */
export function textEdited(catalogId: string, propertyId: string): boolean {
  return isEdited(textAdapter, draftsStore.draft<TextDraft>(catalogId, textDraftKey(propertyId)));
}

export function TextEditor({
  catalogId,
  view,
  actions,
  run,
  pending,
  storyHref,
  refresh,
  message = null,
}: {
  catalogId: string;
  view: CatalogTextView;
  /** E2 · mensaje del gestor, junto a las acciones fijas. */
  message?: React.ReactNode;
  actions: TextActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
  storyHref: string;
  /** E2 · pedir los datos guardados actuales (tras un guardado rechazado). */
  refresh: () => void;
}) {
  // E2: lo escrito y la sesión del editor viven en el almacén del gestor
  // (dueño único). Cerrar el editor, cambiar de vivienda o de sección no
  // pierde nada; nada se guarda ni se publica solo.
  useDraftsVersion();
  const dKey = textDraftKey(view.propertyId);
  const sKey = textSessionKey(view.propertyId);
  const d = draftsStore.draft<TextDraft>(catalogId, dKey);
  const sess = draftsStore.session<TextSession>(catalogId, sKey) ?? EMPTY_SESSION;
  const setSess = (fn: (s: TextSession) => Partial<TextSession>) =>
    draftsStore.updateSession<TextSession>(catalogId, sKey, (prev) => {
      const base = prev ?? EMPTY_SESSION;
      return { ...base, ...fn(base) };
    });
  const savedNow = savedTextOf(view);
  const value: TextRaw = d ? d.value : shownTextOf(view);
  const { title, body, lead, highlights } = value;
  const currentValue = () => draftsStore.draft<TextDraft>(catalogId, dKey)?.value ?? shownTextOf(view);
  const setValue = (patch: Partial<TextRaw>) =>
    draftsStore.updateDraft<TextDraft>(catalogId, dKey, (prev) => editTextDraft(prev, view, { ...(prev ? prev.value : shownTextOf(view)), ...patch }));
  const setTitle = (v: string) => setValue({ title: v });
  const setBody = (v: string) => setValue({ body: v });
  const setLead = (v: string) => setValue({ lead: v });
  const setHighlights = (fn: (h: string[]) => string[]) => setValue({ highlights: fn(currentValue().highlights) });

  const savedKey = d ? d.saved.key : savedNow.key;
  const rev = d ? d.saved.rev : savedNow.rev;
  const { check, confirmed, proposal, origin } = sess;
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<null | "prepare" | "draft">(null);
  // N1 · desmarcada por defecto en todos los catálogos.
  const [approveOnPublish, setApproveOnPublish] = useState(false);
  const [busy] = useTransition();
  const req = useRef(0);

  // «Pendiente de guardar» (C2): lo escrito ≠ el último borrador guardado.
  const dirty = textPendingSave(value, savedKey);
  // «Cambios sin guardar» (D-QA9): lo cambió la persona en esta sesión.
  const edited = isEdited(textAdapter, d);
  const hasSaved = rev !== null && savedKey !== EMPTY_KEY;
  const pendingWarnings = (check?.warnings ?? []).filter((w) => !confirmed.includes(w.id));
  const canPublish = !!hasSaved && !dirty && !d?.conflict && (check?.blockers.length ?? 0) === 0 && pendingWarnings.length === 0;

  // A3: cerrar el editor, cambiar de vivienda o salir de Contenido cancela la
  // IA pendiente (la respuesta tardía se ignora; lo escrito se conserva).
  useEffect(() => () => {
    req.current++;
  }, []);

  function askAi(kind: "prepare" | "draft") {
    setError(null);
    const id = ++req.current;
    const snapshot = { title, body, lead };
    setAiBusy(kind);
    (kind === "prepare" ? actions.prepare : actions.draft)({ catalogId, propertyId: view.propertyId }).then((r) => {
      if (id !== req.current) return; // cancelada o sustituida: se ignora
      setAiBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Si el texto cambió mientras la IA trabajaba, no se pisa.
      const cur = currentValue();
      if (cur.title !== snapshot.title || cur.body !== snapshot.body || cur.lead !== snapshot.lead) {
        setSess(() => ({ proposal: r.proposal }));
        return;
      }
      applyProposal(r.proposal, r.check);
    });
  }

  function applyProposal(p: DraftProposal, c?: DraftCheck) {
    setValue({ body: p.body, ...(p.lead ? { lead: p.lead } : {}), ...(p.title ? { title: p.title } : {}) });
    setSess(() => ({ origin: p.origin, proposal: null, confirmed: [], ...(c ? { check: c } : {}) }));
  }

  // Al abrir un borrador ya guardado, su comprobación (solo lectura, sin IA):
  // los avisos y bloqueos se ven siempre, no solo justo después de guardar.
  // Si la sesión ya la tiene (editor reabierto), no se vuelve a pedir.
  useEffect(() => {
    const saved = view.draft;
    if (sess.check || !saved || !(saved.body || saved.lead || saved.title)) return;
    let alive = true;
    actions
      .preview({ catalogId, propertyId: view.propertyId, title: saved.title, body: saved.body, lead: saved.lead, highlights: saved.highlights })
      .then((r) => {
        if (alive && r.ok) setSess((s) => (s.check ? {} : { check: r.check }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Solo al abrir: después manda lo que devuelve cada guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tras «Borrar texto»: el editor vuelve a empezar vacío. */
  function resetAfterDelete() {
    draftsStore.discardDraft(catalogId, dKey);
    draftsStore.updateSession(catalogId, sKey, () => undefined);
  }

  function cancelAi() {
    req.current++;
    setAiBusy(null);
  }

  function publish() {
    const parts = approveOnPublish ? approvableParts({ title: value.title, body: value.body, lead: value.lead }) : null;
    run(
      async () => {
        const r = await actions.publish({ catalogId, propertyId: view.propertyId, expectedRev: rev ?? 0, confirmed });
        if (!r.ok || !parts) return r;
        const a = await actions.approveCopy({ catalogId, propertyId: view.propertyId, parts });
        if (!a.ok) return { ok: false as const, error: `Publicado, pero no se ha guardado como texto aprobado: ${a.error}` };
        setApproveOnPublish(false);
        return r;
      },
      parts ? `Publicado y guardado como texto aprobado de la vivienda (${partsLabel(parts)}).` : "Publicado: el cliente ya lo ve.",
      undefined,
      undefined,
      "publicación",
    );
  }

  function save() {
    // Ajuste 2: se envía ESTA instantánea; lo escrito después se conserva.
    const submitted = { ...value, highlights: [...value.highlights] };
    const k = textKey(submitted);
    draftsStore.updateDraft<TextDraft>(catalogId, dKey, (prev) => (prev ? { ...prev, pending: k } : prev));
    run(
      async () => {
        const r = await actions.save({
          catalogId,
          propertyId: view.propertyId,
          title: submitted.title.replace(/\s+/g, " ").trim() || null,
          body: submitted.body.trim() || null,
          lead: submitted.lead.trim() || null,
          highlights: submitted.highlights,
          origin,
          expectedRev: rev,
        });
        if (r.ok) {
          draftsStore.updateDraft<TextDraft>(catalogId, dKey, (prev) => (prev ? textSaveSucceeded(prev, k, r.rev) : prev));
          setSess((s) => ({ check: r.check, confirmed: s.confirmed.filter((id) => r.check.warnings.some((w) => w.id === id)), origin: "manual" }));
        } else {
          draftsStore.updateDraft<TextDraft>(catalogId, dKey, (prev) => (prev ? saveFailed(prev, k) : prev));
          // A2: con la revisión cambiada, se piden los datos guardados actuales
          // (lo escrito se conserva y se decide en el aviso de conflicto).
          refresh();
        }
        return r;
      },
      "Borrador guardado. El cliente sigue viendo lo publicado hasta que publiques.",
      undefined,
      undefined,
      "borrador",
    );
  }

  return (
    <div className="space-y-3" data-testid="text-editor">
      {d?.conflict ? (
        <div role="status" className="space-y-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900" data-testid="text-conflict">
          <p className="font-semibold">El borrador guardado cambió (en otra pestaña o con otra acción). Tus cambios siguen aquí y no se han guardado.</p>
          <p>
            Guardado ahora: {d.conflict.raw.title ? <strong>{d.conflict.raw.title} · </strong> : null}
            {d.conflict.raw.lead ? <em>{d.conflict.raw.lead} </em> : null}
            <span className="line-clamp-3">{d.conflict.raw.body || "—"}</span>
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              className="underline"
              onClick={() => {
                draftsStore.discardDraft(catalogId, dKey);
                setSess(() => ({ check: null, confirmed: [], proposal: null, preview: null, origin: "manual" }));
              }}
            >
              Descartar mis cambios
            </button>
            <button type="button" className="underline" onClick={() => draftsStore.updateDraft<TextDraft>(catalogId, dKey, (prev) => (prev ? keepMineText(prev) : prev))}>
              Mantener los míos
            </button>
          </div>
        </div>
      ) : null}
      {view.published && !view.published.current ? (
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900" data-testid="text-stale">
          La descripción publicada ya no se muestra: cambió {view.published.changed.join(", ") || "la ficha"}. Revísala y vuelve a publicar; mientras tanto el cliente ve{" "}
          {view.level === "story" ? "la historia aprobada" : view.level === "clean" ? "la descripción limpia" : "solo datos y fotos"}
          {view.published.title ? ". El título propio sigue publicado" : ""}.
        </p>
      ) : null}
      <label className="block">
        <span className="crm-label-sm text-ink/70">Título en este catálogo</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder={view.title}
          aria-label="Título en este catálogo"
          data-testid="text-title"
          className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
        <span className="mt-1 block text-xs text-ink/50">Vacío = el de la ficha («{view.title}»). Solo cambia en este catálogo.</span>
      </label>
      <label className="block">
        <span className="crm-label-sm text-ink/70">Descripción para este catálogo (hasta 6.000 caracteres)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={6000}
          rows={10}
          aria-label="Descripción para este catálogo"
          data-testid="text-body"
          className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
        <span className="mt-1 block text-xs text-ink/50">
          Escribe con naturalidad: el catálogo la organiza solo en «Salón y luz», «Cocina y comedor», «Acabados y confort», «La finca» y «Vivir en {view.area ?? "…"}» según lo que diga cada frase. Separa los párrafos con una línea en blanco.
        </span>
      </label>
      <StructurePreview body={body} lead={lead} area={view.area} areaText={view.areaText?.copy?.shown ? view.areaText.copy.body : null} />
      <AreaBlock catalogId={catalogId} view={view} actions={actions} run={run} pending={pending || busy} />
      <details className="rounded-lg border border-gold/15 bg-white/50 px-3 py-2" data-testid="text-more" open={!!(lead || highlights.length) || undefined}>
        <summary className="cursor-pointer text-xs text-ink/70">Más opciones (entrada y puntos de la versión anterior; no hacen falta para publicar)</summary>
        <label className="mt-2 block">
          <span className="crm-label-sm text-ink/70">Entrada (opcional, hasta 280 caracteres; abre la descripción)</span>
          <textarea
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            maxLength={280}
            rows={2}
            aria-label="Entrada"
            className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
          />
        </label>
        <fieldset className="mt-2">
          <legend className="crm-label-sm text-ink/70">Puntos verificados (hasta 3, literales de la ficha)</legend>
          {view.candidates.length === 0 ? (
            <p className="text-xs text-ink/50">La ficha no tiene características de la lista cerrada (terraza, ascensor, garaje…).</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {view.candidates.map((c) => {
                const on = highlights.includes(c);
                return (
                  <label key={c} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? "border-gold bg-gold/15" : "border-gold/25"}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && highlights.length >= 3}
                      onChange={() => setHighlights((h) => (on ? h.filter((x) => x !== c) : [...h, c]))}
                    />
                    {c}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </details>

      <CopyLibraryBlock
        catalogId={catalogId}
        view={view}
        actions={actions}
        run={run}
        pending={pending || busy}
        onUse={(lib) => {
          setValue({ title: lib.title ?? "", body: lib.body ?? "", lead: lib.lead ?? "" });
          setSess(() => ({ origin: "manual", check: null, confirmed: [], proposal: null }));
        }}
      />

      <div className="flex flex-wrap gap-2">
        {aiBusy ? (
          <>
            <span className="text-xs text-ink/60" role="status">
              La IA está {aiBusy === "prepare" ? "preparando el texto de la ficha" : "redactando un borrador"}…
            </span>
            <button type="button" onClick={cancelAi} className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-ink/80">
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => askAi("prepare")}
              disabled={pending || busy || !view.source.hasText}
              title={view.source.hasText ? undefined : "La ficha no tiene texto que preparar"}
              className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-ink/80 hover:bg-white disabled:opacity-50"
            >
              Preparar desde la ficha (IA)
            </button>
            <button
              type="button"
              onClick={() => askAi("draft")}
              disabled={pending || busy}
              className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-ink/80 hover:bg-white disabled:opacity-50"
            >
              Borrador con IA (título y descripción)
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-ink/50">
        La IA usa el proveedor ya configurado (Configuración → IA) solo cuando pulsas el botón. Propone un texto; nada se guarda ni se publica sin ti.
      </p>
      {proposal ? (
        <div className="rounded-lg bg-sky-50 px-2 py-1.5 text-xs text-sky-900" data-testid="ai-proposal">
          La IA ha terminado, pero has cambiado el texto mientras tanto: no se ha pisado.{" "}
          <button type="button" className="underline" onClick={() => applyProposal(proposal)}>
            Usar la propuesta
          </button>{" "}
          ·{" "}
          <button type="button" className="underline" onClick={() => setSess(() => ({ proposal: null }))}>
            Descartarla
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {check && (check.blockers.length || check.warnings.length) ? (
        <div className="space-y-1" data-testid="text-check">
          {check.blockers.map((b) => (
            <p key={`${b.code}-${b.where}`} className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800">
              No se puede publicar: {BLOCKER[b.code]} ({WHERE[b.where] ?? b.where}).
            </p>
          ))}
          {check.warnings.map((w) => (
            <label key={w.id} className="flex items-start gap-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <input
                type="checkbox"
                checked={confirmed.includes(w.id)}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSess((s) => ({ confirmed: on ? [...s.confirmed, w.id] : s.confirmed.filter((x) => x !== w.id) }));
                }}
                aria-label={`Confirmar: ${w.message}`}
              />
              <span>
                {w.message} <em>Corrígelo o marca «lo he comprobado».</em>
              </span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {view.published ? (
          <button
            type="button"
            onClick={() => run(() => actions.withdraw({ catalogId, propertyId: view.propertyId }), "Texto retirado. El borrador se conserva.", undefined, undefined, "retirada de texto")}
            disabled={pending || busy}
            className="rounded-lg px-3 py-1.5 text-xs text-ink/70 underline disabled:opacity-50"
          >
            Retirar lo publicado
          </button>
        ) : null}
        {view.draft || view.published ? (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("¿Borrar el texto de esta vivienda en este catálogo (borrador y publicado)? No se puede deshacer.")) return;
              run(() => actions.remove({ catalogId, propertyId: view.propertyId }), "Texto borrado.", resetAfterDelete, undefined, "borrado de texto");
            }}
            disabled={pending || busy}
            className="rounded-lg px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Borrar texto
          </button>
        ) : null}
        <a href={storyHref} className="ml-auto text-xs text-ink/60 underline" target="_blank" rel="noreferrer">
          Historia de la ficha (revisión aparte)
        </a>
      </div>
      <SidePanelFooter message={message}>
        <div className="flex w-full flex-wrap items-center gap-2" data-testid="text-actions">
        <button
          type="button"
          onClick={save}
          disabled={pending || busy || !dirty}
          className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Guardar borrador
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={pending || busy || !canPublish}
          title={dirty ? "Guarda el borrador antes de publicar" : pendingWarnings.length ? "Revisa los avisos antes de publicar" : undefined}
          className="rounded-lg border border-gold bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
        >
          Publicar
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink/70" title="Si la marcas, al publicar se guarda también como texto aprobado de la vivienda y se reutilizará al añadirla a catálogos nuevos. No la marques si el texto es personal para un cliente.">
          <input
            type="checkbox"
            checked={approveOnPublish}
            onChange={(e) => setApproveOnPublish(e.target.checked)}
            disabled={pending || busy}
            data-testid="text-approve-on-publish"
          />
          Guardar como texto aprobado de la vivienda
        </label>
        {edited ? (
          <span className="text-xs font-semibold text-amber-800" data-testid="text-unsaved">
            Cambios sin guardar
          </span>
        ) : dirty ? (
          <span className="text-xs text-ink/50">Aún sin guardar como borrador</span>
        ) : null}
        </div>
      </SidePanelFooter>
    </div>
  );
}

/** DE10 · Vista previa organizada EN VIVO con la misma función que el lector y
 *  el PDF (sin servidor ni IA), y las partes que quedan sin material. */
function StructurePreview({ body, lead, area, areaText = null }: { body: string; lead: string; area: string | null; areaText?: string | null }) {
  const organized = useMemo(() => {
    const l = lead.replace(/\s+/g, " ").trim();
    return organizeDescription({ lead: l && !body.includes(l) ? l : null, paragraphs: paragraphsOf(body), area, areaText });
  }, [body, lead, area, areaText]);
  if (!body.trim() && !lead.trim()) return null;
  return (
    <details open className="rounded-lg border border-gold/15 bg-white/50 px-3 py-2" data-testid="text-structure">
      <summary className="cursor-pointer text-xs text-ink/70">Así se verá en el lector y en el PDF (organizado automáticamente)</summary>
      <div className="mt-2 space-y-3">
        {organized.copy.map((b, i) => (
          <div key={i} data-testid={b.heading ? "structure-section" : "structure-intro"}>
            {b.heading ? <p className="crm-label-sm text-gold-dark">{b.heading}</p> : <p className="crm-label-sm text-ink/45">Introducción</p>}
            <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-ink/80">{b.text}</p>
          </div>
        ))}
        {organized.missing.length ? (
          <p className="text-xs text-amber-900" data-testid="structure-missing">
            Sin material sobre: {organized.missing.map((k) => SECTION_LABELS[k]).join(", ")}. Si la ficha lo sabe, añádelo; si no, se queda fuera (no se inventa).
          </p>
        ) : null}
      </div>
    </details>
  );
}

/** 0219 · «Texto aprobado de la vivienda»: la versión vigente de la
 *  biblioteca del dueño, aprobar lo publicado aquí, usarla en este catálogo
 *  (solo rellena el editor) y retirar partes. Nada cambia lo que ve el cliente. */
function CopyLibraryBlock({
  catalogId,
  view,
  actions,
  run,
  pending,
  onUse,
}: {
  catalogId: string;
  view: CatalogTextView;
  actions: TextActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
  onUse: (lib: NonNullable<CatalogTextView["library"]>) => void;
}) {
  const lib = view.library;
  const pub = view.published ? { title: view.published.title, body: view.published.body, lead: view.published.lead } : null;
  const same = publishedMatchesLibrary(pub ?? { title: null, body: null, lead: null }, lib);
  const pubParts = pub ? approvableParts(pub) : null;
  // Lo publicado que aún NO es el texto aprobado (una descripción no vigente no se ofrece: C2).
  const pendingParts: CopyParts | null = (() => {
    if (!pub || !pubParts) return null;
    const t = !!pub.title && !same.title;
    const b = !!(pub.body || pub.lead) && !same.body && view.published?.current === true;
    return t && b ? "both" : t ? "title" : b ? "body" : null;
  })();
  const approve = (parts: CopyParts) =>
    run(() => actions.approveCopy({ catalogId, propertyId: view.propertyId, parts }), `Guardado como texto aprobado de la vivienda (${partsLabel(parts)}).`, undefined, undefined, "texto aprobado");
  const withdraw = (part: CopyPart) => {
    const what = part === "all" ? "el texto aprobado" : part === "title" ? "el título aprobado" : "la descripción aprobada";
    if (!window.confirm(`¿Retirar ${what} de esta vivienda? Los catálogos que ya lo usan no cambian; solo deja de copiarse a catálogos nuevos.`)) return;
    run(() => actions.withdrawCopy({ catalogId, propertyId: view.propertyId, part }), "Retirado del texto aprobado. Ningún catálogo ha cambiado.", undefined, undefined, "texto aprobado");
  };
  if (!lib && !pendingParts) return null;
  return (
    <section className="space-y-2 rounded-lg border border-gold/20 bg-cream-50/60 px-3 py-2" data-testid="copy-library">
      <p className="crm-label-sm text-ink/70">Texto aprobado de la vivienda</p>
      {lib ? (
        <>
          <p className="text-xs text-ink/60" data-testid="copy-library-version">
            Versión {lib.seq}. Se copia sola al añadir esta vivienda a un catálogo nuevo; los catálogos ya creados no cambian.
          </p>
          {lib.title ? (
            <p className="text-xs text-ink/80">
              <span className="text-ink/50">Título:</span> <strong>{lib.title}</strong>
              {lib.titleCatalogTitle ? <span className="text-ink/45"> · de «{lib.titleCatalogTitle}»</span> : null}
            </p>
          ) : null}
          {lib.body || lib.lead ? (
            <p className="line-clamp-3 text-xs text-ink/80">
              <span className="text-ink/50">Descripción:</span> {[lib.lead, lib.body].filter(Boolean).join(" ")}
              {lib.bodyCatalogTitle ? <span className="text-ink/45"> · de «{lib.bodyCatalogTitle}»</span> : null}
            </p>
          ) : null}
          {lib.bodyCurrent === false ? (
            <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="copy-library-stale">
              Revisar: desde que se aprobó la descripción cambió {changedLabel(lib.changed) || "la ficha"}. Al copiarla a un catálogo nuevo no se verá hasta que la revises y la publiques.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" disabled={pending} onClick={() => onUse(lib)} className="rounded-lg border border-gold/40 px-2.5 py-1 text-ink/80 hover:bg-white disabled:opacity-50" data-testid="copy-library-use">
              Usar en este catálogo
            </button>
            {lib.title ? (
              <button type="button" disabled={pending} onClick={() => withdraw("title")} className="rounded-lg px-2 py-1 text-ink/60 underline disabled:opacity-50">
                Retirar título
              </button>
            ) : null}
            {lib.body || lib.lead ? (
              <button type="button" disabled={pending} onClick={() => withdraw("body")} className="rounded-lg px-2 py-1 text-ink/60 underline disabled:opacity-50">
                Retirar descripción
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-ink/60">Esta vivienda aún no tiene texto aprobado. Lo publicado aquí solo vale para este catálogo.</p>
      )}
      {pendingParts ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => approve(pendingParts)}
          className="rounded-lg border border-gold/40 bg-white px-2.5 py-1 text-xs text-ink/80 hover:bg-cream-50 disabled:opacity-50"
          data-testid="copy-library-approve"
        >
          Aprobar lo publicado aquí ({partsLabel(pendingParts)})
        </button>
      ) : null}
    </section>
  );
}

const AREA_STATUS: Record<NonNullable<CatalogTextView["zone"]>["suggestion"]["status"], string> = {
  auto: "Sugerida",
  ambigua: "Zona por confirmar",
  conflicto: "Zona por confirmar",
  sin_clasificar: "Sin clasificar",
};

/** 0220 · Zona de la vivienda (DA23, DA37). La sugerencia nunca se aplica
 *  sola: hasta que el dueño la confirma, «Vivir en …» usa la zona de la ficha
 *  como siempre. Confirmar vale para todos sus catálogos y no toca el CRM. */
function AreaBlock({
  catalogId,
  view,
  actions,
  run,
  pending,
}: {
  catalogId: string;
  view: CatalogTextView;
  actions: TextActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
}) {
  const z = view.zone;
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState<string>("");
  if (!z) return null;
  const sug = z.suggestion;
  const suggested = sug.areaId ? areaById(sug.areaId) : null;
  const decided = z.decision;
  const decidedArea = decided?.areaId ? areaById(decided.areaId) : null;
  const confirm = (areaId: string | null) => {
    const what = areaId ? `«Vivir en ${areaById(areaId)?.name ?? ""}»` : "«El barrio»";
    run(() => actions.confirmArea({ catalogId, propertyId: view.propertyId, areaId }), `Zona confirmada: el apartado se llama ${what} en todos tus catálogos.`, () => setChoosing(false), undefined, "zona");
  };
  const clear = () =>
    run(() => actions.clearArea({ catalogId, propertyId: view.propertyId }), "Confirmación quitada: vuelve la zona de la ficha.", undefined, undefined, "zona");
  const heading = z.living ? `«Vivir en ${z.living}»` : "«El barrio»";
  const btn = "rounded-lg border border-gold/40 bg-white px-2.5 py-1 text-ink/80 hover:bg-cream-50 disabled:opacity-50";
  return (
    <section className="space-y-2 rounded-lg border border-gold/20 bg-cream-50/60 px-3 py-2 text-xs" data-testid="area-block">
      <p className="crm-label-sm text-ink/70">Zona de la vivienda</p>
      {z.verified ? (
        <p className="text-ink/80" data-testid="area-confirmed">
          Confirmada: <strong>{decidedArea ? areaLabel(decidedArea) : "sin zona verificada"}</strong>. El apartado se llama {heading} en todos tus catálogos.
        </p>
      ) : (
        <>
          {decided && !decided.current ? (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-900" data-testid="area-stale">
              Revisar: la zona, el barrio o la dirección de la ficha cambiaron desde que confirmaste {decidedArea ? areaLabel(decidedArea) : "«sin zona verificada»"}. Mientras tanto se usa la zona de la ficha.
            </p>
          ) : null}
          <p className="text-ink/60" data-testid="area-today">
            Hoy el apartado se llama {heading}, con la zona de la ficha sin verificar.
          </p>
          <p className={sug.status === "auto" ? "text-ink/80" : "rounded bg-amber-50 px-2 py-1 text-amber-900"} data-testid={`area-suggestion-${sug.status}`}>
            <strong>{AREA_STATUS[sug.status]}</strong>
            {suggested ? <>: {areaLabel(suggested)}</> : null}. {sug.reason}
          </p>
        </>
      )}
      {choosing ? (
        <div className="flex flex-wrap items-center gap-2">
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="rounded-lg border border-gold/30 bg-white px-2 py-1 text-xs" data-testid="area-select" aria-label="Zona de la vivienda">
            <option value="">Elige una zona…</option>
            <option value="__none__">Sin zona verificada («El barrio»)</option>
            {areaOptions().map(({ district, barrios }) => (
              <optgroup key={district.id} label={district.name}>
                <option value={district.id}>{district.name} (todo el distrito)</option>
                {barrios.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" disabled={pending || !choice} onClick={() => confirm(choice === "__none__" ? null : choice)} className={btn} data-testid="area-save">
            Guardar zona
          </button>
          <button type="button" disabled={pending} onClick={() => setChoosing(false)} className="rounded-lg px-2 py-1 text-ink/60 underline">
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!z.verified && suggested ? (
            <button type="button" disabled={pending} onClick={() => confirm(suggested.id)} className={btn} data-testid="area-confirm">
              Confirmar {suggested.name}
            </button>
          ) : null}
          <button type="button" disabled={pending} onClick={() => { setChoice(z.verified ? decided?.areaId ?? "__none__" : sug.areaId ?? ""); setChoosing(true); }} className={btn} data-testid="area-change">
            {z.verified ? "Cambiar" : suggested ? "Elegir otra" : "Elegir zona"}
          </button>
          {!z.verified ? (
            <button type="button" disabled={pending} onClick={() => confirm(null)} className="rounded-lg px-2 py-1 text-ink/60 underline disabled:opacity-50" data-testid="area-none">
              Sin zona verificada
            </button>
          ) : null}
          {decided ? (
            <button type="button" disabled={pending} onClick={clear} className="rounded-lg px-2 py-1 text-ink/60 underline disabled:opacity-50" data-testid="area-clear">
              Quitar confirmación
            </button>
          ) : null}
        </div>
      )}
      <AreaTextPart catalogId={catalogId} view={view} actions={actions} run={run} pending={pending} />
    </section>
  );
}

/** 0222 · Plantilla «Vivir en…» de este catálogo. Solo con la zona
 *  confirmada (DA37); entra en el lector solo si el texto propio no habla ya
 *  de la zona (DA25). Actualizar la plantilla no cambia esta copia (DA27). */
function AreaTextPart({
  catalogId,
  view,
  actions,
  run,
  pending,
}: {
  catalogId: string;
  view: CatalogTextView;
  actions: TextActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
}) {
  const at = view.areaText;
  if (!at) return null;
  const { copy, available } = at;
  const apply = (msg: string) => run(() => actions.applyAreaText({ catalogId, propertyId: view.propertyId }), msg, undefined, undefined, "plantilla de zona");
  const remove = () => {
    if (!window.confirm("¿Quitar la plantilla de la zona de este catálogo? La plantilla sigue en tu biblioteca.")) return;
    run(() => actions.removeAreaText({ catalogId, propertyId: view.propertyId }), "Plantilla quitada de este catálogo.", undefined, undefined, "plantilla de zona");
  };
  const newer = !!copy && !!available && copy.versionId !== available.versionId;
  const btn = "rounded-lg border border-gold/40 bg-white px-2.5 py-1 text-ink/80 hover:bg-cream-50 disabled:opacity-50";
  if (!copy && !available) {
    return view.zone?.verified ? (
      <p className="border-t border-gold/15 pt-2 text-ink/55" data-testid="area-text-none">
        No hay plantilla aprobada para esta zona. Puedes prepararla en «Mi espacio → Plantillas de zona».
      </p>
    ) : null;
  }
  return (
    <div className="space-y-1.5 border-t border-gold/15 pt-2" data-testid="area-text">
      <p className="crm-label-sm text-ink/60">Plantilla «Vivir en…»</p>
      {copy ? (
        <>
          <p className="text-ink/80" data-testid="area-text-copy">
            Aplicada en este catálogo: {areaTextLabel(copy.areaId)}
            {copy.seq ? `, versión ${copy.seq}` : ""}. Solo se ve si la descripción no habla ya de la zona.
          </p>
          <p className="line-clamp-3 text-ink/60">{copy.body}</p>
          {!copy.shown ? (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-900" data-testid="area-text-hidden">
              No se ve: la zona confirmada de la vivienda ya no es {areaTextLabel(copy.areaId)} o no está vigente.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-ink/80" data-testid="area-text-available">
          Disponible: {areaTextLabel(available!.areaId)}, versión {available!.seq}. Se guarda una copia en este catálogo; si después cambias la plantilla, este catálogo no cambia.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!copy && available ? (
          <button type="button" disabled={pending} onClick={() => apply("Plantilla aplicada en este catálogo.")} className={btn} data-testid="area-text-apply">
            Aplicar plantilla
          </button>
        ) : null}
        {newer ? (
          <button type="button" disabled={pending} onClick={() => apply(`Plantilla actualizada a la versión ${available!.seq} en este catálogo.`)} className={btn} data-testid="area-text-update">
            Usar la versión {available!.seq}
          </button>
        ) : null}
        {copy ? (
          <button type="button" disabled={pending} onClick={remove} className="rounded-lg px-2 py-1 text-ink/60 underline disabled:opacity-50" data-testid="area-text-remove">
            Quitar plantilla
          </button>
        ) : null}
      </div>
    </div>
  );
}
