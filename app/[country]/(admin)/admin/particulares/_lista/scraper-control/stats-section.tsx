"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PORTAL_LABEL } from "@/lib/scrapers/control-types";
import type { StatsOpFilter, StatsPayload, StatsPeriod, StatsPortalFilter, StatsZoneRow } from "@/lib/scrapers/stats-types";
import { Segmented } from "../controls";
import { BTN_SECONDARY, Notice, Section, fmt } from "./shared";

const ENDPOINT = "/api/admin/particulares/scraper-control";

const PERIODS = [
  { value: "7" as const, label: "7 días" },
  { value: "30" as const, label: "30 días" },
  { value: "billing" as const, label: "Facturación" },
];
const PORTALS = [
  { value: "all" as const, label: "Todos" },
  { value: "idealista" as const, label: "Idealista" },
  { value: "fotocasa" as const, label: "Fotocasa" },
  { value: "pisos" as const, label: "Pisos.com" },
  { value: "habitaclia" as const, label: "Habitaclia" },
];
const OPS = [
  { value: "all" as const, label: "Venta y alquiler" },
  { value: "sale" as const, label: "Venta" },
  { value: "rent" as const, label: "Alquiler" },
];

const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`);
const dec = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-ES", { maximumFractionDigits: 1 }));
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-cream-50/60 px-4 py-3">
      <p className="text-sm text-ink/70">{label}</p>
      <p className="crm-number mt-0.5 text-[22px] text-ink">{value}</p>
      {detail && <p className="mt-0.5 text-sm text-ink/70">{detail}</p>}
    </div>
  );
}

type ChartMetric = "newListings" | "takenDown" | "credits";
const METRICS = [
  { value: "newListings" as const, label: "Nuevos" },
  { value: "takenDown" as const, label: "Bajas" },
  { value: "credits" as const, label: "Créditos" },
];

/** Gráfico de barras diario, sin librerías: una barra por día. */
function DailyChart({ daily }: { daily: StatsPayload["daily"] }) {
  const [metric, setMetric] = useState<ChartMetric>("newListings");
  const max = Math.max(1, ...daily.map((d) => d[metric]));
  const total = daily.reduce((n, d) => n + d[metric], 0);
  const label = METRICS.find((m) => m.value === metric)!.label.toLowerCase();
  const color = metric === "credits" ? "bg-gold-dark" : metric === "takenDown" ? "bg-red-500" : "bg-emerald-600";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">Evolución diaria</h4>
        <Segmented value={metric} onChange={setMetric} options={METRICS} ariaLabel="Qué mostrar en el gráfico" />
      </div>
      <div role="img" aria-label={`Gráfico diario de ${label}: ${fmt(total)} en total en ${daily.length} días`} className="mt-3 flex h-40 items-end gap-[3px]">
        {daily.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayLabel(d.day)}: ${fmt(d[metric])} ${label}`}>
            <div className={cn("w-full rounded-t-sm", color, d[metric] === 0 && "opacity-0")} style={{ height: `${Math.max(2, (d[metric] / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-sm text-ink/70">
        <span className="whitespace-nowrap">{dayLabel(daily[0].day)}</span>
        <span className="whitespace-nowrap">{dayLabel(daily[daily.length - 1].day)}</span>
      </div>
      <p className="text-sm text-ink/70">
        Total: {fmt(total)} · Máximo en un día: {fmt(max)}
      </p>
    </div>
  );
}

function Ranking({ title, hint, rows, value, showPortal }: { title: string; hint?: string; rows: StatsZoneRow[]; value: (z: StatsZoneRow) => string; showPortal: boolean }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-cream-50/60 p-4">
      <h4 className="text-sm font-bold text-ink">{title}</h4>
      {hint && <p className="text-sm text-ink/65">{hint}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink/65">Sin datos todavía.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {rows.map((z, i) => (
            <li key={`${z.portal}|${z.zone_key}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">
                <span className="mr-1.5 text-ink/60">{i + 1}.</span>
                {z.label}
                {showPortal && <span className="text-ink/60"> ({PORTAL_LABEL[z.portal]})</span>}
              </span>
              <span className="shrink-0 font-semibold text-ink">{value(z)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function StatsSection() {
  const [period, setPeriod] = useState<StatsPeriod>("30");
  const [portal, setPortal] = useState<StatsPortalFilter>("all");
  const [op, setOp] = useState<StatsOpFilter>("all");
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${ENDPOINT}?stats=1&period=${period}&portal=${portal}&op=${op}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "No tienes permiso para ver las estadísticas." : "No se pudieron leer las estadísticas.");
        return ((await res.json()) as { stats: StatsPayload }).stats;
      })
      .then((s) => {
        if (cancelled) return;
        setData(s);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "No se pudieron leer las estadísticas."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period, portal, op, nonce]);

  const top = useMemo(() => {
    const z = data?.zones ?? [];
    const by = (f: (r: StatsZoneRow) => number, keep: (r: StatsZoneRow) => boolean = () => true) =>
      z.filter(keep).sort((a, b) => f(b) - f(a)).slice(0, 5);
    return {
      down: by((r) => r.priceDown, (r) => r.priceDown > 0),
      up: by((r) => r.priceUp, (r) => r.priceUp > 0),
      fresh: by((r) => r.newListings, (r) => r.newListings > 0),
      cost: by((r) => r.credits, (r) => r.credits > 0),
      // Rendimiento: créditos por anuncio nuevo; cuanto más alto, peor rinde la zona.
      perf: z.filter((r) => r.creditsPerNew != null).sort((a, b) => b.creditsPerNew! - a.creditsPerNew!).slice(0, 5),
    };
  }, [data]);

  const maxTask = Math.max(1, ...(data?.tasks ?? []).map((t) => t.credits));

  return (
    <div className="space-y-5">
      <Section id="stats-filtros" title="Estadísticas" description="Lo que ha encontrado y gastado el crawler. Se calcula cada día; el día de hoy puede cambiar durante la jornada.">
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
          <Segmented value={period} onChange={setPeriod} options={PERIODS} ariaLabel="Periodo (7 días, 30 días o mes de facturación)" />
          <Segmented value={portal} onChange={setPortal} options={PORTALS} ariaLabel="Portal" />
          <Segmented value={op} onChange={setOp} options={OPS} ariaLabel="Operación" />
        </div>
        {data && <p className="mt-2 text-sm text-ink/70">Del {dayLabel(data.from)} al {dayLabel(data.to)}.</p>}
      </Section>

      {loading && !data ? (
        <p role="status" className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-ink/70">
          Cargando estadísticas…
        </p>
      ) : error ? (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <button type="button" className={BTN_SECONDARY} onClick={() => setNonce((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      ) : data && !data.tableReady ? (
        <Notice tone="warn">Las estadísticas aún no están instaladas en el servidor (se instalan solas con la próxima versión).</Notice>
      ) : data && !data.hasData ? (
        <Notice tone="info">
          Todavía no hay estadísticas para este periodo y filtros. El crawler las rellena cada día; aparecerán tras su próxima ejecución.
        </Notice>
      ) : data ? (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <Section id="stats-kpis" title="Resumen">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Kpi label="Anuncios nuevos" value={fmt(data.kpis.newListings)} detail={data.kpis.reactivated > 0 ? `${fmt(data.kpis.reactivated)} reactivados` : undefined} />
              <Kpi label="Bajas" value={fmt(data.kpis.takenDown)} detail="anuncios retirados" />
              <Kpi label="Créditos usados" value={fmt(data.kpis.credits)} detail={`${fmt(data.kpis.requests)} peticiones`} />
              <Kpi label="Bajadas de precio" value={fmt(data.kpis.priceDown)} />
              <Kpi label="Subidas de precio" value={fmt(data.kpis.priceUp)} />
              <Kpi label="Cambio medio de precio" value={pct(data.kpis.avgChangePct)} detail="negativo = baja" />
            </div>
            <div className="mt-5">
              <DailyChart daily={data.daily} />
            </div>
          </Section>

          <Section id="stats-zonas" title="Ranking de zonas" description="Las cinco zonas que más destacan en cada apartado.">
            <div className="grid gap-3 md:grid-cols-2">
              <Ranking title="Más bajadas de precio" rows={top.down} value={(z) => `${fmt(z.priceDown)} · ${pct(z.avgChangePct)}`} showPortal={portal === "all"} />
              <Ranking title="Más subidas de precio" rows={top.up} value={(z) => `${fmt(z.priceUp)} · ${pct(z.avgChangePct)}`} showPortal={portal === "all"} />
              <Ranking title="Más anuncios nuevos" rows={top.fresh} value={(z) => fmt(z.newListings)} showPortal={portal === "all"} />
              <Ranking title="Más créditos gastados" rows={top.cost} value={(z) => `${fmt(z.credits)} créd.`} showPortal={portal === "all"} />
              <div className="md:col-span-2">
                <Ranking
                  title="Rendimiento: créditos por anuncio nuevo"
                  hint="Cuanto más alto, más caro te sale cada anuncio nuevo en esa zona. Ideal para decidir qué zonas dejar sin marcar."
                  rows={top.perf}
                  value={(z) => `${dec(z.creditsPerNew)} créd./anuncio`}
                  showPortal={portal === "all"}
                />
              </div>
            </div>
          </Section>

          <Section id="stats-tareas" title="Créditos por tarea" description="En qué tareas del crawler se van los créditos.">
            {data.tasks.length === 0 ? (
              <p className="text-sm text-ink/65">Sin datos por tarea todavía.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.tasks.map((t) => (
                  <li key={t.task}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink">{t.label}</span>
                      <span className="font-semibold text-ink">
                        {fmt(t.credits)} créd. <span className="font-normal text-ink/65">· {fmt(t.requests)} pet.</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                      <div className="h-full rounded-full bg-gold-dark" style={{ width: `${(t.credits / maxTask) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ) : null}
    </div>
  );
}
