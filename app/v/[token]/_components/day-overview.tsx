"use client";

// ============================================================================
// "Your Viewing Day" — el índice de la publicación.
//
// Debe entenderse en dos segundos: la hora manda, el nombre acompaña. Filetes
// finos en lugar de filas de tabla; el estado se dice con palabras.
// ============================================================================

import type {
  PublicStopStatus,
  PublicViewingStop,
} from "@/lib/viewing-collections/public-contract";
import type { CollectionDictionary } from "@/lib/viewing-collections/i18n";
import { Label, Ornament, Reveal, Rule } from "./editorial";
import { cn } from "@/lib/utils";

export function statusWord(
  t: CollectionDictionary,
): Record<PublicStopStatus, string> {
  return {
    confirmed: t.statusConfirmed,
    pending: t.statusPending,
    cancelled: t.statusCancelled,
  };
}

export function DayOverview({
  stops,
  dateLabel,
  windowLabel,
  onSelect,
  dict,
}: {
  stops: PublicViewingStop[];
  dateLabel: string;
  windowLabel: string | null;
  onSelect: (order: number) => void;
  dict: CollectionDictionary;
}) {
  const STATUS_WORD = statusWord(dict);
  if (stops.length === 0) return null;

  return (
    <section
      id="viewing-day"
      aria-labelledby="viewing-day-title"
      className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-28 lg:py-32"
    >
      <Reveal className="text-center">
        <Label tone="gold">{dict.dayLabel}</Label>
        <h2
          id="viewing-day-title"
          className="mt-4 font-serif text-[30px] font-normal vc-tight text-ink md:text-[42px]"
        >
          {dict.dayTitle}
        </h2>
        {(dateLabel || windowLabel) && (
          <p className="mt-4 font-sans text-[13px] text-ink/50 md:text-sm">
            {dateLabel}
            {windowLabel ? ` · ${windowLabel}` : ""}
          </p>
        )}
        <Ornament className="mt-8" />
      </Reveal>

      <Reveal delay={1} className="mt-12 md:mt-16">
        <Rule />
        <ol>
          {stops.map((stop) => (
            <li key={stop.order}>
              <button
                type="button"
                onClick={() => onSelect(stop.order)}
                className={cn(
                  "vc-focus group grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 py-5 text-left transition-colors duration-500 md:grid-cols-[3.5rem_7rem_1fr_auto] md:gap-x-6 md:py-6",
                  stop.status === "cancelled" && "opacity-45",
                )}
              >
                {/* Nº de capítulo */}
                <span className="font-display text-[10.5px] font-medium uppercase vc-tracked vc-nums text-ink/30 md:text-[11px]">
                  {String(stop.order).padStart(2, "0")}
                </span>

                {/* Hora — el dato dominante */}
                <span
                  className={cn(
                    "font-serif text-[24px] leading-none vc-nums text-ink md:text-[30px]",
                    !stop.timeLabel && "text-ink/25",
                    // Solo se tacha una hora real: tachar el guion de "sin
                    // hora" producía un borrón ilegible.
                    stop.status === "cancelled" &&
                      stop.timeLabel &&
                      "line-through decoration-ink/25",
                  )}
                >
                  {stop.timeLabel ??
                    (stop.timePending ? (
                      <span className="font-display text-[9.5px] uppercase vc-tracked-sm text-gold-dark">
                        {dict.timeToBeConfirmed}
                      </span>
                    ) : (
                      "—"
                    ))}
                </span>

                {/* Residencia */}
                <span className="col-span-2 mt-2 min-w-0 md:col-span-1 md:mt-0">
                  <span className="block truncate font-display text-[13px] font-medium uppercase vc-tracked-sm text-ink transition-colors duration-500 group-hover:text-gold-dark md:text-[14px]">
                    {stop.title}
                  </span>
                  <span className="mt-1 block truncate font-sans text-[11.5px] text-ink/45 md:text-[12px]">
                    {stop.zoneLabel}
                  </span>
                </span>

                {/* Estado — solo texto */}
                <span
                  className={cn(
                    "col-span-2 mt-2 font-display text-[9.5px] font-medium uppercase vc-tracked-sm md:col-span-1 md:mt-0 md:text-right md:text-[10px]",
                    stop.status === "confirmed" && "text-ink/45",
                    stop.status === "pending" && "text-gold-dark",
                    stop.status === "cancelled" && "text-ink/35",
                  )}
                >
                  {STATUS_WORD[stop.status]}
                </span>
              </button>
              <Rule />
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
