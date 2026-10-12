"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { zoneBaseCredits, zoneCredits, zoneListings, type ScraperZone, type ZonePriority } from "@/lib/scrapers/control-types";
import { FOCUS_RING } from "../controls";
import { fmt } from "./shared";

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

/** Nº de anuncios y coste estimado de una zona (o «sin datos aún»; nunca un número inventado). */
export function ZoneInfo({ z, hasKids = false }: { z: ScraperZone; hasKids?: boolean }) {
  const n = zoneListings(z);
  const base = zoneBaseCredits(z);
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
      <p className="text-sm text-ink/70">
        {base == null ? (
          "Coste: sin datos aún"
        ) : z.priority === "off" ? (
          <>
            No gasta nada · <span className="font-semibold text-emerald-800">ahorras ≈ {fmt(base)} créditos/mes</span>
            {hasKids && <span> (con sus barrios)</span>}
          </>
        ) : z.priority === "alta" ? (
          <>≈ {fmt(zoneCredits(base, "alta"))} créditos/mes (hasta el doble)</>
        ) : (
          <>≈ {fmt(base)} créditos/mes{hasKids && <span> (con sus barrios)</span>}</>
        )}
      </p>
    </>
  );
}
