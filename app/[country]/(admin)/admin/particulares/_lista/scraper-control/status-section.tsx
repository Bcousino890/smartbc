"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, PauseCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PORTAL_LABEL,
  SCRAPER_PORTALS,
  type Light,
  type ScraperControlPayload,
  type ScraperHealth,
  type ScraperMode,
  type ScraperTask,
} from "@/lib/scrapers/control-types";
import { Section, fmt, inTime, relTime, shortDate } from "./shared";

const LIGHT: Record<Light, { dot: string; chip: string; icon: typeof CheckCircle2; word: string }> = {
  verde: { dot: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2, word: "Verde" },
  ambar: { dot: "bg-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-900", icon: AlertTriangle, word: "Ámbar" },
  rojo: { dot: "bg-red-600", chip: "border-red-200 bg-red-50 text-red-800", icon: XCircle, word: "Rojo" },
  apagado: { dot: "bg-ink/30", chip: "border-ink/15 bg-ink/[0.04] text-ink/70", icon: CircleSlash, word: "Apagado" },
};

const MODE_LABEL: Record<ScraperMode, { label: string; help: string }> = {
  normal: { label: "Normal", help: "Hay créditos de sobra: se hace todo." },
  ahorro: { label: "Ahorro", help: "Quedan pocos créditos del presupuesto: solo lo esencial." },
  pausa: { label: "Pausa", help: "Presupuesto agotado: no se gasta nada más este periodo." },
};

const RUN_STATUS: Record<string, string> = {
  running: "en curso",
  completed: "bien",
  partial: "parcial",
  failed: "con error",
  stopped: "parada",
};

function TaskRow({ t, now }: { t: ScraperTask; now: number }) {
  const bad = t.status === "failed";
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-ink/10 py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{t.label}</p>
        <p className="text-xs text-ink/65">{t.help}</p>
      </div>
      <p className={cn("text-right text-sm sm:text-left", bad ? "font-semibold text-red-700" : "text-ink/80")}>
        {t.startedAt ? (
          <>
            {relTime(t.startedAt, now)}
            <span className="block text-xs text-ink/65">
              {RUN_STATUS[t.status ?? ""] ?? t.status}
              {t.requestsUsed != null ? ` · ${fmt(t.requestsUsed)} pet.` : ""}
            </span>
          </>
        ) : (
          <span className="text-ink/60">Aún sin ejecutar</span>
        )}
      </p>
      <p className="col-span-2 text-xs text-ink/65 sm:col-span-1 sm:text-sm sm:text-ink/80">
        Próxima: {inTime(t.nextRunAt, now)}
      </p>
    </li>
  );
}

function ScraperCard({ h, now }: { h: ScraperHealth; now: number }) {
  const L = LIGHT[h.light];
  const Icon = L.icon;
  const mode = h.mode ? MODE_LABEL[h.mode] : null;
  return (
    <article className="rounded-xl border border-ink/10 bg-cream-50/60 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-bold text-ink">{PORTAL_LABEL[h.portal]}</h4>
        {/* El color nunca va solo: icono y texto dicen lo mismo (daltonismo). */}
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold", L.chip)}>
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", L.dot)} />
          <Icon size={14} aria-hidden="true" />
          <span className="sr-only">{L.word}: </span>
          {h.headline}
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-ink/65">Última señal</dt>
          <dd className="font-medium text-ink">{relTime(h.lastHeartbeatAt, now)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/65">Modo</dt>
          <dd className="font-medium text-ink" title={mode?.help}>
            {mode ? mode.label : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink/65">Clave en uso</dt>
          <dd className="font-medium text-ink">{h.keyHint ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/65">Último particular nuevo</dt>
          <dd className="font-medium text-ink">{relTime(h.lastPrivateFoundAt, now)}</dd>
        </div>
      </dl>

      {h.alarms.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label={`Alarmas de ${PORTAL_LABEL[h.portal]}`}>
          {h.alarms.map((a) => (
            <li key={a} className="flex gap-2 rounded-lg bg-white px-3 py-2 text-sm text-ink/85 ring-1 ring-ink/10">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/65">Tareas</p>
        <ul>
          {h.tasks.map((t) => (
            <TaskRow key={t.runType} t={t} now={now} />
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink/60">Cada cuánto se lanza cada tarea lo fija el servidor; aquí solo se muestra.</p>
      </div>
    </article>
  );
}

/** Estado real: semáforo por scraper, créditos del periodo y tareas. */
export function StatusSection({ data }: { data: ScraperControlPayload }) {
  const now = new Date(data.serverNow).getTime();
  const { settings } = data;
  const used = data.creditsPeriod;
  const budget = settings.budgetCredits;
  const pct = used == null ? 0 : Math.min(100, (used / Math.max(budget, 1)) * 100);
  const reservePct = Math.max(0, ((budget - settings.reserveCredits) / Math.max(budget, 1)) * 100);
  const mode = data.mode ? MODE_LABEL[data.mode] : null;

  return (
    <Section id="estado" title="Estado real" description="Se actualiza solo cada 30 segundos. Verde: todo bien. Ámbar: funciona pero con avisos. Rojo: no está haciendo su trabajo.">
      <div className="rounded-xl border border-ink/10 bg-cream-50/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-semibold text-ink">Créditos de Crawio este periodo</p>
          <p className="text-xs text-ink/65">
            {shortDate(data.periodStart)} – {shortDate(data.periodEnd)} (renueva el día {settings.billingDay})
          </p>
        </div>
        <p className="mt-1 text-2xl font-bold text-ink">
          <span className="crm-number">{used == null ? "Sin dato" : fmt(used)}</span>
          <span className="ml-2 text-sm font-normal text-ink/70">
            de {fmt(budget)} de presupuesto · plan de {fmt(settings.planCredits)}
          </span>
        </p>
        <div
          role="progressbar"
          aria-label="Créditos gastados del presupuesto mensual"
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-valuenow={used ?? 0}
          className="relative mt-3 h-3 overflow-hidden rounded-full bg-ink/10"
        >
          <div
            className={cn("h-full rounded-full", data.mode === "pausa" ? "bg-red-600" : data.mode === "ahorro" ? "bg-amber-500" : "bg-emerald-600")}
            style={{ width: `${pct}%` }}
          />
          {/* Marca donde empieza el modo ahorro (presupuesto − reserva). */}
          <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `${reservePct}%` }} />
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-ink/80">
          {mode ? (
            <>
              <PauseCircle size={14} aria-hidden="true" className="shrink-0" />
              <span>
                Modo <strong>{mode.label}</strong>: {mode.help}
              </span>
            </>
          ) : (
            <span>El crawler aún no ha informado de su consumo.</span>
          )}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {SCRAPER_PORTALS.map((p) => (
          <ScraperCard key={p} h={data.health[p]} now={now} />
        ))}
      </div>
    </Section>
  );
}
