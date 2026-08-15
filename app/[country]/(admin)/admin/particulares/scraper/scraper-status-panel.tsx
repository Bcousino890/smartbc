"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
  PauseCircle,
  RefreshCw,
} from "lucide-react";
import type { ScraperState, ScraperStatus } from "@/lib/api/v1/idealista/status";

/**
 * Mini panel técnico del scraper.
 *
 * No es un dashboard comercial: solo tiene que dejar claro de un vistazo si el
 * scraper está vivo, parado o fallando, y dar los datos mínimos para saber por
 * qué. Se refresca solo cada 30 s.
 */

const STATE_STYLES: Record<
  ScraperState,
  { label: string; className: string; icon: typeof Activity; hint: string }
> = {
  RUNNING: {
    label: "Funcionando",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
    hint: "El scraper reporta con normalidad.",
  },
  IDLE: {
    label: "En reposo",
    className: "bg-sky-50 text-sky-800 border-sky-200",
    icon: Clock,
    hint: "Vivo pero sin trabajo en curso.",
  },
  STALE: {
    label: "Sin señal",
    className: "bg-amber-50 text-amber-900 border-amber-200",
    icon: AlertTriangle,
    hint: "Lleva demasiado tiempo sin dar señales de vida.",
  },
  ERROR: {
    label: "Con errores",
    className: "bg-red-50 text-red-800 border-red-200",
    icon: AlertTriangle,
    hint: "El scraper reporta un fallo.",
  },
  STOPPED: {
    label: "Detenido",
    className: "bg-stone-100 text-stone-700 border-stone-300",
    icon: PauseCircle,
    hint: "El scraping está desactivado en la configuración.",
  },
};

function relativeTime(iso: string | null): string {
  if (!iso) return "nunca";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "hace segundos";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-cream-50/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink/50">{label}</div>
      <div className="mt-1 font-serif text-lg font-semibold text-ink">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-ink/55">{detail}</div> : null}
    </div>
  );
}

