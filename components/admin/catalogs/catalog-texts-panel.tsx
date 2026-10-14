"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { DraftCheck, DraftProposal } from "@/lib/catalogs/ai-draft";
import type { CatalogTextView } from "@/lib/catalogs/texts";

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

const LEVEL: Record<CatalogTextView["level"], string> = {
  text: "Texto del catálogo",
  story: "Historia aprobada",
  clean: "Descripción limpia de la ficha",
  facts: "Solo datos y fotos",
};
const CLEAN: Record<CatalogTextView["source"]["clean"], string> = {
  none: "Sin versión limpia para clientes",
  stale: "Versión limpia caducada (la ficha cambió)",
  current: "Versión limpia vigente",
  empty: "La ficha no tiene texto",
};
const STORY: Record<CatalogTextView["source"]["story"], string> = {
  none: "Sin historia",
  pending: "Historia pendiente de revisar",
  current: "Historia aprobada vigente",
  stale: "Historia aprobada no vigente (la ficha cambió)",
};
const BLOCKER: Record<string, string> = {
  text_has_contact: "Tiene un teléfono, un correo o una web",
  text_has_price: "Menciona un precio (el precio ya se ve aparte y se actualiza solo)",
};

function TextEditor({
  catalogId,
  view,
  actions,
  run,
  pending,
  storyHref,
}: {
  catalogId: string;
  view: CatalogTextView;
  actions: TextActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
  storyHref: string;
}) {
  const saved = view.draft;
  const [body, setBody] = useState(saved?.body ?? view.published?.body ?? "");
  const [lead, setLead] = useState(saved?.lead ?? view.published?.lead ?? "");
  const [highlights, setHighlights] = useState<string[]>(saved?.highlights ?? view.published?.highlights ?? []);
  const [origin, setOrigin] = useState<"manual" | "ai_clean" | "ai_draft">("manual");
  const [rev, setRev] = useState<number | null>(saved ? saved.rev : null);
  const [base, setBase] = useState({ body: saved?.body ?? "", lead: saved?.lead ?? "", highlights: (saved?.highlights ?? []).join("\n") });
  const [check, setCheck] = useState<DraftCheck | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [proposal, setProposal] = useState<DraftProposal | null>(null);
  const [preview, setPreview] = useState<JourneyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<null | "prepare" | "draft">(null);
  const [busy, start] = useTransition();
  const req = useRef(0);
  // Valores ACTUALES del editor (para saber si cambiaron mientras la IA trabajaba).
  const current = useRef({ body, lead });
  current.current = { body, lead };

  const dirty = body !== base.body || lead !== base.lead || highlights.join("\n") !== base.highlights;
  const hasSaved = rev !== null && (base.body || base.lead);
  const pendingWarnings = (check?.warnings ?? []).filter((w) => !confirmed.includes(w.id));
  const canPublish = !!hasSaved && !dirty && (check?.blockers.length ?? 0) === 0 && pendingWarnings.length === 0;

  function askAi(kind: "prepare" | "draft") {
    setError(null);
    const id = ++req.current;
    const snapshot = { ...current.current };
    setAiBusy(kind);
    (kind === "prepare" ? actions.prepare : actions.draft)({ catalogId, propertyId: view.propertyId }).then((r) => {
      if (id !== req.current) return; // cancelada o sustituida: se ignora
      setAiBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Si el texto cambió mientras la IA trabajaba, no se pisa.
      if (current.current.body !== snapshot.body || current.current.lead !== snapshot.lead) {
        setProposal(r.proposal);
        return;
      }
      applyProposal(r.proposal, r.check);
    });
  }

  function applyProposal(p: DraftProposal, c?: DraftCheck) {
    setBody(p.body);
    if (p.lead) setLead(p.lead);
    setOrigin(p.origin);
    setProposal(null);
    if (c) setCheck(c);
    setConfirmed([]);
  }

  // Al abrir un borrador ya guardado, su comprobación (solo lectura, sin IA):
  // los avisos y bloqueos se ven siempre, no solo justo después de guardar.
  useEffect(() => {
    if (!saved || !(saved.body || saved.lead)) return;
    let alive = true;
    actions
      .preview({ catalogId, propertyId: view.propertyId, body: saved.body, lead: saved.lead, highlights: saved.highlights })
      .then((r) => {
        if (alive && r.ok) setCheck((c) => c ?? r.check);
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
    setBody("");
    setLead("");
    setHighlights([]);
    setRev(null);
    setBase({ body: "", lead: "", highlights: "" });
    setCheck(null);
    setConfirmed([]);
    setPreview(null);
    setOrigin("manual");
  }

  function cancelAi() {
    req.current++;
    setAiBusy(null);
  }

  function save() {
    run(
      async () => {
        const r = await actions.save({
          catalogId,
          propertyId: view.propertyId,
          body: body.trim() || null,
          lead: lead.trim() || null,
          highlights,
          origin,
          expectedRev: rev,
        });
        if (r.ok) {
          setRev(r.rev);
          setBase({ body, lead, highlights: highlights.join("\n") });
          setCheck(r.check);
          setConfirmed((c) => c.filter((id) => r.check.warnings.some((w) => w.id === id)));
          setOrigin("manual");
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
      setPreview(r.preview);
      setCheck(r.check);
    });
  }

  return (
    <div className="space-y-3 border-t border-gold/15 pt-3" data-testid="text-editor">
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
          <button type="button" className="underline" onClick={() => setProposal(null)}>
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
                onChange={(e) => setConfirmed((c) => (e.target.checked ? [...c, w.id] : c.filter((x) => x !== w.id)))}
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
        <button
          type="button"
          onClick={save}
          disabled={pending || busy || !dirty}
          className="rounded-lg bg-gold/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
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
          className="rounded-lg border border-gold bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
        >
          Publicar
        </button>
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
        {dirty ? <span className="text-xs text-ink/50">Cambios sin guardar</span> : null}
        <a href={storyHref} className="ml-auto text-xs text-ink/60 underline" target="_blank" rel="noreferrer">
          Historia de la ficha (revisión aparte)
        </a>
      </div>
    </div>
  );
}

export function CatalogTextsPanel({
  catalogId,
  texts,
  actions,
  run,
  pending,
  storyHref,
}: {
  catalogId: string;
  texts: CatalogTextView[];
  actions: TextActions;
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
  storyHref: (slug: string) => string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const inList = texts.filter((t) => t.inList);
  const reserve = texts.filter((t) => !t.inList);

  function row(t: CatalogTextView) {
    const state = t.published
      ? t.published.current
        ? "Texto publicado"
        : `Publicado · revisar (cambió ${t.published.changed.join(", ") || "la ficha"})`
      : t.draft && (t.draft.body || t.draft.lead)
        ? "Borrador sin publicar"
        : "Sin texto propio";
    return (
      <li key={t.propertyId} className="rounded-xl border border-gold/15 bg-white/60 p-3" data-testid="text-row" data-check-overflow="texto">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-48">
            <p className="crm-body-strong text-ink">
              {t.bcReference ? <span className="mr-2 text-xs text-ink/45">{t.bcReference}</span> : null}
              {t.title}
            </p>
            <p className="text-xs text-ink/60" data-testid="text-level">
              El cliente ve: <strong>{LEVEL[t.level]}</strong> · {CLEAN[t.source.clean]} · {STORY[t.source.story]}
            </p>
            <p className={`text-xs ${t.published && !t.published.current ? "text-amber-800" : "text-ink/60"}`} data-testid="text-state">
              {state}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(open === t.propertyId ? null : t.propertyId)}
            className="shrink-0 rounded-lg border border-gold/40 px-3 py-1 text-xs text-ink/80 hover:bg-white"
            aria-expanded={open === t.propertyId}
            aria-label={`${open === t.propertyId ? "Cerrar" : "Editar"} el texto de «${t.title}»`}
          >
            {open === t.propertyId ? "Cerrar" : "Editar texto"}
          </button>
        </div>
        {open === t.propertyId ? (
          <TextEditor
            key={t.propertyId}
            catalogId={catalogId}
            view={t}
            actions={actions}
            run={run}
            pending={pending}
            storyHref={storyHref(t.slug)}
          />
        ) : null}
      </li>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-gold/20 bg-white/40 p-3" aria-labelledby="ct-title" data-testid="texts-panel">
      <div>
        <h3 id="ct-title" className="crm-label-sm text-ink/70">
          Textos de las viviendas
        </h3>
        <p className="text-xs text-ink/55">
          Solo para este catálogo: la ficha de la propiedad no cambia. Manda el texto publicado aquí; si no hay, la historia aprobada; si no, la
          descripción limpia; si no, solo datos y fotos.
        </p>
      </div>
      {inList.length === 0 ? <p className="text-xs text-ink/50">Este catálogo todavía no tiene viviendas.</p> : <ul className="space-y-2">{inList.map(row)}</ul>}
      {reserve.length ? (
        <div className="space-y-2" data-testid="texts-reserve">
          <h4 className="crm-label-sm text-ink/60">Textos en reserva ({reserve.length})</h4>
          <p className="text-xs text-ink/50">Viviendas que ya no están en la lista: su texto se conserva por si vuelven. Bórralo solo si ya no lo quieres.</p>
          <ul className="space-y-2">{reserve.map(row)}</ul>
        </div>
      ) : null}
    </section>
  );
}
