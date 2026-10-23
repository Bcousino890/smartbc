"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import type { ActionResult } from "@/lib/catalogs/access";
import { CATALOG_LANGUAGES, LANGUAGE_LABELS, TRANSLATION_REVIEW_REQUIRED, type CatalogLanguage } from "@/lib/catalogs/i18n";
import { LANGUAGE_NAMES_ES, TARGET_LANGUAGES, type TargetLanguage } from "@/lib/catalogs/translation-labels";
import type { PanelItem, PanelState, ReviewEdit } from "@/lib/catalogs/translation-service";

// Idiomas del catálogo · traducción AUTOMÁTICA, como en los itinerarios
// (decisión de Fabricio del 22-10-2026; antes PR6). Esta pestaña es OPCIONAL:
//   · El idioma del catálogo y el de cada enlace personal se aplican al
//     momento. La primera vez que alguien abre el enlace en ese idioma, lo que
//     falta se traduce solo con la IA configurada y se publica si pasa los
//     filtros (sin contacto ni precio); mientras, «Descripción en preparación».
//   · Aquí se ve el estado por idioma, se corrige a mano cualquier bloque (lo
//     guardado a mano manda y no lo pisa una traducción automática mientras el
//     español no cambie) y se puede traducir antes de compartir.
//   · ar, tr y he siguen marcados «sin revisión nativa».

type Msg = { kind: "ok" | "info" | "error"; text: string } | null;
type Res = ActionResult<{ version?: number }>;

export interface TranslationActions {
  load: (i: { catalogId: string; lang: string }) => Promise<ActionResult<{ panel: PanelState }>>;
  prepareNow: (i: { catalogId: string; lang: string }) => Promise<ActionResult<{ started: boolean }>>;
  save: (i: { catalogId: string; edit: ReviewEdit }) => Promise<Res>;
  markReviewed: (i: { catalogId: string; key: string; lang: string }) => Promise<ActionResult<{ changed: number }>>;
  setCatalogLang: (i: { catalogId: string; lang: string }) => Promise<Res>;
  setLinkLang: (i: { catalogId: string; linkId: string; lang: string | null }) => Promise<Res>;
}

export const AUTO_NOTE =
  "Elegir un idioma lo aplica al momento. La primera vez que alguien abre el enlace en ese idioma, las viviendas se traducen solas con la IA configurada (Configuración → IA) y se publican si no tienen teléfonos, correos ni precios; mientras tanto, cada una enseña «Descripción en preparación». Datos, fotos y precios salen siempre de la ficha actual.";

const COST_NOTE =
  "Cada vivienda se traduce una vez por idioma y por versión del texto en español (una llamada a la IA, con coste). Visitas a la vez no repiten la llamada. Si una traducción falla, se reintenta sola tras 5 min, 30 min, 2 h y 12 h; tras 5 fallos seguidos, solo con «Preparar ahora».";

const STATE_TONE: Record<PanelItem["state"], string> = {
  current: "bg-emerald-50 text-emerald-800",
  review: "bg-amber-50 text-amber-900",
  ready: "bg-sky-50 text-sky-800",
  busy: "bg-sky-50 text-sky-900",
  blocked: "bg-red-50 text-red-800",
  waiting: "bg-orange-50 text-orange-900",
  stopped: "bg-red-50 text-red-800",
  outdated: "bg-orange-50 text-orange-900",
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

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function NativeMark({ lang }: { lang: CatalogLanguage }) {
  if (!TRANSLATION_REVIEW_REQUIRED.has(lang)) return null;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900" data-testid={`native-${lang}`}>
      sin revisión nativa
    </span>
  );
}

/** Opciones de idioma con la marca «sin revisión nativa» (como el diálogo de
 *  itinerarios). */
export function LanguageOptions({ inheritLabel }: { inheritLabel?: string }) {
  return (
    <>
      {inheritLabel ? <option value="">{inheritLabel}</option> : null}
      {CATALOG_LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {langName(l)}
          {TRANSLATION_REVIEW_REQUIRED.has(l) ? " · sin revisión nativa" : ""}
        </option>
      ))}
    </>
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

