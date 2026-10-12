"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PORTAL_LABEL, SCRAPER_PORTALS, TASKS, type ScraperControlPayload, type ScraperPortal } from "@/lib/scrapers/control-types";
import {
  COMPONENT_HELP,
  COMPONENT_LABEL,
  COST_COMPONENTS,
  monthView,
  project30,
  rollupZoneCosts,
  sumComponents,
  type CostsPayload,
  type PortalCosts,
} from "@/lib/scrapers/cost-model";
import { Notice, Section, fmt } from "./shared";

const TASK_LABEL = new Map<string, string>([
  ...Object.values(TASKS).flat().map((t) => [t.type, t.label] as [string, string]),
  ["zones", "Recorrer el árbol de zonas"],
]);

const pctOf = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)} %` : "—");

function PortalBlock({ portal, pc, costs, data }: { portal: ScraperPortal; pc: PortalCosts | null; costs: CostsPayload; data: ScraperControlPayload }) {
  const days = costs.projectionDays;
  const proj = useMemo(() => (pc ? project30(pc.components, days) : null), [pc, days]);
  const zones = data.zones[portal];
  const labels = useMemo(() => new Map(zones.map((z) => [z.zone_key, z.label])), [zones]);
  const rolled = useMemo(() => rollupZoneCosts(zones, pc, days), [zones, pc, days]);
  const marked = zones.filter((z) => z.priority !== "off");
  const markedWithoutCost = marked.filter((z) => !((rolled.get(z.zone_key)?.total ?? 0) > 0)).length;

  if (!pc || !proj) {
    return (
      <div className="rounded-xl border border-ink/10 bg-cream-50/60 p-4">
        <h4 className="text-sm font-bold text-ink">{PORTAL_LABEL[portal]}</h4>
        <p className="mt-2 text-sm text-ink/70">Sin gasto medido todavía en este portal.</p>
      </div>
    );
  }

  const measuredTotal = sumComponents(pc.components);
  const projTotal = sumComponents(proj);
  const unattrib = sumComponents(pc.unattributed);
  const topZones = [...pc.leaves]
    .map((l) => ({ ...l, total: sumComponents(l.components) }))
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const gap = pc.totalCredits > 0 ? Math.abs(pc.totalCredits - measuredTotal) / pc.totalCredits : 0;

  return (
    <div className="rounded-xl border border-ink/10 bg-cream-50/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-bold text-ink">{PORTAL_LABEL[portal]}</h4>
        <p className="text-sm text-ink/70">
          Al mes: <strong className="crm-number text-ink">{fmt(projTotal)}</strong> créditos
        </p>
      </div>

      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Créditos de {PORTAL_LABEL[portal]} por componente</caption>
        <thead>
          <tr className="text-left text-xs text-ink/65">
            <th scope="col" className="py-1 pr-2 font-medium">
              Componente
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Medido
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Al mes
            </th>
            <th scope="col" className="py-1 pl-2 text-right font-medium">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {COST_COMPONENTS.map((k) => (
            <tr key={k} className="border-t border-ink/10" title={COMPONENT_HELP[k]}>
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink">
                {COMPONENT_LABEL[k]}
              </th>
              <td className="px-2 py-1.5 text-right text-ink/80">{fmt(pc.components[k])}</td>
              <td className="px-2 py-1.5 text-right font-semibold text-ink">{fmt(proj[k])}</td>
              <td className="py-1.5 pl-2 text-right text-ink/65">{pctOf(proj[k], projTotal)}</td>
            </tr>
          ))}
          <tr className="border-t border-ink/20 font-semibold text-ink">
            <th scope="row" className="py-1.5 pr-2 text-left">
              Total
            </th>
            <td className="px-2 py-1.5 text-right">{fmt(measuredTotal)}</td>
            <td className="px-2 py-1.5 text-right">{fmt(projTotal)}</td>
            <td className="py-1.5 pl-2 text-right">100 %</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-xs text-ink/65">
        «Medido» = {costs.provisional ? "créditos de hoy (parcial)" : `${costs.daysMeasured} ${costs.daysMeasured === 1 ? "día completo" : "días completos"}`}. «Al mes» = ritmo medido × 30 días; las reactivaciones son puntuales y no se multiplican.
      </p>

      {pc.tasks.length > 0 && (
        <div className="mt-4">
          <h5 className="text-sm font-bold text-ink">Por tarea del crawler</h5>
          <ul className="mt-1 space-y-1">
            {pc.tasks.slice(0, 8).map((t) => (
              <li key={t.task} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink">{TASK_LABEL.get(t.task) ?? t.task}</span>
                <span className="shrink-0 text-ink/80">
                  {fmt(t.credits)} <span className="text-ink/60">· al mes {fmt(days > 0 ? (t.credits * 30) / days : null)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topZones.length > 0 && (
        <div className="mt-4">
          <h5 className="text-sm font-bold text-ink">Dónde más se gasta</h5>
          <ol className="mt-1 space-y-1">
            {topZones.map((l, i) => {
              const main = COST_COMPONENTS.reduce((a, k) => (l.components[k] > l.components[a] ? k : a), COST_COMPONENTS[0]);
              return (
                <li key={l.zone_key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">
                    <span className="mr-1.5 text-ink/60">{i + 1}.</span>
                    {labels.get(l.zone_key) ?? l.zone_key}
                    <span className="text-ink/60"> · sobre todo {COMPONENT_LABEL[main].replace(" (puntual)", "").toLowerCase()}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-ink">{fmt(days > 0 ? (l.total * 30) / days : null)}/mes</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="mt-3 space-y-1 text-xs text-ink/70">
        {unattrib > 0 && (
          <p>
            {pctOf(unattrib, measuredTotal)} del gasto ({fmt(unattrib)} créditos) no se puede atribuir a una zona: el listado general de Madrid, el recorrido del árbol de zonas y los anuncios sin zona conocida.
          </p>
        )}
        {marked.length > 0 && markedWithoutCost > 0 && (
          <p className="font-medium text-amber-800">
            {markedWithoutCost} de {marked.length} zonas marcadas aún no tienen gasto medido: en la lista de zonas enseñan la cota baja de «solo listado».
          </p>
        )}
        {gap > 0.05 && <p>El reparto por componente difiere un {Math.round(gap * 100)} % del total publicado (días parciales o filas aún por recalcular).</p>}
      </div>
    </div>
  );
}

/** «Coste real de los créditos»: gasto medido por el crawler, proyección mensual y comparación con el presupuesto. */
export function CostSection({ data, costs, error }: { data: ScraperControlPayload; costs: CostsPayload | null; error: string | null }) {
  const s = data.settings;
  const daysLeft = Math.max(0, Math.ceil((new Date(data.periodEnd).getTime() + 86_400_000 - new Date(data.serverNow).getTime()) / 86_400_000));
  const month = costs ? monthView(costs, s.budgetCredits, data.creditsPeriod, daysLeft) : null;
  const renew = new Date(data.periodEnd).getTime() + 86_400_000;
  const renewLabel = new Date(renew).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <Section
      id="costes"
      title="Coste real de los créditos"
      description="Lo que Crawio cobra de verdad, medido petición a petición por el crawler: listado, fichas de anuncios nuevos, comprobación de bajas, refresco, reactivaciones y reintentos (los 404 también se cobran)."
    >
      {!costs ? (
        error ? (
          <Notice tone="warn">{error}</Notice>
        ) : (
          <p role="status" className="text-sm text-ink/70">
            Cargando el gasto medido…
          </p>
        )
      ) : !costs.tableReady ? (
        <Notice tone="warn">Las estadísticas de gasto aún no están instaladas en el servidor (se instalan solas con la próxima versión).</Notice>
      ) : !costs.hasData ? (
        <div className="space-y-2">
          <Notice tone="info">
            El crawler todavía no ha publicado gasto medido. Empezará con su primera ejecución tras instalar el libro de gasto y la proyección fiable necesita al menos un día de datos. Mientras tanto, cada zona
            enseña una estimación antigua rotulada «solo listado, cota baja»: <strong>el gasto real es bastante mayor</strong>.
          </Notice>
          {data.creditsPeriod != null && (
            <p className="text-sm text-ink/75">
              Créditos usados en el periodo actual (dato del crawler): <strong>{fmt(data.creditsPeriod)}</strong> de {fmt(s.budgetCredits)} · renueva el {renewLabel}.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {costs.provisional && (
            <Notice tone="warn">
              Solo hay datos de hoy, que aún no ha terminado: la proyección es provisional y se afinará mañana, con el primer día completo.
            </Notice>
          )}
          {month && (
            <div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Proyección a 30 días" value={fmt(month.projected30)} detail="créditos, al ritmo medido" />
                <Kpi label="Gastado en el periodo" value={month.spentPeriod == null ? "—" : fmt(month.spentPeriod)} detail={`renueva el ${renewLabel}`} />
                <Kpi label="Al renovar (previsión)" value={month.endOfPeriod == null ? "—" : fmt(month.endOfPeriod)} detail={`${daysLeft} ${daysLeft === 1 ? "día" : "días"} por delante`} />
                <Kpi label="Presupuesto" value={fmt(month.budget)} detail={`${month.pctOfBudget} % con la proyección`} />
              </div>
              <div
                role="img"
                aria-label={`Proyección a 30 días: ${fmt(month.projected30)} créditos, el ${month.pctOfBudget} % del presupuesto de ${fmt(month.budget)}`}
                className="mt-3 h-3 overflow-hidden rounded-full bg-ink/10"
              >
                <div
                  className={cn("h-full rounded-full", month.tone === "over" ? "bg-red-600" : month.tone === "warn" ? "bg-amber-500" : "bg-emerald-600")}
                  style={{ width: `${Math.min(100, month.pctOfBudget)}%` }}
                />
              </div>
              <p
                className={cn(
                  "mt-2 text-sm font-medium",
                  month.tone === "over" ? "text-red-800" : month.tone === "warn" ? "text-amber-900" : "text-emerald-800",
                )}
              >
                {month.tone === "over"
                  ? `A este ritmo se pasa del presupuesto de ${fmt(month.budget)} créditos: marca menos zonas o apaga agencias.`
                  : month.tone === "warn"
                    ? "A este ritmo se queda muy cerca del presupuesto: poco margen para imprevistos."
                    : "A este ritmo cabe en el presupuesto."}
              </p>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {SCRAPER_PORTALS.map((p) => (
              <PortalBlock key={p} portal={p} pc={costs.portals[p]} costs={costs} data={data} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-cream-50/60 px-4 py-3">
      <p className="text-sm text-ink/70">{label}</p>
      <p className="crm-number mt-0.5 text-[22px] text-ink">{value}</p>
      {detail && <p className="mt-0.5 text-sm text-ink/70">{detail}</p>}
    </div>
  );
}
