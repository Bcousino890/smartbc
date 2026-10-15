"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import {
  AUTO_MAX_MAX,
  AUTO_MAX_MIN,
  criteriaSummary,
  type CatalogCriteria,
  type CatalogOperation,
  type CatalogSort,
  type ZoneCriterion,
} from "@/lib/catalogs/criteria";
import type { CatalogItemView } from "@/lib/catalogs/types";
import { catalogBarrios, catalogDistricts } from "@/lib/catalogs/zones";
import { zoneRedundancies } from "@/lib/catalogs/explain";
import {
  criteriaFromRaw,
  emptyPreview,
  nextDraftRevision,
  previewInvalid,
  previewSettle,
  previewStart,
  previewView,
  type CriteriaRaw,
  type DraftRevision,
  type PreviewSlot,
} from "@/lib/catalogs/manager-state";
import type { FormDraft } from "./manager/use-form-draft";
import { ConflictNote } from "./manager/conflict-note";

// Zonas, precio y modo de un catálogo (BCP-01 ampliación X7, D21). Interfaz
// del admin (Lato). Los criterios filtran la búsqueda en modo manual y SON la
// selección en modo automático. No hay buscador público: todo esto vive en la
// gestión, detrás de la guarda del dueño.
// E2: controlado. Lo escrito (en bruto, también las zonas a medio elegir) vive
// en el almacén de borradores del gestor; aquí no hay copia propia.

type Res = ActionResult<{ version: number; fingerprint?: string | null; publicChange?: boolean }>;

export interface SelectionActions {
  setCriteria: (i: { catalogId: string; criteria: CatalogCriteria; skipNotify?: boolean }) => Promise<Res>;
  previewAuto: (i: { catalogId: string; criteria: CatalogCriteria }) => Promise<ActionResult<{ items: CatalogItemView[]; total: number; matched?: number }>>;
  previewMode: (i: {
    catalogId: string;
    mode: "manual" | "auto";
  }) => Promise<ActionResult<{ entering: CatalogItemView[]; leaving: CatalogItemView[]; autoTotal: number; manualCount: number }>>;
  setMode: (i: { catalogId: string; mode: "manual" | "auto"; strategy?: "restore" | "convert" | null; skipNotify?: boolean }) => Promise<Res>;
}

type PreviewData = { items: CatalogItemView[]; total: number; matched?: number };

const OPS: Array<{ v: CatalogOperation; label: string }> = [
  { v: "sale", label: "Venta" },
  { v: "rent", label: "Alquiler" },
  { v: "any", label: "Venta y alquiler" },
];

const SORTS: Array<{ v: CatalogSort; label: string }> = [
  { v: "price_asc", label: "Precio, de menor a mayor" },
  { v: "price_desc", label: "Precio, de mayor a menor" },
  { v: "newest", label: "Más recientes primero" },
];

const input =
  "rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-50";

function MiniList({ items, empty }: { items: CatalogItemView[]; empty: string }) {
  if (items.length === 0) return <p className="text-xs text-ink/50">{empty}</p>;
  return (
    <ul className="max-h-48 space-y-1 overflow-auto text-xs text-ink/75">
      {items.map((it) => (
        <li key={it.propertyId} className="flex min-w-0 justify-between gap-2">
          <span className="min-w-0 truncate">
            {it.bcReference ? <span className="mr-1 text-ink/45">{it.bcReference}</span> : null}
            {it.title}
          </span>
          <span className="shrink-0 text-ink/55">{it.price}</span>
        </li>
      ))}
    </ul>
  );
}

