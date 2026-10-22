"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import type { ActionResult } from "@/lib/catalogs/access";
import { CATALOG_LANGUAGES, LANGUAGE_LABELS, TRANSLATION_REVIEW_REQUIRED, type CatalogLanguage } from "@/lib/catalogs/i18n";
import { LANGUAGE_NAMES_ES, TARGET_LANGUAGES, type TargetLanguage } from "@/lib/catalogs/translation-labels";
import type { PanelItem, PanelState, ReviewEdit } from "@/lib/catalogs/translation-service";

// Idiomas del catálogo (PR6 · spec §3, DA9–DA21, DA31–DA36, N5). Todo es
// del gestor: el cliente solo ve traducciones APROBADAS y VIGENTES.
//   · Idioma del catálogo y de cada enlace personal: solo se activa un idioma
//     completo (todas las viviendas y el título del catálogo); hasta entonces
//     el enlace sigue en el idioma anterior y aquí se ve el progreso.
//   · Preparar: solo al pulsar, solo el idioma elegido y solo lo que falta,
//     con la IA ya configurada. Una reserva evita lanzar dos veces lo mismo,
//     pero no garantiza una sola llamada de pago; un resultado incierto no
//     se reintenta solo.
//   · Revisar: original y traducción por bloque, editar, aprobar o rechazar.

type Msg = { kind: "ok" | "info" | "error"; text: string } | null;
type Res = ActionResult<{ version?: number }>;

export interface TranslationActions {
  load: (i: { catalogId: string; lang: string }) => Promise<ActionResult<{ panel: PanelState }>>;
  prepare: (i: { catalogId: string; key: string; lang: string; retry?: boolean }) => Promise<ActionResult<{ outcome: string; message: { kind: "ok" | "info" | "error"; text: string } }>>;
  cancel: (i: { catalogId: string; jobId: string }) => Promise<ActionResult<{ changed: boolean }>>;
  save: (i: { catalogId: string; edit: ReviewEdit }) => Promise<ActionResult<object>>;
  reject: (i: { catalogId: string; textId: string }) => Promise<ActionResult<{ changed: boolean }>>;
  approve: (i: { catalogId: string; key: string; lang: string; textRev: number; areaRev: number | null; confirmed: string[] }) => Promise<Res>;
  useApproved: (i: { catalogId: string; lang: string; key?: string }) => Promise<ActionResult<{ copied: number }>>;
  remove: (i: { catalogId: string; key: string; lang: string }) => Promise<Res>;
  setCatalogLang: (i: { catalogId: string; lang: string }) => Promise<Res>;
  setLinkLang: (i: { catalogId: string; linkId: string; lang: string | null }) => Promise<Res>;
}

const COST_NOTE =
  "Preparar llama a la IA configurada (Configuración → IA) y puede tener coste. Solo se prepara el idioma elegido y solo lo que falta. " +
  "Una reserva evita que dos personas lancen a la vez lo mismo, pero no garantiza una sola llamada de pago: si se agota el tiempo después de enviar, " +
  "el resultado queda «incierto», pudo cobrarse y no se reintenta solo.";

const STATE_TONE: Record<PanelItem["state"], string> = {
  current: "bg-emerald-50 text-emerald-800",
  ready: "bg-sky-50 text-sky-800",
  review: "bg-amber-50 text-amber-900",
  busy: "bg-amber-50 text-amber-900",
  uncertain: "bg-red-50 text-red-800",
  failed: "bg-red-50 text-red-800",
  outdated: "bg-orange-50 text-orange-900",
  rejected: "bg-ink/5 text-ink/70",
  none: "bg-ink/5 text-ink/70",
};

function whereLabel(w: string): string {
  if (w === "title") return "título";
  if (w === "intro") return "introducción";
  if (w === "area") return "plantilla de zona";
  if (w.startsWith("block:")) return `bloque ${Number(w.slice(6)) + 1}`;
  if (w.startsWith("feature:")) return `característica «${w.slice(8)}»`;
  return w;
}

