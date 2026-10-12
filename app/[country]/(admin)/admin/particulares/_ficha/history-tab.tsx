"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CircleCheck, CircleSlash, Eye, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatEuros, portalName } from "./format";
import { GroupHeader } from "./group-header";
import { EVENT_LABEL, type EventKind, type SourceEvent } from "./group-history";
import { PortalBadge } from "./sources-tab";
import { useGroupLinks } from "./use-group-links";

const DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const yearOf = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(iso)));

const KIND_STYLE: Record<EventKind, { icon: ReactNode; chip: string }> = {
  start: { icon: <Eye size={13} />, chip: "bg-sky-50 text-sky-900 border-sky-200" },
  drop: { icon: <ArrowDown size={13} />, chip: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  rise: { icon: <ArrowUp size={13} />, chip: "bg-red-50 text-red-800 border-red-200" },
  down: { icon: <CircleSlash size={13} />, chip: "bg-red-50 text-red-800 border-red-200" },
  active: { icon: <CircleCheck size={13} />, chip: "bg-emerald-50 text-emerald-900 border-emerald-200" },
};

function EventCard({ e }: { e: SourceEvent }) {
  const rent = e.op === "rent";
  const eur = (n: number | null) => (n != null ? formatEuros(n, { monthly: rent }) : "—");
  const st = KIND_STYLE[e.kind];
  return (
    <li className="w-[232px] shrink-0 snap-start rounded-xl border border-ink/10 bg-white p-3 shadow-[0_1px_2px_rgba(40,28,10,0.05)]">
      <p className="text-xs font-medium text-ink/65">{DATE.format(new Date(e.date))}</p>
      <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
        <PortalBadge portal={e.portal} className="h-6 w-6 text-[11px]" />
        <span className="truncate">{portalName(e.portal)}</span>
        {e.op && <span className="ml-auto rounded bg-ink/10 px-1.5 py-px text-[10px] font-semibold uppercase text-ink/80">{e.op === "rent" ? "Alq." : "Venta"}</span>}
      </p>
      <p className={cn("mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", st.chip)}>
        {st.icon}
        {EVENT_LABEL[e.kind]}
      </p>
      {(e.kind === "drop" || e.kind === "rise") && e.from != null ? (
        <p className="mt-2 text-sm font-semibold tabular-nums text-ink">
          {eur(e.from)} <span className="text-ink/50">→</span> {eur(e.price)}
        </p>
      ) : (
        <p className="mt-2 text-sm font-semibold tabular-nums text-ink">{eur(e.price)}</p>
      )}
      {e.kind === "start" && <p className="mt-1.5 text-xs leading-snug text-ink/65">Hemos empezado a monitorizar esta fuente a partir de esta fecha.</p>}
    </li>
  );
}

/**
 * «Histórico»: cabecera de datos del inmueble y línea de tiempo horizontal por
 * años, con una tarjeta por evento de cada fuente (nuevo, bajada/subida de
 * precio, no disponible, activo).
 */
export function HistoryTab({ rowId, children }: { rowId: string; children?: ReactNode }) {
  const { members, events, loading } = useGroupLinks(rowId);
  const years = useMemo(() => [...new Set(events.map((e) => yearOf(e.date)))].sort((a, b) => b - a), [events]);
  const [year, setYear] = useState<number | null>(null);
  const scroller = useRef<HTMLUListElement>(null);
  const sel = year != null && years.includes(year) ? year : (years[0] ?? null);
  const list = useMemo(() => events.filter((e) => sel != null && yearOf(e.date) === sel), [events, sel]);

  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
  }, [sel]);

  if (loading || members === null)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-ink/70">
        <Loader2 size={14} className="animate-spin" /> Cargando histórico…
      </p>
    );

  const scrollBy = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  const arrow = "inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-white text-ink transition hover:border-ink/40";

  return (
    <div className="space-y-5">
      <GroupHeader members={members} events={events} />
      <section className="rounded-2xl border border-ink/10 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Histórico por fuente</h3>
          <div role="tablist" aria-label="Año" className="flex flex-wrap gap-1">
            {years.map((y) => (
              <button
                key={y}
                role="tab"
                type="button"
                aria-selected={sel === y}
                onClick={() => setYear(y)}
                className={cn(
                  "min-h-8 rounded-full px-3 text-xs font-semibold tabular-nums transition",
                  sel === y ? "bg-ink text-cream-50" : "border border-ink/15 text-ink/75 hover:text-ink",
                )}
              >
                {y}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            <button type="button" aria-label="Eventos anteriores" onClick={() => scrollBy(-1)} className={arrow}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label="Eventos siguientes" onClick={() => scrollBy(1)} className={arrow}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/70">Todavía no hay eventos registrados.</p>
        ) : (
          <div className="relative">
            <div aria-hidden className="absolute inset-x-0 top-[7px] h-px bg-ink/15" />
            <ul ref={scroller} className="relative flex snap-x gap-3 overflow-x-auto pb-2 pt-4">
              {list.map((e) => (
                <EventCard key={e.key} e={e} />
              ))}
            </ul>
          </div>
        )}
      </section>
      {children && (
        <details className="group rounded-2xl border border-ink/10 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold uppercase tracking-wide text-ink">
            Detalle del anuncio abierto (precio y cambios)
          </summary>
          <div className="border-t border-ink/10 p-4">{children}</div>
        </details>
      )}
    </div>
  );
}
