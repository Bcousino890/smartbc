"use client";

import type { LinkedAd } from "@/lib/particulares/links-types";
import { cn } from "@/lib/utils";
import { formatEuros } from "./format";
import { opMetrics, type Op, type SourceEvent, signedPct } from "./group-history";

/**
 * Cabecera de datos del inmueble (modelo Casafari): días en el mercado en
 * venta (v) y alquiler (a), % del último cambio de precio, €/m² y precio +
 * estado de venta y alquiler a la vez cuando es el mismo inmueble.
 */
export function GroupHeader({ members, events }: { members: LinkedAd[]; events: SourceEvent[] }) {
  const sale = opMetrics("sale", members, events);
  const rent = opMetrics("rent", members, events);
  if (!sale && !rent) return null;
  const ms = [sale, rent].filter((x): x is NonNullable<typeof sale> => !!x);

  const days = ms.map((m) => (m.days != null ? `${m.days}${ms.length > 1 ? `(${m.op === "sale" ? "v" : "a"})` : ""}` : null));
  const daysText = days.every((d) => d == null) ? "—" : ms.map((m, i) => days[i] ?? `—(${m.op === "sale" ? "v" : "a"})`).join(" ");
  const withPct = ms.filter((m) => m.lastChangePct != null);

  const cell = (label: string, value: React.ReactNode, tone?: string) => (
    <div className="min-w-0 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink/65">{label}</p>
      <p className={cn("mt-0.5 truncate text-lg font-semibold tabular-nums text-ink", tone)}>{value}</p>
    </div>
  );

  const opCell = (m: NonNullable<typeof sale>) => {
    const label = m.op === "sale" ? "Venta" : "Alquiler";
    const price = m.price != null ? formatEuros(m.price, { monthly: m.op === "rent" }) : null;
    return (
      <div key={m.op} className="min-w-0 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/65">
          {label}
          <span
            className={cn(
              "rounded-full px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal",
              m.status === "active" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800",
            )}
          >
            {m.status === "active" ? "Activo" : "No disponible"}
          </span>
        </p>
        <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-ink">{price ?? "—"}</p>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {ms.map(opCell)}
      {cell("Días en el mercado", daysText)}
      {cell(
        "Último cambio de precio",
        withPct.length ? withPct.map((m) => `${signedPct(m.lastChangePct as number)}${ms.length > 1 ? ` (${m.op === "sale" ? "v" : "a"})` : ""}`).join(" ") : "—",
        withPct.some((m) => (m.lastChangePct as number) < 0) ? "text-emerald-800" : withPct.length ? "text-red-800" : undefined,
      )}
      {cell(
        "Precio por m²",
        ms.map((m) => (m.pricePerM2 != null ? `${m.pricePerM2.toLocaleString("es-ES")} €${ms.length > 1 ? ` (${m.op === "sale" ? "v" : "a"})` : ""}` : null)).filter(Boolean).join(" · ") || "—",
      )}
    </div>
  );
}

export type { Op };