function langName(l: CatalogLanguage): string {
  return `${LANGUAGE_LABELS[l]} (${LANGUAGE_NAMES_ES[l]})`;
}

function NativeMark({ lang }: { lang: CatalogLanguage }) {
  if (!TRANSLATION_REVIEW_REQUIRED.has(lang)) return null;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900" data-testid={`native-${lang}`}>
      sin revisión nativa
    </span>
  );
}

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const tone = msg.kind === "error" ? "bg-red-50 text-red-800" : msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-900";
  return (
    <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${tone}`} data-testid="tr-message">
      {msg.text}
    </p>
  );
}

export function LanguagesSection({ catalogId, actions, onPublicChange }: { catalogId: string; actions: TranslationActions; onPublicChange?: () => void }) {
  const [lang, setLang] = useState<TargetLanguage>("en");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [catalogChoice, setCatalogChoice] = useState<CatalogLanguage>("es");
  const stopAll = useRef(false);

  const reload = useCallback(async (l: TargetLanguage = lang) => {
    const r = await actions.load({ catalogId, lang: l });
    if (r.ok) {
      setPanel(r.panel);
      setCatalogChoice(r.panel.defaultLang);
    } else setMsg({ kind: "error", text: r.error });
  }, [actions, catalogId, lang]);

  useEffect(() => {
    void reload(lang);
  }, [lang, reload]);

  // Mientras haya una preparación en curso, se vuelve a mirar cada pocos segundos.
  const anyBusy = !!panel?.items.some((i) => i.state === "busy");
  useEffect(() => {
    if (!anyBusy) return;
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [anyBusy, reload]);

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, ok?: (r: Record<string, unknown>) => Msg) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await fn();
      if (!r.ok) setMsg({ kind: "error", text: String(r.error ?? "No se ha podido hacer.") });
      else {
        setMsg(ok ? ok(r) : null);
        if ("fingerprint" in r) onPublicChange?.();
      }
    } finally {
      setBusy(null);
      await reload();
    }
  }

  const progressOf = (l: CatalogLanguage) => panel?.progress.find((p) => p.lang === l) ?? null;
  const missing = panel?.items.filter((i) => i.state === "none" || i.state === "outdated" || i.state === "rejected" || i.state === "failed" || (i.state === "current" && i.featuresMissing > 0)) ?? [];
  const ready = panel?.items.filter((i) => i.state === "ready" || (i.state === "current" && i.featuresMissing > 0 && i.features.some((f) => f.status === "approved"))) ?? [];
  const active = panel?.active.includes(lang) ?? false;
  const pendingVisible = active ? panel!.items.filter((i) => i.kind === "item" && !i.current) : [];

  async function prepareAll() {
    stopAll.current = false;
    for (const it of missing) {
      if (stopAll.current) break;
      setBusy(`prep:${it.key}`);
      const r = await actions.prepare({ catalogId, key: it.key, lang });
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        break;
      }
      setMsg(r.message);
      await reload();
      if (r.outcome === "uncertain" || r.outcome === "failed" || r.outcome === "uncertain_pending") break;
    }
    setBusy(null);
    await reload();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" data-testid="languages-section">
      <div className="min-w-0 space-y-4">
        <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="lang-cat-title" data-testid="lang-catalog" data-check-overflow="idiomas">
          <h2 id="lang-cat-title" className="crm-label-sm flex items-center gap-1.5 text-ink/70">
            <Languages className="h-4 w-4" aria-hidden="true" /> Idioma de los enlaces
          </h2>
          <p className="text-xs text-ink/60">
            Un idioma solo se puede activar cuando está completo: todas las viviendas y el título del catálogo con su traducción aprobada y vigente. Hasta
            entonces el enlace sigue en el idioma de antes. Los datos, las fotos y los precios salen siempre de la ficha actual, en todos los idiomas.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm text-ink/70">
              <span className="block">Idioma del catálogo</span>
              <select
                value={catalogChoice}
                onChange={(e) => setCatalogChoice(e.target.value as CatalogLanguage)}
                className="mt-1 rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink"
                data-testid="lang-catalog-select"
              >
                {CATALOG_LANGUAGES.map((l) => {
                  const p = progressOf(l);
                  return (
                    <option key={l} value={l}>
                      {langName(l)}
                      {l === "es" ? "" : p?.complete ? " · completo" : ` · ${p?.current ?? 0}/${p?.total ?? 0}`}
                    </option>
                  );
                })}
              </select>
            </label>
            <button
              type="button"
              disabled={!panel || busy !== null || catalogChoice === panel.defaultLang}
              onClick={() => run("cat-lang", () => actions.setCatalogLang({ catalogId, lang: catalogChoice }), () => ({ kind: "ok", text: `El catálogo está ahora en ${LANGUAGE_NAMES_ES[catalogChoice]}. Los enlaces abiertos se actualizan solos.` }))}
              className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold disabled:opacity-50"
              data-testid="lang-catalog-apply"
            >
              Cambiar
            </button>
          </div>
          {panel ? (
            <p className="text-xs text-ink/60" data-testid="lang-catalog-current">
              Ahora: {langName(panel.defaultLang)}
            </p>
          ) : null}
          <ul className="space-y-1" aria-label="Progreso por idioma" data-testid="lang-progress">
            {TARGET_LANGUAGES.map((l) => {
              const p = progressOf(l);
              return (
                <li key={l} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/70" data-testid={`lang-progress-${l}`}>
                  <span className="flex items-center gap-1.5">
                    {langName(l)} <NativeMark lang={l} />
                  </span>
                  <span className={p?.complete ? "font-semibold text-emerald-800" : ""}>
                    {p ? (p.complete ? "Completo" : `${p.current} de ${p.total} viviendas`) : "…"}
                  </span>
                </li>
              );
            })}
          </ul>
          {panel && panel.links.filter((l) => l.state !== "revoked").length ? (
            <div className="space-y-2 border-t border-gold/10 pt-3" data-testid="lang-links">
              <p className="text-sm font-semibold text-ink/80">Enlaces personales</p>
              {panel.links.filter((l) => l.state !== "revoked").map((l) => (
                <LinkLang key={l.id} link={l} catalogLang={panel.defaultLang} disabled={busy !== null} onApply={(v) => run(`link:${l.id}`, () => actions.setLinkLang({ catalogId, linkId: l.id, lang: v }), () => ({ kind: "ok", text: `El enlace de ${l.clientName} está ahora en ${LANGUAGE_NAMES_ES[(v ?? panel.defaultLang) as CatalogLanguage]}. Los demás enlaces no cambian.` }))} />
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="min-w-0 space-y-4">
        <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="lang-work-title" data-testid="lang-work">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="lang-work-title" className="crm-label-sm text-ink/70">Preparar y revisar traducciones</h2>
            <label className="text-sm text-ink/70">
              <span className="sr-only">Idioma</span>
              <select value={lang} onChange={(e) => { setOpen(null); setLang(e.target.value as TargetLanguage); }} className="rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink" data-testid="lang-work-select">
                {TARGET_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {langName(l)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {TRANSLATION_REVIEW_REQUIRED.has(lang) ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="lang-native-warning">
              {LANGUAGE_NAMES_ES[lang][0].toUpperCase() + LANGUAGE_NAMES_ES[lang].slice(1)}: sin revisión nativa. Las traducciones y los textos fijos de este idioma no están validados por un hablante nativo.
            </p>
          ) : null}
          <p className="text-xs text-ink/60" data-testid="lang-cost-note">{COST_NOTE}</p>
          {pendingVisible.length ? (
            <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900" data-testid="lang-pending-visible">
              Este idioma está activo: {pendingVisible.length === 1 ? "1 vivienda se ve" : `${pendingVisible.length} viviendas se ven`} ahora con «Descripción en preparación» (datos, fotos y etiquetas en el idioma, sin el texto en español). Prepárala y apruébala.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!panel || busy !== null || missing.length === 0}
              onClick={() => void prepareAll()}
              className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold disabled:opacity-50"
              data-testid="tr-prepare-all"
            >
              {missing.length ? `Preparar lo que falta (${missing.length})` : "No falta nada por preparar"}
            </button>
            {busy?.startsWith("prep:") ? (
              <button type="button" onClick={() => { stopAll.current = true; }} className="rounded-lg border border-gold/40 bg-white px-3 py-1.5 text-sm text-ink/80" data-testid="tr-stop-all">
                Parar después de esta
              </button>
            ) : null}
            <button
              type="button"
              disabled={!panel || busy !== null || ready.length === 0}
              onClick={() => run("use", () => actions.useApproved({ catalogId, lang }), (r) => ({ kind: "ok", text: `Copiadas ${String(r.copied ?? 0)} traducciones ya aprobadas, sin IA.` }))}
              className="rounded-lg border border-gold/40 bg-white px-3 py-1.5 text-sm font-semibold text-ink/80 hover:bg-cream-50 disabled:opacity-50"
              data-testid="tr-use-approved"
            >
              Usar las ya aprobadas, sin IA ({ready.length})
            </button>
          </div>
          <Notice msg={msg} />
          {panel === null ? (
            <p className="text-xs text-ink/50">Cargando…</p>
          ) : (
            <ul className="divide-y divide-gold/10" data-testid="tr-items">
              {panel.items.map((it) => (
                <TrRow
                  key={`${it.key}:${lang}`}
                  item={it}
                  lang={lang}
                  activeLang={active}
                  open={open === it.key}
                  busy={busy}
                  onToggle={() => setOpen(open === it.key ? null : it.key)}
                  onPrepare={(retry) => run(`prep:${it.key}`, () => actions.prepare({ catalogId, key: it.key, lang, retry }) as never, (r) => (r as { message: Msg }).message)}
                  onCancel={() => it.job && run(`cancel:${it.key}`, () => actions.cancel({ catalogId, jobId: it.job!.id }), (r) => (r.changed ? { kind: "info", text: "Preparación cancelada. Si la IA responde después, la respuesta se descarta y queda registrada (esa llamada pudo cobrarse)." } : { kind: "info", text: "Esa preparación ya había terminado." }))}
                  onSave={(edit) => run(`save:${it.key}`, () => actions.save({ catalogId, edit }), () => ({ kind: "ok", text: "Cambios guardados. Falta aprobar." }))}
                  onApprove={(confirmed) => run(`approve:${it.key}`, () => actions.approve({ catalogId, key: it.key, lang, textRev: it.text!.rev, areaRev: it.area?.rev ?? null, confirmed }), () => ({ kind: "ok", text: "Traducción aprobada y copiada a este catálogo." }))}
                  onReject={() => it.text && run(`reject:${it.key}`, () => actions.reject({ catalogId, textId: it.text!.id }), () => ({ kind: "info", text: "Traducción rechazada. Puedes preparar otra." }))}
                  onUse={() => run(`use:${it.key}`, () => actions.useApproved({ catalogId, lang, key: it.key }), () => ({ kind: "ok", text: "Traducción aprobada copiada a este catálogo, sin IA." }))}
                  onRemove={() => run(`remove:${it.key}`, () => actions.remove({ catalogId, key: it.key, lang }), () => ({ kind: "info", text: "Traducción quitada de este catálogo." }))}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function LinkLang({ link, catalogLang, disabled, onApply }: { link: PanelState["links"][number]; catalogLang: CatalogLanguage; disabled: boolean; onApply: (v: string | null) => void }) {
  const [v, setV] = useState<string>(link.lang ?? "");
  useEffect(() => setV(link.lang ?? ""), [link.lang]);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="lang-link">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{link.clientName}</span>
      <select value={v} onChange={(e) => setV(e.target.value)} aria-label={`Idioma del enlace de ${link.clientName}`} className="rounded-lg border border-gold/25 bg-white px-2 py-1 text-sm text-ink" data-testid="lang-link-select">
        <option value="">El del catálogo ({LANGUAGE_NAMES_ES[catalogLang]})</option>
        {CATALOG_LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {langName(l)}
          </option>
        ))}
      </select>
      <button type="button" disabled={disabled || v === (link.lang ?? "")} onClick={() => onApply(v || null)} className="rounded-lg border border-gold/40 bg-white px-2 py-1 text-xs font-semibold text-ink/80 disabled:opacity-50" data-testid="lang-link-apply">
        Cambiar
      </button>
    </div>
  );
}

function TrRow(p: {
  item: PanelItem;
  lang: TargetLanguage;
  activeLang: boolean;
  open: boolean;
  busy: string | null;
  onToggle: () => void;
  onPrepare: (retry?: boolean) => void;
  onCancel: () => void;
  onSave: (edit: ReviewEdit) => void;
  onApprove: (confirmed: string[]) => void;
  onReject: () => void;
  onUse: () => void;
  onRemove: () => void;
}) {
  const it = p.item;
  const disabled = p.busy !== null;
  const canPrepare = it.state === "none" || it.state === "outdated" || it.state === "rejected" || it.state === "failed" || (it.state === "current" && it.featuresMissing > 0 && it.features.some((f) => !f.tr));
  const canReview = !!it.text && it.text.status !== "rejected";
  return (
    <li className="space-y-2 py-3" data-testid="tr-item" data-key={it.key} data-state={it.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{it.kind === "meta" ? `Título e introducción del catálogo` : it.title}</p>
          <p className="text-xs text-ink/55">
            {it.kind === "meta" ? it.title : `Fuente: ${it.library ? "texto aprobado de la biblioteca (se reutiliza en tus catálogos)" : "lo que enseña hoy este catálogo (no entra en la biblioteca)"}`}
          </p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${STATE_TONE[it.state]}`} data-testid="tr-state">
          {it.state === "current" && it.featuresMissing > 0 ? `Vigente · faltan ${it.featuresMissing} características` : it.stateLabel}
        </span>
      </div>
      {it.outdated && it.kind === "item" ? (
        <p className="text-xs text-orange-900" data-testid="tr-outdated">
          El español de esta vivienda cambió después de aprobar la traducción.{p.activeLang ? " El cliente ve «Descripción en preparación» hasta que apruebes la nueva." : ""}
        </p>
      ) : null}
      {it.outdated && it.kind === "meta" ? (
        <p className="text-xs text-orange-900" data-testid="tr-outdated">El título o la introducción en español cambiaron: el cliente sigue viendo la traducción anterior hasta que apruebes la nueva.</p>
      ) : null}
      {it.state === "uncertain" ? (
        <p className="text-xs text-red-800" data-testid="tr-uncertain">
          La última preparación quedó incierta (tiempo agotado tras enviar): pudo cobrarse. No se reintenta sola.
        </p>
      ) : null}
      {it.job?.note && (it.state === "failed" || it.job.discarded) ? <p className="text-xs text-ink/55" data-testid="tr-job-note">Registro: {it.job.note}</p> : null}
      <div className="flex flex-wrap gap-2">
        {it.state === "busy" ? (
          <button type="button" disabled={disabled} onClick={p.onCancel} className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50" data-testid="tr-cancel">
            Cancelar la preparación
          </button>
        ) : null}
        {canPrepare ? (
          <button type="button" disabled={disabled} onClick={() => p.onPrepare(false)} className="rounded-lg bg-gold/90 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" data-testid="tr-prepare">
            {p.busy === `prep:${it.key}` ? "Preparando…" : `Preparar en ${LANGUAGE_NAMES_ES[p.lang]}`}
          </button>
        ) : null}
        {it.state === "uncertain" ? (
          <button type="button" disabled={disabled} onClick={() => p.onPrepare(true)} className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50" data-testid="tr-retry">
            Volver a preparar (la anterior pudo cobrarse)
          </button>
        ) : null}
        {it.state === "ready" || (it.state === "current" && it.featuresMissing > 0 && it.features.some((f) => f.status === "approved")) ? (
          <button type="button" disabled={disabled} onClick={p.onUse} className="rounded-lg border border-gold/40 bg-white px-2 py-1 text-xs font-semibold text-ink/80 disabled:opacity-50" data-testid="tr-use">
            Usar la aprobada (sin IA)
          </button>
        ) : null}
        {canReview ? (
          <button type="button" onClick={p.onToggle} aria-expanded={p.open} className="rounded-lg border border-gold/40 bg-white px-2 py-1 text-xs font-semibold text-ink/80" data-testid="tr-review">
            {p.open ? "Cerrar revisión" : it.state === "review" ? "Revisar" : "Ver traducción"}
          </button>
        ) : null}
        {it.current || (it.outdated && it.kind === "item") ? (
          <button type="button" disabled={disabled} onClick={p.onRemove} className="rounded-lg px-2 py-1 text-xs text-ink/55 underline disabled:opacity-50" data-testid="tr-remove">
            Quitar de este catálogo
          </button>
        ) : null}
      </div>
      {p.open && canReview ? <Review item={it} lang={p.lang} disabled={disabled} onSave={p.onSave} onApprove={p.onApprove} onReject={p.onReject} /> : null}
    </li>
  );
}

