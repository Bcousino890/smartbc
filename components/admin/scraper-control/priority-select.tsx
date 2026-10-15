"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { isEstimatedPortal, zoneCredits, zoneListings, type ScraperZone, type ZonePriority } from "@/lib/scrapers/control-types";
import { COMPONENT_LABEL, COST_COMPONENTS, fmtDays, listingOnlyEstimate } from "@/lib/scrapers/cost-model";
import { FOCUS_RING } from "@/app/[country]/(admin)/admin/particulares/_lista/controls";
import { fmt } from "./shared";
import { useZoneCost } from "./zone-cost";

// Regla del dueño (opt-in): solo se escanea lo marcado. En base de datos «Marcada» = 'normal'
// y «Sin marcar» = 'off'; «Alta» = marcada y se revisa el doble de seguido.
const OPTIONS: Array<{ value: ZonePriority; label: string; on: string }> = [
  { value: "normal", label: "Marcada", on: "bg-ink font-semibold text-cream-50" },
  { value: "alta", label: "Alta", on: "bg-gold/25 font-semibold text-ink shadow-[inset_0_0_0_1.5px_rgba(168,138,82,0.9)]" },
  { value: "off", label: "Sin marcar", on: "bg-red-50 font-semibold text-red-800 shadow-[inset_0_0_0_1.5px_rgba(185,28,28,0.55)]" },
];

/** Selector de 3 estados (radiogroup): 44 px de alto, flechas ←/→ para cambiar. */
export function PrioritySelect({
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  value: ZonePriority;
  onChange: (v: ZonePriority) => void;
  label: string;
  disabled: boolean;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[n].value);
    refs.current[n]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex h-11 w-full items-stretch rounded-xl border border-ink/10 bg-white p-0.5 sm:w-[17.5rem] sm:shrink-0", className)}>
      {OPTIONS.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "min-w-0 flex-1 whitespace-nowrap rounded-[10px] px-1 text-sm transition disabled:cursor-not-allowed",
              active ? o.on : "font-medium text-ink/70 hover:bg-ink/[0.04] hover:text-ink",
              FOCUS_RING,
            )}
          >
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Nº de anuncios y coste de una zona. Prioridad: gasto REAL medido por el crawler (con su proyección
 * mensual y el reparto por componente); si la zona aún no tiene datos medidos, se dice claramente y se
 * enseña la cota baja antigua rotulada como «solo listado, cota baja». Nunca un número inventado.
 */
export function ZoneInfo({ z, hasKids = false }: { z: ScraperZone; hasKids?: boolean }) {
  const n = zoneListings(z);
  const zc = useZoneCost(z);
  const low = listingOnlyEstimate(z);
  const kids = hasKids ? <span> (con sus barrios)</span> : null;
  const estimated = isEstimatedPortal(z.portal);
  const lowLabel = (v: number) => (
    <span className="text-ink/60">
      {estimated ? <>estimación: ≈ {fmt(v)} créditos/mes</> : <>cota baja: ≈ {fmt(v)} créditos/mes, solo listado</>}
    </span>
  );
  let cost: React.ReactNode;
  if (zc.status === "medido" && zc.cost) {
    const c = zc.cost;
    const parts = COST_COMPONENTS.filter((k) => c.projected[k] > 0).map((k) => `${COMPONENT_LABEL[k].replace(" (puntual)", "").toLowerCase()} ${fmt(c.projected[k])}`);
    cost = (
      <>
        {z.priority === "off" ? (
          <>
            Ya no se escanea · gasto reciente medido ≈ {fmt(c.projectedTotal)} créditos/mes <span className="font-semibold text-emerald-800">que dejas de gastar</span>
          </>
        ) : (
          <>
            Gasto real ≈ <span className="font-semibold text-ink">{fmt(c.projectedTotal)} créditos/mes</span>
          </>
        )}
        {kids}
        <span className="block text-xs text-ink/65">
          Medido {fmt(c.total)} créditos{zc.provisional ? " en menos de 1 día (provisional)" : ` en ${fmtDays(zc.days)}`}
          {parts.length > 0 && <> · al mes: {parts.join(" · ")}</>}
          {c.perListing != null && <> · {fmt(c.perListing)} créditos por anuncio al mes</>}
        </span>
      </>
    );
  } else if (zc.status === "sin-gasto") {
    cost =
      z.priority === "off" ? (
        <>No gasta nada.</>
      ) : (
        <>
          <span className="font-medium text-amber-800">Sin gasto medido todavía en esta zona.</span> {low != null ? lowLabel(z.priority === "alta" ? zoneCredits(low, "alta") : low) : "Tampoco hay anuncios contados."}
        </>
      );
  } else {
    // El crawler aún no ha publicado gasto medido: solo la cota baja, bien rotulada.
    cost =
      low == null ? (
        "Coste: sin datos aún"
      ) : z.priority === "off" ? (
        <>
          No gasta nada · <span className="font-semibold text-emerald-800">{estimated ? "ahorras" : "ahorras al menos"} {fmt(low)} créditos/mes</span> <span className="text-ink/60">{estimated ? "(estimación)" : "(solo listado, cota baja)"}</span>
          {kids}
        </>
      ) : (
        <>
          <span className="font-medium text-amber-800">Sin medir aún.</span> {lowLabel(z.priority === "alta" ? zoneCredits(low, "alta") : low)}
          {kids}
        </>
      );
  }
  return (
    <>
      <p className="text-sm text-ink/70">
        {n == null ? (
          "Anuncios: aún sin contar"
        ) : (
          <>
            {fmt(n)} anuncios
            {z.listings_private != null && <> · {fmt(z.listings_private)} de particulares</>}
          </>
        )}
      </p>
      <p className="text-sm text-ink/70">{cost}</p>
    </>
  );
}