export function SelectionPanel({
  catalogId,
  mode,
  manualCount,
  actions,
  run,
  pending,
  form,
  summarize,
}: {
  catalogId: string;
  mode: "manual" | "auto";
  manualCount: number;
  actions: SelectionActions;
  /** El «run» del gestor: mensajes, medición y refresco. */
  run: (fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label?: string) => void;
  pending: boolean;
  /** E2 · el borrador de los criterios (dueño: el almacén del gestor). */
  form: FormDraft<CriteriaRaw>;
  /** E2 · resumen legible de unos criterios guardados (para el conflicto). */
  summarize: (raw: CriteriaRaw) => string;
}) {
  const raw = form.value;
  const { district, barrioDistrict, barrio, freeName, pmin, pmax } = raw;
  const c: CatalogCriteria = { operation: raw.operation, zones: raw.zones, sort: raw.sort, max: Number(raw.max), price_min: null, price_max: null };
  const set = (patch: Partial<CriteriaRaw>) => form.set({ ...raw, ...patch });
  const setDistrict = (v: string) => set({ district: v });
  const setBarrio = (v: string) => set({ barrio: v });
  const setFreeName = (v: string) => set({ freeName: v });
  const setPmin = (v: string) => set({ pmin: v });
  const setPmax = (v: string) => set({ pmax: v });
  const [error, setError] = useState<string | null>(null);
  // «Ver qué entraría»: solo se enseña con el borrador EXACTO que la pidió
  // (revisión), y solo la última petición cuenta (manager-state.ts).
  const revRef = useRef<DraftRevision | null>(null);
  revRef.current = nextDraftRevision(revRef.current, JSON.stringify(raw));
  const rev = revRef.current.rev;
  const [slot, setSlot] = useState<PreviewSlot<PreviewData>>(() => emptyPreview<PreviewData>());
  const slotRef = useRef(slot);
  const putSlot = (next: PreviewSlot<PreviewData>) => {
    slotRef.current = next;
    setSlot(next);
  };
  const view = previewView(slot, rev);
  const [modePrev, setModePrev] = useState<{
    to: "manual" | "auto";
    entering: CatalogItemView[];
    leaving: CatalogItemView[];
    autoTotal: number;
    manualCount: number;
  } | null>(null);
  const [busy, startBusy] = useTransition();

  const unit = c.operation === "rent" ? "€/mes" : "€";
  const priceDisabled = c.operation === "any";

  function update(patch: Partial<CriteriaRaw>) {
    set(patch);
  }

  function addZone(z: ZoneCriterion, clear: Partial<CriteriaRaw>) {
    if (c.zones.some((x) => x.kind === z.kind && x.name.toLowerCase() === z.name.toLowerCase())) return set(clear);
    update({ zones: [...c.zones, z], ...clear });
  }

  /** Criterios del formulario, validados con las mismas reglas que SQL. */
  function current(): CatalogCriteria | null {
    const n = criteriaFromRaw(raw);
    if (!n) {
      setError("Revisa los criterios: el precio solo con venta o alquiler, mínimo ≤ máximo y entre 1 y 24 viviendas.");
      // Con un error, ninguna vista previa anterior (ni la que esté en camino).
      putSlot(previewInvalid(slotRef.current));
      return null;
    }
    setError(null);
    return n;
  }

  function save() {
    const crit = current();
    if (!crit) return;
    // Ajuste 2: se envía ESTA instantánea; lo que se escriba después se conserva.
    const k = form.begin(raw);
    run(
      () => actions.setCriteria({ catalogId, criteria: crit }),
      mode === "auto" ? "Criterios guardados: la selección se ha actualizado." : "Criterios guardados.",
      () => form.ok(k),
      () => form.fail(k),
      "criterios",
    );
  }

  function settlePreview(seq: number, outcome: { ok: true; data: PreviewData } | { ok: false; error: string }) {
    const r = previewSettle(slotRef.current, seq, revRef.current?.rev ?? 0, outcome);
    putSlot(r.slot);
    if (r.accepted && r.error) setError(r.error);
  }

  function showPreview() {
    const crit = current();
    if (!crit) return;
    const { slot: next, seq } = previewStart(slotRef.current, rev, criteriaSummary(crit));
    putSlot(next);
    actions.previewAuto({ catalogId, criteria: crit }).then(
      (r) => settlePreview(seq, r.ok ? { ok: true, data: { items: r.items, total: r.total, matched: r.matched } } : { ok: false, error: r.error }),
      () => settlePreview(seq, { ok: false, error: "No se pudo calcular la vista previa. Inténtalo de nuevo." }),
    );
  }

  function askMode(to: "manual" | "auto") {
    setError(null);
    startBusy(async () => {
      const r = await actions.previewMode({ catalogId, mode: to });
      if (r.ok) setModePrev({ to, entering: r.entering, leaving: r.leaving, autoTotal: r.autoTotal, manualCount: r.manualCount });
      else setError(r.error);
    });
  }

  function confirmMode(strategy: "restore" | "convert" | null) {
    if (!modePrev) return;
    const to = modePrev.to;
    run(
      () => actions.setMode({ catalogId, mode: to, strategy }),
      to === "auto"
        ? "Catálogo en modo automático. Tu lista manual queda guardada."
        : strategy === "convert"
          ? "La selección automática es ahora tu lista manual."
          : "Has vuelto a tu lista manual.",
      () => setModePrev(null),
      undefined,
      to === "auto" ? "modo automático" : `modo manual (${strategy === "convert" ? "convertir" : "volver"})`,
    );
  }

  const barrios = barrioDistrict ? catalogBarrios(barrioDistrict) : [];

  return (
    <section className="space-y-4 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="sel-title" data-testid="selection-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sel-title" className="crm-label-sm text-ink/70">
          Zonas, precio y modo
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs ${mode === "auto" ? "bg-gold/20 text-ink/85" : "bg-ink/10 text-ink/65"}`}
          data-testid="mode-badge"
        >
          {mode === "auto" ? "Automático" : "Manual"}
        </span>
      </div>
      <p className="text-xs text-ink/55">
        {mode === "auto"
          ? "La lista del catálogo es el resultado de estos criterios: entran solas las viviendas que encajan (con al menos una foto) y salen las que dejan de encajar."
          : "En manual, estos criterios solo filtran la búsqueda para añadir viviendas. Tú eliges y ordenas."}
      </p>

      {form.conflict ? <ConflictNote saved={summarize(form.conflict.raw)} onDiscard={form.discard} onKeep={form.keepMine} /> : null}
      {form.edited ? (
        <p className="text-xs font-semibold text-amber-800" data-testid="criteria-unsaved">
          Cambios sin guardar en los criterios
        </p>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="text-xs text-ink/60">Operación</legend>
        <div className="flex flex-wrap gap-3 text-sm text-ink/80">
          {OPS.map((o) => (
            <label key={o.v} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="sel-op"
                value={o.v}
                checked={c.operation === o.v}
                onChange={() => update({ operation: o.v })}
                className="accent-gold"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <p className="text-xs text-ink/60">Zonas (cualquiera de ellas)</p>
        <ul className="flex flex-wrap gap-2" aria-label="Zonas elegidas" data-testid="zone-chips">
          {c.zones.length === 0 ? <li className="text-xs text-ink/45">Todas las zonas</li> : null}
          {c.zones.map((z) => (
            <li key={`${z.kind}:${z.name}`} className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1 text-xs text-ink/80">
              <span>
                {z.name}
                <span className="ml-1 text-ink/45">{z.kind === "district" ? "distrito" : z.kind === "barrio" ? "barrio" : "texto"}</span>
              </span>
              <button
                type="button"
                onClick={() => update({ zones: c.zones.filter((x) => x !== z) })}
                aria-label={`Quitar ${z.name}`}
                className="ml-1 text-ink/50 hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex min-w-0 gap-2">
            <select aria-label="Distrito" value={district} onChange={(e) => setDistrict(e.target.value)} className={`${input} min-w-0 flex-1`}>
              <option value="">Distrito…</option>
              {catalogDistricts().map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!district}
              onClick={() => addZone({ kind: "district", name: district }, { district: "" })}
              className="shrink-0 rounded-lg border border-gold/40 px-3 text-sm text-ink/80 disabled:opacity-40"
            >
              Añadir
            </button>
          </div>
          <div className="flex min-w-0 gap-2">
            <select
              aria-label="Distrito del barrio"
              value={barrioDistrict}
              onChange={(e) => set({ barrioDistrict: e.target.value, barrio: "" })}
              className={`${input} min-w-0 flex-1`}
            >
              <option value="">Barrio en…</option>
              {catalogDistricts().map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select aria-label="Barrio" value={barrio} onChange={(e) => setBarrio(e.target.value)} disabled={!barrioDistrict} className={`${input} min-w-0 flex-1`}>
              <option value="">Barrio…</option>
              {barrios.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!barrio}
              onClick={() => addZone({ kind: "barrio", name: barrio }, { barrio: "" })}
              className="shrink-0 rounded-lg border border-gold/40 px-3 text-sm text-ink/80 disabled:opacity-40"
            >
              Añadir
            </button>
          </div>
        </div>
        <div className="flex min-w-0 gap-2">
          <input
            aria-label="Otra zona (texto)"
            value={freeName}
            onChange={(e) => setFreeName(e.target.value)}
            placeholder="Otra zona, p. ej. Pozuelo de Alarcón"
            maxLength={80}
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="button"
            disabled={freeName.trim().length < 2}
            onClick={() => addZone({ kind: "free", name: freeName.trim() }, { freeName: "" })}
            className="shrink-0 rounded-lg border border-gold/40 px-3 text-sm text-ink/80 disabled:opacity-40"
          >
            Añadir
          </button>
        </div>
        <p className="text-xs text-ink/45">Chueca cuenta como Justicia, Malasaña como Universidad y Huertas como Cortes.</p>
        {zoneRedundancies(c).length ? (
          <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900" data-testid="zone-redundant">
            {zoneRedundancies(c).join(" · ")}: no estrecha la búsqueda.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="text-xs text-ink/60">Precio mínimo ({unit})</span>
          <input
            inputMode="numeric"
            value={priceDisabled ? "" : pmin}
            onChange={(e) => setPmin(e.target.value)}
            disabled={priceDisabled}
            placeholder={priceDisabled ? "Elige venta o alquiler" : "Sin mínimo"}
            className={`${input} mt-1 w-full`}
            data-testid="price-min"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-ink/60">Precio máximo ({unit})</span>
          <input
            inputMode="numeric"
            value={priceDisabled ? "" : pmax}
            onChange={(e) => setPmax(e.target.value)}
            disabled={priceDisabled}
            placeholder={priceDisabled ? "Elige venta o alquiler" : "Sin máximo"}
            className={`${input} mt-1 w-full`}
            data-testid="price-max"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="text-xs text-ink/60">Orden</span>
          <select value={c.sort} onChange={(e) => update({ sort: e.target.value as CatalogSort })} className={`${input} mt-1 w-full`}>
            {SORTS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-ink/60">Viviendas en automático (máx.)</span>
          <input
            type="number"
            min={AUTO_MAX_MIN}
            max={AUTO_MAX_MAX}
            value={raw.max}
            onChange={(e) => update({ max: e.target.value })}
            className={`${input} mt-1 w-full`}
            data-testid="auto-max"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || busy}
          className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-60"
        >
          Guardar criterios
        </button>
        <button
          type="button"
          onClick={showPreview}
          disabled={pending || busy}
          className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-ink/80 hover:bg-white disabled:opacity-60"
        >
          Ver qué entraría
        </button>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      {view.kind === "loading" ? (
        <p className="text-xs text-ink/60" role="status" data-testid="preview-loading">
          Calculando…
        </p>
      ) : null}
      {view.kind === "changed" ? (
        <p className="text-xs text-ink/60" data-testid="preview-changed">
          Los criterios han cambiado desde la última vista previa: pulsa «Ver qué entraría» para verlos.
        </p>
      ) : null}
      {view.kind === "result" ? (
        <div className="space-y-2 rounded-lg border border-gold/20 bg-white p-3" data-testid="auto-preview">
          <p className="text-xs text-ink/70">
            <strong>
              {view.data.items.length} de {view.data.matched ?? view.data.total}
            </strong>{" "}
            coinciden {view.summary ? `· ${view.summary}` : ""}
            {view.data.items.some((it) => it.via === "include") ? " · con tus inclusiones" : ""}
          </p>
          <MiniList items={view.data.items} empty="Ninguna vivienda encaja con estos criterios." />
        </div>
      ) : null}

      <div className="space-y-2 border-t border-gold/15 pt-3">
        {mode === "manual" ? (
          <button
            type="button"
            onClick={() => askMode("auto")}
            disabled={pending || busy}
            className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-ink/80 hover:bg-white disabled:opacity-60"
          >
            Pasar a automático…
          </button>
        ) : (
          <button
            type="button"
            onClick={() => askMode("manual")}
            disabled={pending || busy}
            className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-ink/80 hover:bg-white disabled:opacity-60"
          >
            Pasar a manual…
          </button>
        )}
        {mode === "auto" ? <p className="text-xs text-ink/50">Tu lista manual guardada tiene {manualCount} vivienda{manualCount === 1 ? "" : "s"}.</p> : null}
        {modePrev ? (
          <div className="space-y-3 rounded-lg border border-gold/30 bg-white p-3" data-testid="mode-preview">
            <p className="text-sm text-ink/80">
              {modePrev.to === "auto"
                ? `En automático entran ${modePrev.entering.length} y salen ${modePrev.leaving.length} (coinciden ${modePrev.autoTotal} en total). Tu lista manual no se borra.`
                : "Al volver a manual puedes recuperar tu lista anterior o quedarte con la selección actual."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-emerald-800">Entran ({modePrev.entering.length})</p>
                <MiniList items={modePrev.entering} empty="Ninguna." />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-red-800">Salen ({modePrev.leaving.length})</p>
                <MiniList items={modePrev.leaving} empty="Ninguna." />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {modePrev.to === "auto" ? (
                <button type="button" onClick={() => confirmMode(null)} disabled={pending} className="rounded-lg bg-gold/90 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  Pasar a automático
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => confirmMode("restore")} disabled={pending} className="rounded-lg bg-gold/90 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    Volver a mi lista anterior ({modePrev.manualCount})
                  </button>
                  <button type="button" onClick={() => confirmMode("convert")} disabled={pending} className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-ink/80 disabled:opacity-60">
                    Convertir la selección actual en lista manual
                  </button>
                </>
              )}
              <button type="button" onClick={() => setModePrev(null)} className="rounded-lg px-3 py-2 text-sm text-ink/60">
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
