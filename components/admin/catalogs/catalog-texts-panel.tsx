"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { DraftCheck, DraftProposal } from "@/lib/catalogs/ai-draft";
import type { CatalogTextView } from "@/lib/catalogs/texts";
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
//   · Editor: entrada, texto completo y hasta 3 puntos verificados.
//   · IA solo al pulsar: devuelve una PROPUESTA; si el texto cambió mientras
//     tanto, no se pisa (se ofrece «Usar la propuesta»). Nunca publica.
//   · Publicar: sin contacto, URL ni precio, y cada aviso corregido o
//     confirmado. Si la ficha cambia, lo publicado deja de verse y aquí se
//     dice qué cambió; el texto se conserva para revisarlo.
// E2: la lista vive en manager/content-section.tsx; aquí quedan el editor
// (controlado por el almacén de borradores del gestor) y sus tipos.

type Res = ActionResult<{ version: number; fingerprint?: string | null; publicChange?: boolean }>;
type Proposal = ActionResult<{ proposal: DraftProposal; check: DraftCheck }>;
type JourneyPreview = { lead: string | null; highlights: string[]; sections: Array<{ heading: string | null; text: string; photo: boolean }>; words: number };
type Preview = ActionResult<{ preview: JourneyPreview; check: DraftCheck }>;

export interface TextActions {
  prepare: (i: { catalogId: string; propertyId: string }) => Promise<Proposal>;
  draft: (i: { catalogId: string; propertyId: string }) => Promise<Proposal>;
  save: (i: {
    catalogId: string;
    propertyId: string;
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
  preview: (i: { catalogId: string; propertyId: string; body: string | null; lead: string | null; highlights: string[] }) => Promise<Preview>;
}

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

type TextSession = {
  origin: "manual" | "ai_clean" | "ai_draft";
  check: DraftCheck | null;
  confirmed: string[];
  proposal: DraftProposal | null;
  preview: JourneyPreview | null;
};
const EMPTY_SESSION: TextSession = { origin: "manual", check: null, confirmed: [], proposal: null, preview: null };
const EMPTY_KEY = textKey({ lead: null, body: null, highlights: [] });

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
  const { body, lead, highlights } = value;
  const currentValue = () => draftsStore.draft<TextDraft>(catalogId, dKey)?.value ?? shownTextOf(view);
  const setValue = (patch: Partial<TextRaw>) =>
    draftsStore.updateDraft<TextDraft>(catalogId, dKey, (prev) => editTextDraft(prev, view, { ...(prev ? prev.value : shownTextOf(view)), ...patch }));
  const setBody = (v: string) => setValue({ body: v });
  const setLead = (v: string) => setValue({ lead: v });
  const setHighlights = (fn: (h: string[]) => string[]) => setValue({ highlights: fn(currentValue().highlights) });

  const savedKey = d ? d.saved.key : savedNow.key;
  const rev = d ? d.saved.rev : savedNow.rev;
  const { check, confirmed, proposal, preview, origin } = sess;
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<null | "prepare" | "draft">(null);
  const [busy, start] = useTransition();
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
    const snapshot = { body, lead };
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
      if (cur.body !== snapshot.body || cur.lead !== snapshot.lead) {
        setSess(() => ({ proposal: r.proposal }));
        return;
      }
      applyProposal(r.proposal, r.check);
    });
  }

  function applyProposal(p: DraftProposal, c?: DraftCheck) {
    setValue(p.lead ? { body: p.body, lead: p.lead } : { body: p.body });
    setSess(() => ({ origin: p.origin, proposal: null, confirmed: [], ...(c ? { check: c } : {}) }));
  }

  // Al abrir un borrador ya guardado, su comprobación (solo lectura, sin IA):
  // los avisos y bloqueos se ven siempre, no solo justo después de guardar.
  // Si la sesión ya la tiene (editor reabierto), no se vuelve a pedir.
  useEffect(() => {
    const saved = view.draft;
    if (sess.check || !saved || !(saved.body || saved.lead)) return;
    let alive = true;
    actions
      .preview({ catalogId, propertyId: view.propertyId, body: saved.body, lead: saved.lead, highlights: saved.highlights })
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

  function showPreview() {
    setError(null);
    start(async () => {
      const r = await actions.preview({ catalogId, propertyId: view.propertyId, body: body.trim() || null, lead: lead.trim() || null, highlights });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSess(() => ({ preview: r.preview, check: r.check }));
    });
  }

  return (
    <div className="space-y-3" data-testid="text-editor">
      {d?.conflict ? (
        <div role="status" className="space-y-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900" data-testid="text-conflict">
          <p className="font-semibold">El borrador guardado cambió (en otra pestaña o con otra acción). Tus cambios siguen aquí y no se han guardado.</p>
          <p>
            Guardado ahora: {d.conflict.raw.lead ? <em>{d.conflict.raw.lead} </em> : null}
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
          Lo publicado ya no se muestra: cambió {view.published.changed.join(", ") || "la ficha"}. Revísalo y vuelve a publicar; mientras tanto el cliente ve{" "}
          {view.level === "story" ? "la historia aprobada" : view.level === "clean" ? "la descripción limpia" : "solo datos y fotos"}.
        </p>
      ) : null}
      <label className="block">
        <span className="crm-label-sm text-ink/70">Entrada (opcional, hasta 280 caracteres)</span>
        <textarea
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          maxLength={280}
          rows={2}
          aria-label="Entrada"
          className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
      </label>
      <label className="block">
        <span className="crm-label-sm text-ink/70">Texto completo (hasta 6.000 caracteres)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={6000}
          rows={8}
          aria-label="Texto completo"
          className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
      </label>
      <fieldset>
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
              Borrador con IA
            </button>
          </>
        )}
        <button type="button" onClick={showPreview} disabled={pending || busy} className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-ink/80 hover:bg-white disabled:opacity-50">
          Ver recorrido
        </button>
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
              No se puede publicar: {BLOCKER[b.code]} ({b.where === "body" ? "texto" : b.where === "lead" ? "entrada" : "puntos"}).
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

      {preview ? (
        <div className="space-y-1 rounded-lg border border-gold/20 bg-white p-2 text-xs text-ink/70" data-testid="text-preview">
          <p>
            <strong>Entrada:</strong> {preview.lead ?? "—"}
          </p>
          <p>
            <strong>Puntos:</strong> {preview.highlights.join(" · ") || "—"}
          </p>
          <p>
            <strong>Recorrido:</strong> {preview.sections.length} sección{preview.sections.length === 1 ? "" : "es"} ·{" "}
            {preview.sections.filter((s) => s.photo).length} con foto · {preview.words} palabras
          </p>
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
          onClick={() =>
            run(() => actions.publish({ catalogId, propertyId: view.propertyId, expectedRev: rev ?? 0, confirmed }), "Texto publicado: el cliente ya lo ve.", undefined, undefined, "publicación")
          }
          disabled={pending || busy || !canPublish}
          title={dirty ? "Guarda el borrador antes de publicar" : pendingWarnings.length ? "Revisa los avisos antes de publicar" : undefined}
          className="rounded-lg border border-gold bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
        >
          Publicar
        </button>
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
