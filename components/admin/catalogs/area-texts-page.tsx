"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import { areaById, areaLabel, areaOptions } from "@/lib/catalogs/areas";
import { AREA_TEXT_MAX, areaTextBlockers, areaTextLabel, areaTextWarnings, type AreaTextEntry, type SeedPlan } from "@/lib/catalogs/area-texts";

// «Plantillas de zona» de la HOME (0222, PR3): la descripción GENERAL de cada
// zona para «Vivir en…». Los borradores se traen de los textos de barrios del
// SmartLink (sin IA) o se escriben a mano; «Borrador con IA» solo al pulsar.
// Nada se aprueba solo, y aprobar o retirar no cambia ningún catálogo: cada
// catálogo guarda SU copia al aplicar la plantilla desde su editor (DA27).

export interface AreaTextsData {
  entries: AreaTextEntry[];
  seed: SeedPlan;
}

type Res<T extends object = object> = ActionResult<T>;

export interface AreaTextsActions {
  reload: () => Promise<Res<AreaTextsData>>;
  saveDraft: (i: { areaId: string; body: string; origin?: "manual" | "ai_draft" }) => Promise<Res<{ seq: number }>>;
  approve: (i: { areaId: string; body: string }) => Promise<Res<{ seq: number }>>;
  retire: (i: { areaId: string }) => Promise<Res<{ changed: boolean }>>;
  discard: (i: { areaId: string }) => Promise<Res<{ changed: boolean }>>;
  seed: () => Promise<Res<{ created: number; skipped: number }>>;
  aiDraft: (i: { areaId: string }) => Promise<Res<{ body: string }>>;
}

const ORIGIN: Record<string, string> = {
  neighborhoods: "Traído de los textos de barrios",
  manual: "Escrito a mano",
  ai_draft: "Borrador con IA",
};