function Review({ item, lang, disabled, onSave, onApprove, onReject }: { item: PanelItem; lang: TargetLanguage; disabled: boolean; onSave: (e: ReviewEdit) => void; onApprove: (c: string[]) => void; onReject: () => void }) {
  const own = item.es.blocks.filter((b) => !b.area);
  const areaBlock = item.es.blocks.find((b) => b.area) ?? null;
  const [title, setTitle] = useState(item.text?.title ?? "");
  const [intro, setIntro] = useState(item.text?.intro ?? "");
  const [blocks, setBlocks] = useState<string[]>(own.map((b) => b.tr ?? ""));
  const [area, setArea] = useState(areaBlock?.tr ?? "");
  const [feats, setFeats] = useState<Record<string, string>>(Object.fromEntries(item.features.map((f) => [f.es, f.tr ?? ""])));
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const textChanged =
    title !== (item.text?.title ?? "") || (item.kind === "meta" && intro !== (item.text?.intro ?? "")) || blocks.some((b, i) => b !== (own[i]?.tr ?? ""));
  const areaChanged = !!areaBlock && area !== (areaBlock.tr ?? "");
  const featChanged = item.features.filter((f) => (feats[f.es] ?? "") !== (f.tr ?? "") && (feats[f.es] ?? "").trim());
  const changed = textChanged || areaChanged || featChanged.length > 0;
  const blockers = item.check?.blockers ?? [];
  const warnings = item.check?.warnings ?? [];
  const pending = warnings.filter((w) => !confirmed.includes(w.id));
  const fieldDir = lang === "ar" || lang === "he" ? "rtl" : "ltr";

  function save() {
    onSave({
      key: item.key,
      lang,
      text: textChanged && item.text ? { id: item.text.id, rev: item.text.rev, title, intro: item.kind === "meta" ? intro : undefined, blocks: item.kind === "meta" ? undefined : blocks } : null,
      area: areaChanged && item.area ? { id: item.area.id, rev: item.area.rev, body: area } : null,
      features: featChanged.map((f) => ({ es: f.es, tr: feats[f.es] })),
    });
  }
  const box = "w-full rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-gold";
  return (
    <div className="space-y-3 rounded-lg border border-gold/15 bg-cream-50/50 p-3" data-testid="tr-review-panel">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="crm-label-sm text-ink/55">Original (español)</p>
          <p className="mt-1 text-sm text-ink">{item.es.title}</p>
        </div>
        <label className="block">
          <span className="crm-label-sm text-ink/55">Título en {LANGUAGE_NAMES_ES[lang]}</span>
          <input dir={fieldDir} value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${box}`} data-testid="tr-title" />
        </label>
      </div>
      {item.kind === "meta" && item.es.intro ? (
        <div className="grid gap-2 md:grid-cols-2">
          <p className="whitespace-pre-line text-sm text-ink/80">{item.es.intro}</p>
          <textarea dir={fieldDir} value={intro} onChange={(e) => setIntro(e.target.value)} rows={4} className={box} aria-label="Introducción traducida" data-testid="tr-intro" />
        </div>
      ) : null}
      {own.map((b, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-2" data-testid="tr-block" data-block-key={b.key}>
          <div>
            <p className="crm-label-sm text-ink/55">{b.headingEs ?? "Introducción"}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{b.es}</p>
          </div>
          <label className="block">
            <span className="crm-label-sm text-ink/55">{b.headingTr ?? "Introducción"}</span>
            <textarea dir={fieldDir} value={blocks[i]} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? e.target.value : x)))} rows={Math.min(10, 2 + Math.ceil(b.es.length / 90))} className={`mt-1 ${box}`} data-testid="tr-block-text" />
          </label>
        </div>
      ))}
      {areaBlock ? (
        <div className="grid gap-2 md:grid-cols-2" data-testid="tr-area">
          <div>
            <p className="crm-label-sm text-ink/55">{areaBlock.headingEs} · plantilla de zona</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{areaBlock.es}</p>
            <p className="mt-1 text-[11px] text-ink/50">Se aprueba una vez y se reutiliza en todas las viviendas con esta plantilla.</p>
          </div>
          <label className="block">
            <span className="crm-label-sm text-ink/55">{areaBlock.headingTr}</span>
            <textarea dir={fieldDir} value={area} onChange={(e) => setArea(e.target.value)} rows={5} disabled={!item.area} className={`mt-1 ${box}`} data-testid="tr-area-text" />
          </label>
        </div>
      ) : null}
      {item.features.length ? (
        <div className="space-y-1" data-testid="tr-features">
          <p className="crm-label-sm text-ink/55">Características (por texto exacto, se reutilizan)</p>
          {item.features.map((f) => (
            <div key={f.es} className="grid items-center gap-2 md:grid-cols-2">
              <span className="text-sm text-ink/80">{f.es}</span>
              <input dir={fieldDir} value={feats[f.es] ?? ""} onChange={(e) => setFeats({ ...feats, [f.es]: e.target.value })} placeholder="Sin traducir" aria-label={`Traducción de ${f.es}`} className={box} data-testid="tr-feature" />
            </div>
          ))}
        </div>
      ) : null}
      {blockers.length ? (
        <ul className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="tr-blockers">
          {blockers.map((b, i) => (
            <li key={i}>{b.code === "text_has_price" ? "Menciona un precio" : "Tiene un teléfono, un correo o una web"} ({whereLabel(b.where)}). Corrígelo antes de aprobar.</li>
          ))}
        </ul>
      ) : null}
      {warnings.length ? (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="tr-warnings">
          {warnings.map((w) => (
            <li key={w.id}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={confirmed.includes(w.id)} onChange={(e) => setConfirmed(e.target.checked ? [...confirmed, w.id] : confirmed.filter((x) => x !== w.id))} data-testid="tr-warning-confirm" />
                <span>{w.message}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {changed ? (
          <button type="button" disabled={disabled} onClick={save} className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="tr-save">
            Guardar cambios
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled || changed || blockers.length > 0 || pending.length > 0 || (!!areaBlock && !item.area) || (item.current && item.text?.status === "approved" && item.area?.status !== "draft" && !item.features.some((f) => f.status === "draft"))}
          onClick={() => onApprove(confirmed)}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          data-testid="tr-approve"
        >
          Aprobar y usar en este catálogo
        </button>
        {item.text?.status === "draft" ? (
          <button type="button" disabled={disabled} onClick={onReject} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 disabled:opacity-50" data-testid="tr-reject">
            Rechazar
          </button>
        ) : null}
        {changed ? <span className="self-center text-xs text-amber-800">Guarda los cambios antes de aprobar.</span> : null}
        {!changed && pending.length ? <span className="self-center text-xs text-amber-800">Confirma cada aviso para aprobar.</span> : null}
      </div>
    </div>
  );
}