export function ScraperStatusPanel() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/idealista/scraper/status", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo leer el estado");
      setStatus((await res.json()) as ScraperStatus);
      setError(null);
    } catch {
      setError("No se pudo leer el estado del scraper");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !status) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-cream-50/70 p-6 text-sm text-ink/60">
        Cargando estado del scraper…
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error ?? "Sin datos"}
      </div>
    );
  }

  const style = STATE_STYLES[status.state];
  const StateIcon = style.icon;
  const overBudget = status.month.percentage >= 100;
  const nearBudget = status.month.percentage >= 80;

  return (
    <div className="space-y-5">
      {/* Estado principal */}
      <div className={`flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${style.className}`}>
        <StateIcon size={32} />
        <div className="flex-1">
          <div className="font-serif text-xl font-semibold">{style.label}</div>
          <div className="text-sm opacity-80">{style.hint}</div>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-current/25 px-3 py-2 text-sm transition hover:bg-white/40"
        >
          <RefreshCw size={15} />
          Actualizar
        </button>
      </div>

      {/* Señales de vida */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Último heartbeat"
          value={relativeTime(status.last_heartbeat_at)}
          detail={`Umbral: ${status.stale_threshold_minutes} min`}
        />
        <Stat label="Último anuncio recibido" value={relativeTime(status.last_listing_at)} />
        <Stat
          label="Anuncios nuevos (24 h)"
          value={status.totals.listings_last_24h.toLocaleString("es-ES")}
        />
        <Stat
          label="Cambios detectados (24 h)"
          value={status.totals.events_last_24h.toLocaleString("es-ES")}
        />
      </div>

      {/* Cuota mensual */}
      <div className="rounded-2xl border border-ink/10 bg-cream-50/70 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-base font-semibold text-ink">Cuota del mes</h3>
          <span
            className={`text-sm font-semibold ${
              overBudget ? "text-red-700" : nearBudget ? "text-amber-700" : "text-ink/70"
            }`}
          >
            {status.month.requests_used.toLocaleString("es-ES")} /{" "}
            {status.month.budget.toLocaleString("es-ES")} ({status.month.percentage}%)
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full transition-all ${
              overBudget ? "bg-red-500" : nearBudget ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(status.month.percentage, 100)}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-ink/55">
          Reserva: {status.month.reserve.toLocaleString("es-ES")} peticiones ·{" "}
          {status.month.runs} ejecuciones este mes
          {overBudget ? " · presupuesto agotado, se está tirando de la reserva" : ""}
        </div>
      </div>

      {/* Inventario */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Anuncios activos"
          value={status.totals.listings_active.toLocaleString("es-ES")}
        />
        <Stat
          label="Desaparecidos"
          value={status.totals.listings_missing.toLocaleString("es-ES")}
          detail="Pendientes de confirmar"
        />
        <Stat
          label="Retirados"
          value={status.totals.listings_off_market.toLocaleString("es-ES")}
        />
      </div>

      {/* Último run */}
      <div className="rounded-2xl border border-ink/10 bg-cream-50/70 p-5">
        <h3 className="mb-3 font-serif text-base font-semibold text-ink">Última ejecución</h3>
        {status.last_run ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-lg bg-ink/5 px-2 py-1 font-mono text-xs text-ink/70">
                {status.last_run.external_run_id}
              </span>
              <span className="rounded-lg bg-gold/15 px-2 py-1 text-xs font-medium text-ink">
                {status.last_run.run_type}
              </span>
              <span className="text-ink/60">
                {status.last_run.status} · empezó {relativeTime(status.last_run.started_at)}
                {status.last_run.finished_at
                  ? ` · terminó ${relativeTime(status.last_run.finished_at)}`
                  : " · en curso"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Vistos" value={status.last_run.listings_seen.toLocaleString("es-ES")} />
              <Stat label="Nuevos" value={status.last_run.new_listings.toLocaleString("es-ES")} />
              <Stat
                label="Actualizados"
                value={status.last_run.updated_listings.toLocaleString("es-ES")}
              />
              <Stat label="Errores" value={status.last_run.errors_count.toLocaleString("es-ES")} />
              <Stat
                label="Cobertura"
                value={
                  status.last_run.coverage_percentage !== null
                    ? `${status.last_run.coverage_percentage}%`
                    : "—"
                }
                detail={
                  status.last_run.shards_total !== null
                    ? `${status.last_run.shards_success ?? 0}/${status.last_run.shards_total} shards`
                    : undefined
                }
              />
            </div>
            {status.last_run.error_summary ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {status.last_run.error_summary}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-ink/55">
            <CircleSlash size={16} />
            El scraper todavía no ha reportado ninguna ejecución.
          </div>
        )}
      </div>

      {/* Workers */}
      <div className="rounded-2xl border border-ink/10 bg-cream-50/70 p-5">
        <h3 className="mb-3 font-serif text-base font-semibold text-ink">Workers</h3>
        {status.workers.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-ink/55">
            <CircleSlash size={16} />
            Ningún worker se ha conectado todavía.
          </div>
        ) : (
          <div className="space-y-2">
            {status.workers.map((w) => {
              const ws = STATE_STYLES[w.state];
              return (
                <div
                  key={w.worker_id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-white/50 px-3 py-2.5"
                >
                  <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${ws.className}`}>
                    {ws.label}
                  </span>
                  <span className="font-mono text-sm text-ink">{w.worker_id}</span>
                  <span className="text-xs text-ink/55">
                    heartbeat {relativeTime(w.last_heartbeat_at)}
                    {w.current_run_type ? ` · ${w.current_run_type}` : ""}
                    {w.current_shard ? ` · shard ${w.current_shard}` : ""}
                  </span>
                  {w.message ? (
                    <span className="w-full text-xs text-ink/60">{w.message}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