function stateText(it: PanelItem): string {
  if (it.state === "waiting" && it.retry.until) return `Falló: se reintentará sola a partir de las ${hhmm(it.retry.until)}`;
  if (it.state === "stopped") return `Sin reintentos automáticos (${it.retry.failures} fallos)`;
  if ((it.state === "current" || it.state === "review") && it.featuresMissing > 0) return `${it.stateLabel} · faltan ${it.featuresMissing} características`;
  return it.stateLabel;
}

export function LanguagesSection({
  catalogId,
  actions,
  onPublicChange,
  catalogLang,
  onCatalogLang,
}: {
  catalogId: string;
  actions: TranslationActions;
  onPublicChange?: () => void;
  /** El idioma del catálogo que conoce el gestor (también se cambia en «Compartir»). */
  catalogLang?: CatalogLanguage;
  onCatalogLang?: (l: CatalogLanguage) => void;
}) {
  const [lang, setLang] = useState<TargetLanguage>("en");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [watchUntil, setWatchUntil] = useState(0);
  const langRef = useRef(lang);
  langRef.current = lang;

  const reload = useCallback(async (l: TargetLanguage = langRef.current) => {
    const r = await actions.load({ catalogId, lang: l });
    if (l !== langRef.current) return;
    if (r.ok) setPanel(r.panel);
    else setMsg({ kind: "error", text: r.error });
  }, [actions, catalogId]);

  useEffect(() => {
    void reload(lang);
  }, [lang, reload]);
  // Si el idioma del catálogo cambió desde «Compartir», el panel se pone al día
  // (una vez por cambio, sin bucles si el gestor tuviera un valor viejo).
  const seenLang = useRef(catalogLang);
  useEffect(() => {
    if (catalogLang === seenLang.current) return;
    seenLang.current = catalogLang;
    void reload();
  }, [catalogLang, reload]);

  // Mientras algo se traduce (o tras «Preparar ahora»), se vuelve a mirar.
  const anyBusy = !!panel?.items.some((i) => i.state === "busy");
  useEffect(() => {
    if (!anyBusy && Date.now() > watchUntil) return;
    const t = setInterval(() => {
      void reload();
    }, 2500);
    return () => clearInterval(t);
  }, [anyBusy, watchUntil, reload]);

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
  const items = panel?.items ?? [];
  const count = (s: PanelItem["state"][]) => items.filter((i) => s.includes(i.state)).length;
  const todo = items.filter((i) => i.state !== "current" && i.state !== "review" && i.state !== "busy" && i.state !== "blocked").length;
  const active = panel?.active.includes(lang) ?? false;

  return (
    <div className="space-y-5">
    {/* Rediseño 2026-10-23: título de la sección; paneles y controles, los de siempre. */}
    <div>
      <h2 className="text-base font-medium text-ink">Idiomas del catálogo</h2>
      <p className="mt-0.5 text-sm text-ink/65">El idioma del enlace general y el de cada cliente, y las traducciones de este catálogo.</p>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" data-testid="languages-section">
      <div className="min-w-0 space-y-4">
        <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="lang-cat-title" data-testid="lang-catalog" data-check-overflow="idiomas">
          <h3 id="lang-cat-title" className="crm-label-sm flex items-center gap-1.5 text-ink">
            <Languages className="h-4 w-4" aria-hidden="true" /> Idioma de los enlaces
          </h3>
          <p className="text-xs text-ink/60" data-testid="lang-auto-note">{AUTO_NOTE}</p>
          <label className="block text-sm text-ink/70">
            <span className="block">Idioma del catálogo</span>
            <select
              value={panel?.defaultLang ?? "es"}
              disabled={!panel || busy !== null}
              onChange={(e) => {
                const v = e.target.value as CatalogLanguage;
                void run("cat-lang", () => actions.setCatalogLang({ catalogId, lang: v }), () => {
                  onCatalogLang?.(v);
                  return { kind: "ok", text: `El catálogo está ahora en ${LANGUAGE_NAMES_ES[v]}. Los enlaces abiertos se actualizan solos.` };
                });
              }}
              className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink"
              data-testid="lang-catalog-select"
            >
              <LanguageOptions />
            </select>
          </label>
          {panel ? (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink/60" data-testid="lang-catalog-current">
              Ahora: {langName(panel.defaultLang)} <NativeMark lang={panel.defaultLang} />
            </p>
          ) : null}
          <ul className="space-y-1" aria-label="Viviendas traducidas por idioma" data-testid="lang-progress">
            {TARGET_LANGUAGES.map((l) => {
              const p = progressOf(l);
              return (
                <li key={l} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/70" data-testid={`lang-progress-${l}`}>
                  <span className="flex items-center gap-1.5">
                    {langName(l)} <NativeMark lang={l} />
                  </span>
                  <span className={p?.complete ? "font-semibold text-emerald-800" : ""}>
                    {p ? (p.complete ? "Todo traducido" : `${p.current} de ${p.total} traducidas`) : "…"}
                  </span>
                </li>
              );
            })}
          </ul>
          {panel && panel.links.filter((l) => l.state !== "revoked").length ? (
            <div className="space-y-2 border-t border-gold/10 pt-3" data-testid="lang-links">
              <p className="text-sm font-semibold text-ink/80">Enlaces personales</p>
              <p className="text-xs text-ink/55">Cada enlace puede tener su idioma; no cambia el de los demás.</p>
              {panel.links.filter((l) => l.state !== "revoked").map((l) => (
                <LinkLang
                  key={l.id}
                  link={l}
                  catalogLang={panel.defaultLang}
                  disabled={busy !== null}
                  onApply={(v) => run(`link:${l.id}`, () => actions.setLinkLang({ catalogId, linkId: l.id, lang: v }), () => ({ kind: "ok", text: `El enlace de ${l.clientName} está ahora en ${LANGUAGE_NAMES_ES[(v ?? panel.defaultLang) as CatalogLanguage]}. Los demás enlaces no cambian.` }))}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="min-w-0 space-y-4">
        <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="lang-work-title" data-testid="lang-work">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 id="lang-work-title" className="crm-label-sm text-ink">Traducciones (opcional)</h3>
            <label className="text-sm text-ink/70">
              <span className="sr-only">Idioma</span>
              <select value={lang} onChange={(e) => { setOpen(null); setPanel(null); setLang(e.target.value as TargetLanguage); }} className="rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink" data-testid="lang-work-select">
                {TARGET_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {langName(l)}
                    {TRANSLATION_REVIEW_REQUIRED.has(l) ? " · sin revisión nativa" : ""}
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
          <p className="text-xs text-ink/60">
            Se traducen y se publican solas. Aquí puedes corregir cualquier texto (lo que guardes a mano tiene prioridad) o traducir antes de compartir.
            {active ? " Este idioma lo usa ahora algún enlace." : ""}
          </p>
          <p className="text-xs text-ink/55" data-testid="lang-cost-note">{COST_NOTE}</p>
          {panel ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/70" data-testid="tr-summary">
              <span>Traducidas: {count(["current", "review"])}</span>
              <span>En preparación: {count(["busy"])}</span>
              <span>Revisar: {count(["review"])}</span>
              <span>No publicadas: {count(["blocked"])}</span>
              <span>Desactualizadas: {count(["outdated"])}</span>
              <span>Pendientes: {count(["none", "ready", "waiting", "stopped"])}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!panel || busy !== null || todo === 0}
              onClick={() =>
                run("prepare-now", () => actions.prepareNow({ catalogId, lang }), () => {
                  setWatchUntil(Date.now() + 180_000);
                  return { kind: "info", text: `Traduciendo en segundo plano lo que falta en ${LANGUAGE_NAMES_ES[lang]}. Esta lista se actualiza sola.` };
                })
              }
              className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold disabled:opacity-50"
              data-testid="tr-prepare-now"
            >
              {todo ? `Preparar ahora (${todo})` : "Nada pendiente"}
            </button>
          </div>
          <Notice msg={msg} />
          {panel === null ? (
            <p className="text-xs text-ink/50">Cargando…</p>
          ) : (
            <ul className="divide-y divide-gold/10" data-testid="tr-items">
              {items.map((it) => (
                <TrRow
                  key={`${it.key}:${lang}`}
                  item={it}
                  lang={lang}
                  open={open === it.key}
                  busy={busy}
                  onToggle={() => setOpen(open === it.key ? null : it.key)}
                  onSave={(edit) => run(`save:${it.key}`, () => actions.save({ catalogId, edit }), () => ({ kind: "ok", text: "Guardado y publicado en este catálogo. Ninguna traducción automática lo cambiará mientras el español no cambie." }))}
                  onReviewed={() => run(`reviewed:${it.key}`, () => actions.markReviewed({ catalogId, key: it.key, lang }), () => ({ kind: "ok", text: "Marcada como revisada." }))}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
    </div>
  );
}

function LinkLang({ link, catalogLang, disabled, onApply }: { link: PanelState["links"][number]; catalogLang: CatalogLanguage; disabled: boolean; onApply: (v: string | null) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-2" data-testid="lang-link">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{link.clientName}</span>
      <select
        value={link.lang ?? ""}
        disabled={disabled}
        onChange={(e) => onApply(e.target.value || null)}
        aria-label={`Idioma del enlace de ${link.clientName}`}
        className="max-w-full rounded-lg border border-gold/25 bg-white px-2 py-1 text-sm text-ink"
        data-testid="lang-link-select"
      >
        <LanguageOptions inheritLabel={`El del catálogo (${LANGUAGE_NAMES_ES[catalogLang]})`} />
      </select>
    </label>
  );
}

function TrRow(p: {
  item: PanelItem;
  lang: TargetLanguage;
  open: boolean;
  busy: string | null;
  onToggle: () => void;
  onSave: (edit: ReviewEdit) => void;
  onReviewed: () => void;
}) {
  const it = p.item;
  const disabled = p.busy !== null;
  const canEdit = !!it.text && it.text.status !== "rejected";
  const blockers = (it.check?.blockers ?? []).filter((b) => !b.where.startsWith("feature:"));
  const warnings = it.check?.warnings ?? [];
  return (
    <li className="space-y-2 py-3" data-testid="tr-item" data-key={it.key} data-state={it.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{it.kind === "meta" ? "Título e introducción del catálogo" : it.title}</p>
          <p className="text-xs text-ink/55">
            {it.kind === "meta" ? it.title : it.library ? "Texto aprobado de la biblioteca" : "Lo que enseña hoy este catálogo"}
            {it.text?.approval === "manual" || it.text?.origin === "manual" ? " · corregida a mano" : it.text?.approval === "auto" ? " · publicada sola" : ""}
            {it.text?.reused ? " · reutilizada de otro catálogo (sin IA)" : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${STATE_TONE[it.state]}`} data-testid="tr-state">
          {stateText(it)}
        </span>
      </div>
      {it.state === "blocked" ? (
        <p className="text-xs text-red-800" data-testid="tr-blocked">
          No se ha publicado: {blockers.map((b) => `${b.code === "text_has_price" ? "menciona un precio" : "tiene un teléfono, un correo o una web"} (${whereLabel(b.where)})`).join("; ")}. El cliente sigue viendo «Descripción en preparación». Corrígela y guárdala.
        </p>
      ) : null}
      {it.state === "review" ? (
        <p className="text-xs text-amber-900" data-testid="tr-review-note">
          Publicada sola con {warnings.length === 1 ? "un aviso" : `${warnings.length} avisos`} (cifras o nombres propios). Revísala si quieres.
        </p>
      ) : null}
      {it.state === "outdated" ? (
        <p className="text-xs text-orange-900" data-testid="tr-outdated">
          {it.kind === "meta"
            ? "El título o la introducción en español cambiaron: el cliente ve el título traducido anterior hasta la próxima visita."
            : "El español de esta vivienda cambió: el cliente ve «Descripción en preparación» y se vuelve a traducir sola en la próxima visita."}
        </p>
      ) : null}
      {(it.state === "waiting" || it.state === "stopped") && it.job?.note ? (
        <p className="text-xs text-ink/55" data-testid="tr-job-note">Último intento: {it.job.note}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <button type="button" onClick={p.onToggle} aria-expanded={p.open} className="rounded-lg border border-gold/40 bg-white px-2 py-1 text-xs font-semibold text-ink/80" data-testid="tr-edit">
            {p.open ? "Cerrar" : it.state === "blocked" ? "Corregir" : "Ver y corregir"}
          </button>
        ) : null}
        {it.state === "review" ? (
          <button type="button" disabled={disabled} onClick={p.onReviewed} className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-50" data-testid="tr-reviewed">
            Dar por revisada
          </button>
        ) : null}
      </div>
      {p.open && canEdit ? <Editor item={it} lang={p.lang} disabled={disabled} onSave={p.onSave} /> : null}
    </li>
  );
}

function Editor({ item, lang, disabled, onSave }: { item: PanelItem; lang: TargetLanguage; disabled: boolean; onSave: (e: ReviewEdit) => void }) {
  const own = item.es.blocks.filter((b) => !b.area);
  const areaBlock = item.es.blocks.find((b) => b.area) ?? null;
  const [title, setTitle] = useState(item.text?.title ?? "");
  const [intro, setIntro] = useState(item.text?.intro ?? "");
  const [blocks, setBlocks] = useState<string[]>(own.map((b) => b.tr ?? ""));
  const [area, setArea] = useState(areaBlock?.tr ?? "");
  const [feats, setFeats] = useState<Record<string, string>>(Object.fromEntries(item.features.map((f) => [f.es, f.tr ?? ""])));
  const textChanged =
    title !== (item.text?.title ?? "") || (item.kind === "meta" && intro !== (item.text?.intro ?? "")) || blocks.some((b, i) => b !== (own[i]?.tr ?? ""));
  const areaChanged = !!areaBlock && !!item.area && area !== (areaBlock.tr ?? "");
  const featChanged = item.features.filter((f) => (feats[f.es] ?? "") !== (f.tr ?? "") && (feats[f.es] ?? "").trim());
  const changed = textChanged || areaChanged || featChanged.length > 0;
  const blockers = item.check?.blockers ?? [];
  const warnings = item.check?.warnings ?? [];
  const fieldDir = lang === "ar" || lang === "he" ? "rtl" : "ltr";
  // Un bloqueo de una traducción automática solo se arregla guardando a mano.
  const mustSave = item.state === "blocked";

  function save() {
    onSave({
      key: item.key,
      lang,
      text: (textChanged || mustSave) && item.text ? { id: item.text.id, rev: item.text.rev, title, intro: item.kind === "meta" ? intro : undefined, blocks: item.kind === "meta" ? undefined : blocks } : null,
      area: areaChanged && item.area ? { id: item.area.id, rev: item.area.rev, body: area } : null,
      features: featChanged.map((f) => ({ es: f.es, tr: feats[f.es] })),
    });
  }
  const box = "w-full rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-gold";
  return (
    <div className="space-y-3 rounded-lg border border-gold/15 bg-cream-50/50 p-3" data-testid="tr-editor">
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
            <p className="mt-1 text-xs text-ink/55">Se traduce una vez y se reutiliza en todas las viviendas con esta plantilla.</p>
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
            <li key={i}>{b.code === "text_has_price" ? "Menciona un precio" : "Tiene un teléfono, un correo o una web"} ({whereLabel(b.where)}). Quítalo antes de guardar.</li>
          ))}
        </ul>
      ) : null}
      {warnings.length ? (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="tr-warnings">
          {warnings.map((w) => (
            <li key={w.id}>{w.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled || (!changed && !mustSave)} onClick={save} className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="tr-save">
          Guardar y publicar
        </button>
        <span className="text-xs text-ink/55">Se publica al momento en este catálogo.</span>
      </div>
    </div>
  );
}