export function AreaTextsPage({ initial, actions }: { initial: AreaTextsData; actions: AreaTextsActions }) {
  const [data, setData] = useState(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [newArea, setNewArea] = useState("");
  const [opened, setOpened] = useState<string[]>([]);

  const entries = useMemo(() => {
    const by = new Map(data.entries.map((e) => [e.areaId, e]));
    for (const id of opened) if (!by.has(id)) by.set(id, { areaId: id, draft: null, approved: null });
    return [...by.values()].sort((a, b) => areaTextLabel(a.areaId).localeCompare(areaTextLabel(b.areaId), "es"));
  }, [data.entries, opened]);

  function act<T extends object>(fn: () => Promise<Res<T>>, ok: (r: T) => string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg({ kind: "error", text: r.error });
      else setMsg({ kind: "ok", text: ok(r as T) });
      const d = await actions.reload();
      if (d.ok) setData({ entries: d.entries, seed: d.seed });
    });
  }

  const seedN = data.seed.items.length;
  return (
    <div className="space-y-6" data-testid="area-texts-page">
      <p className="max-w-3xl text-sm text-ink/70">
        Descripción general de cada zona para el apartado «Vivir en…» del lector. Describe la zona, no la vivienda: sin distancias, vistas, servicios del
        edificio ni estancias. Se aplica vivienda a vivienda desde el editor de cada catálogo, con la zona ya confirmada, y solo se ve si la descripción
        propia no habla ya de la zona. Cambiar o retirar una plantilla no cambia los catálogos que ya la usan.
      </p>
      {msg ? (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`} data-testid="area-texts-msg">
          {msg.text}
        </p>
      ) : null}

      <section className="space-y-2 rounded-xl border border-gold/25 bg-white/60 px-4 py-3" data-testid="area-texts-seed">
        <h2 className="crm-label-sm text-ink/70">Textos de barrios del SmartLink</h2>
        {seedN ? (
          <>
            <p className="text-sm text-ink/75">
              Hay {seedN} {seedN === 1 ? "texto" : "textos"} de barrios que se pueden traer como <strong>borradores</strong> para revisarlos. No se aprueba nada y no se usa IA.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => actions.seed(), (r) => `${r.created} ${r.created === 1 ? "borrador traído" : "borradores traídos"}. Revísalos antes de aprobarlos.`)}
              className="rounded-lg border border-gold/45 bg-white px-3 py-1.5 text-sm text-ink hover:bg-cream-50 disabled:opacity-50"
              data-testid="area-texts-seed-btn"
            >
              Traer {seedN} {seedN === 1 ? "borrador" : "borradores"}
            </button>
          </>
        ) : (
          <p className="text-sm text-ink/60">No queda ningún texto de barrio por traer.</p>
        )}
        {data.seed.unmapped.length ? (
          <details className="text-xs text-ink/60">
            <summary className="cursor-pointer">No se traen ({data.seed.unmapped.length}): no son una zona del registro de Madrid</summary>
            <ul className="mt-1 list-disc pl-5">
              {data.seed.unmapped.map((u) => (
                <li key={u.key}>
                  {u.name}: {u.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="flex flex-wrap items-center gap-2" data-testid="area-texts-new">
        <select value={newArea} onChange={(e) => setNewArea(e.target.value)} className="rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm" aria-label="Zona" data-testid="area-texts-new-select">
          <option value="">Nueva plantilla para…</option>
          {areaOptions().map(({ district, barrios }) => (
            <optgroup key={district.id} label={district.name}>
              <option value={district.id}>{district.name} (distrito)</option>
              {barrios.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          disabled={!newArea}
          onClick={() => {
            setOpened((o) => (o.includes(newArea) ? o : [...o, newArea]));
            setNewArea("");
          }}
          className="rounded-lg border border-gold/40 bg-white px-3 py-1.5 text-sm text-ink/80 disabled:opacity-50"
          data-testid="area-texts-new-btn"
        >
          Preparar
        </button>
      </section>

      {entries.length ? (
        <ul className="space-y-3">
          {entries.map((e) => (
            <AreaTextCard key={`${e.areaId}:${e.draft?.id ?? ""}:${e.approved?.id ?? ""}`} entry={e} pending={pending} actions={actions} act={act} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink/60">Aún no hay plantillas.</p>
      )}
    </div>
  );
}

function AreaTextCard({
  entry,
  pending,
  actions,
  act,
}: {
  entry: AreaTextEntry;
  pending: boolean;
  actions: AreaTextsActions;
  act: <T extends object>(fn: () => Promise<Res<T>>, ok: (r: T) => string) => void;
}) {
  const area = areaById(entry.areaId);
  const saved = entry.draft?.body ?? null;
  const [text, setText] = useState<string | null>(saved);
  const [origin, setOrigin] = useState<"manual" | "ai_draft">(entry.draft?.origin === "ai_draft" ? "ai_draft" : "manual");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const editing = text !== null;
  const dirty = editing && text !== saved;
  const value = text ?? "";
  const blockers = areaTextBlockers(value);
  const warnings = areaTextWarnings(value);
  const label = area ? areaLabel(area) : entry.areaId;

  function approve() {
    if (!saved) return;
    const w = areaTextWarnings(saved);
    if (w.length && !window.confirm(`Revisa antes de aprobar:\n${w.map((x) => `· ${x.label}: «…${x.excerpt}…»`).join("\n")}\n\nUna plantilla describe la zona en general. ¿Aprobarla así?`)) return;
    act(() => actions.approve({ areaId: entry.areaId, body: saved }), (r) => `Plantilla de ${label} aprobada (versión ${r.seq}). Los catálogos que ya tenían otra no cambian.`);
  }
  function ai() {
    setAiBusy(true);
    setAiError(null);
    actions.aiDraft({ areaId: entry.areaId }).then((r) => {
      setAiBusy(false);
      if (!r.ok) setAiError(r.error);
      else {
        setText(r.body);
        setOrigin("ai_draft");
      }
    });
  }

  return (
    <li className="space-y-2 rounded-xl border border-gold/25 bg-white/70 px-4 py-3" data-testid="area-text-card" data-area-id={entry.areaId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="crm-body-strong text-ink">{label}</h3>
        <span className="text-xs text-ink/55" data-testid="area-text-card-state">
          {entry.approved ? `Aprobada · versión ${entry.approved.seq}` : "Sin plantilla aprobada"}
          {entry.draft ? ` · borrador (${ORIGIN[entry.draft.origin] ?? entry.draft.origin})` : ""}
        </span>
      </div>
      {entry.approved && !editing ? <p className="whitespace-pre-line text-sm text-ink/80">{entry.approved.body}</p> : null}
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={value}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={AREA_TEXT_MAX}
            className="w-full rounded-lg border border-gold/30 bg-white px-3 py-2 text-sm"
            aria-label={`Texto de ${label}`}
            data-testid="area-text-body"
          />
          {blockers.length ? (
            <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-900" data-testid="area-text-blocker">
              No se puede guardar: {blockers.includes("text_has_contact") ? "tiene un teléfono, un correo o una web" : "menciona un precio"}.
            </p>
          ) : null}
          {warnings.length ? (
            <ul className="space-y-0.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="area-text-warnings">
              {warnings.map((w) => (
                <li key={w.id}>
                  Revisar · {w.label}: «…{w.excerpt}…»
                </li>
              ))}
            </ul>
          ) : null}
          {aiError ? <p className="text-xs text-amber-900">{aiError}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 text-sm">
        {!editing ? (
          <button type="button" disabled={pending} onClick={() => setText(entry.approved?.body ?? "")} className="rounded-lg border border-gold/40 bg-white px-3 py-1 text-ink/80" data-testid="area-text-edit">
            {entry.approved ? "Editar (nuevo borrador)" : "Escribir"}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending || !dirty || !value.trim() || blockers.length > 0}
            onClick={() => act(() => actions.saveDraft({ areaId: entry.areaId, body: value, origin }), () => "Borrador guardado.")}
            className="rounded-lg border border-gold/40 bg-white px-3 py-1 text-ink/80 disabled:opacity-50"
            data-testid="area-text-save"
          >
            Guardar borrador
          </button>
        )}
        {entry.draft ? (
          <button type="button" disabled={pending || dirty} onClick={approve} className="rounded-lg bg-ink px-3 py-1 text-white disabled:opacity-50" data-testid="area-text-approve" title={dirty ? "Guarda el borrador antes de aprobarlo" : undefined}>
            Aprobar
          </button>
        ) : null}
        <button type="button" disabled={pending || aiBusy} onClick={ai} className="rounded-lg border border-gold/40 bg-white px-3 py-1 text-ink/80 disabled:opacity-50" data-testid="area-text-ai">
          {aiBusy ? "La IA está escribiendo…" : "Borrador con IA"}
        </button>
        {entry.draft ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("¿Descartar el borrador?")) return;
              setText(null);
              act(() => actions.discard({ areaId: entry.areaId }), () => "Borrador descartado.");
            }}
            className="px-2 py-1 text-ink/60 underline"
            data-testid="area-text-discard"
          >
            Descartar borrador
          </button>
        ) : null}
        {entry.approved ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`¿Retirar la plantilla de ${label}? Los catálogos que ya la tienen no cambian; solo deja de ofrecerse.`)) return;
              act(() => actions.retire({ areaId: entry.areaId }), () => "Plantilla retirada. Ningún catálogo ha cambiado.");
            }}
            className="px-2 py-1 text-ink/60 underline"
            data-testid="area-text-retire"
          >
            Retirar plantilla
          </button>
        ) : null}
      </div>
      {editing && dirty ? <p className="text-xs text-ink/55">Cambios sin guardar. «Borrador con IA» solo rellena el cuadro: revisa y guarda.</p> : null}
    </li>
  );
}
