"use client";

// ============================================================================
// LÍNEA DE TIEMPO
//
// Ocho tablas, un solo hilo, en orden. Lo que hasta ahora había que reconstruir
// abriendo cinco bloques y comparando fechas a ojo.
//
// La columna que más se mira es QUIÉN: por eso el filtro principal separa lo
// que hizo el cliente de lo que hicimos nosotros, y cada fila lleva su marca.
// Una línea donde no se distingue "abrió su selección" de "le mandamos la
// selección" no sirve para decidir nada.
// ============================================================================

import { useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Eye,
  FileText,
  Heart,
  Link2,
  ListChecks,
  Phone,
  UserRound,
} from "lucide-react";
import type { TimelineEvent, TimelineSource } from "@/lib/client-command-center/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { formatDate } from "./format";
import { RelativeTime } from "./relative-time";
import { Empty, Panel } from "./ui";

const ICON: Record<TimelineSource, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  client: UserRound,
  shortlist: ListChecks,
  selection: Heart,
  portal_link: Phone,
  itinerary: CalendarDays,
  visit: Building2,
  application: FileText,
  analytics: Eye,
};

type ActorFilter = "all" | "client" | "agent";

export function ActivityTimeline({
  events,
  locale,
  /** Cuántos eventos se pintan de entrada. El resto, bajo demanda. */
  initial = 40,
  compact,
  title,
}: {
  events: TimelineEvent[];
  locale: string;
  initial?: number;
  compact?: boolean;
  title?: string;
}) {
  const t = useT();
  const [actor, setActor] = useState<ActorFilter>("all");
  const [limit, setLimit] = useState(initial);

  const filtered = useMemo(
    () =>
      actor === "all"
        ? events
        : events.filter((e) => (actor === "client" ? e.actor === "client" : e.actor !== "client")),
    [events, actor],
  );

  const shown = filtered.slice(0, limit);

  // Agrupar por día: sin esto, cuarenta filas con la fecha repetida se leen
  // como una lista de fechas en vez de como una historia.
  const groups = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const e of shown) {
      const day = e.at.slice(0, 10);
      const list = map.get(day);
      if (list) list.push(e);
      else map.set(day, [e]);
    }
    return [...map.entries()];
  }, [shown]);

  const filters: ActorFilter[] = ["all", "client", "agent"];

  return (
    <Panel
      title={title ?? t("cc.timeline.title")}
      count={events.length}
      action={
        compact ? null : (
          <div className="flex items-center gap-0.5 rounded-md border border-ink/10 p-0.5">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setActor(f)}
                className={cn(
                  "rounded px-2 py-1 text-[10.5px] font-medium transition",
                  actor === f ? "bg-ink text-cream-50" : "text-ink/50 hover:text-ink",
                )}
              >
                {t(`cc.timeline.filter.${f}`)}
              </button>
            ))}
          </div>
        )
      }
    >
      {shown.length === 0 ? (
        <Empty>{t("cc.timeline.empty")}</Empty>
      ) : (
        <>
          <div className="space-y-4">
            {groups.map(([day, items]) => (
              <section key={day}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/35">
                  {formatDate(items[0].at, locale, {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </h3>
                <ul className="space-y-0">
                  {items.map((e) => {
                    const Icon = ICON[e.source];
                    return (
                      <li key={e.id} className="flex gap-2.5 py-1.5">
                        <span
                          className={cn(
                            "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                            e.actor === "client"
                              ? "bg-gold/15 text-gold-dark"
                              : "bg-ink/[0.06] text-ink/45",
                          )}
                          title={t(`cc.timeline.by.${e.actor}`)}
                        >
                          <Icon size={11} strokeWidth={1.9} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] leading-snug text-ink/80">
                            {t(e.titleKey, e.vars)}
                            {e.detail && (
                              <span className="text-ink/45"> · {e.detail}</span>
                            )}
                          </p>
                          <p className="mt-px text-[10.5px] text-ink/35">
                            <RelativeTime at={e.at} locale={locale} />
                            {e.actorName ? ` · ${e.actorName}` : ""}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {filtered.length > shown.length && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + 60)}
              className="mt-4 w-full rounded-md border border-ink/12 py-2 text-[11.5px] font-medium text-ink/60 transition hover:border-gold/45 hover:text-ink"
            >
              {t("cc.timeline.more", { count: filtered.length - shown.length })}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
