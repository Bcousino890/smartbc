"use client";

// ============================================================================
// Overview · dos resúmenes que evitan tener que entrar en las pestañas.
//
// No duplican los bloques grandes (esos siguen viviendo en Propiedades y en
// Visitas): responden a "¿cómo va su selección privada?" y "¿qué día tiene
// montado?" en cuatro líneas, y llevan al sitio donde se trabaja.
// ============================================================================

import { ArrowRight, Eye } from "lucide-react";
import type { ShortlistWithItems } from "@/lib/client-shortlist/types";
import type { ItineraryWithStops } from "@/lib/viewing-collections/types";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "./plural";
import { cn } from "@/lib/utils";
import { compareStopsByDay } from "@/lib/viewing-collections/order";
import { daysAway, formatDate } from "./format";
import { Empty, Panel, Pill, type Tone } from "./ui";

const SHORTLIST_TONE: Record<string, Tone> = {
  reviewing: "info",
  submitted: "positive",
  archived: "neutral",
};

const ITINERARY_TONE: Record<string, Tone> = {
  draft: "neutral",
  published: "positive",
  completed: "info",
  cancelled: "critical",
  archived: "neutral",
};

export function ShortlistStatusCard({
  shortlists,
  locale,
  onGo,
}: {
  shortlists: ShortlistWithItems[];
  locale: string;
  onGo: () => void;
}) {
  const t = useT();
  // La que importa es la última que sigue viva. Las archivadas son historia y
  // ya tienen su sitio en la línea de tiempo.
  const sl = shortlists.find((s) => s.status !== "archived") ?? shortlists[0];

  return (
    <Panel
      title={t("cc.overview.shortlist")}
      action={
        sl ? (
          <GoButton label={t("cc.overview.goProperties")} onClick={onGo} />
        ) : null
      }
    >
      {!sl ? (
        <Empty>{t("cc.overview.shortlistEmpty")}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={SHORTLIST_TONE[sl.status] ?? "neutral"}>
              {t(`cc.shortlist.status.${sl.status}`)}
            </Pill>
            {sl.linkState !== "active" && (
              <Pill tone="critical">{t(`cc.shortlist.link.${sl.linkState}`)}</Pill>
            )}
            {!sl.first_opened_at && sl.status === "reviewing" && (
              <Pill tone="warning">{t("cc.shortlist.unopened")}</Pill>
            )}
            {sl.updatedAfterSubmit && (
              <Pill tone="warning">{t("cc.shortlist.updatedAfter")}</Pill>
            )}
          </div>

          {/* Progreso: decidido sobre total, sin porcentajes ni gráficos. */}
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink/55">{t("cc.shortlist.decided")}</span>
              <span className="font-medium tabular-nums text-ink">
                {sl.counts.decided}/{sl.counts.total}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full rounded-full bg-ink/8">
              <div
                className="h-1 rounded-full bg-gold transition-[width] duration-500"
                style={{
                  width: sl.counts.total
                    ? `${(sl.counts.decided / sl.counts.total) * 100}%`
                    : "0%",
                }}
              />
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Cell label={t("cc.shortlist.mustVisit")} value={sl.counts.mustVisit} emphasis />
            <Cell label={t("cc.shortlist.maybe")} value={sl.counts.maybe} />
            <Cell label={t("cc.shortlist.notForMe")} value={sl.counts.notForMe} />
          </dl>

          <p className="mt-3 text-xs text-ink/40">
            {sl.submitted_at
              ? t("cc.shortlist.submittedOn", {
                  date: formatDate(sl.submitted_at, locale),
                })
              : t("cc.shortlist.sentOn", {
                  date: formatDate(sl.created_at, locale),
                })}
            {" · "}
            {t("cc.shortlist.expires", {
              date: formatDate(sl.expires_at, locale),
            })}
          </p>
        </>
      )}
    </Panel>
  );
}

export function ViewingDayCard({
  itineraries,
  locale,
  onGo,
}: {
  itineraries: ItineraryWithStops[];
  locale: string;
  onGo: () => void;
}) {
  const t = useT();
  const tn = useTn();

  // La jornada "activa" es la publicada o en borrador con la fecha más
  // cercana. Una completada o cancelada no es lo que uno busca al abrir la
  // ficha por la mañana.
  const live = itineraries
    .filter((i) => i.status === "draft" || i.status === "published")
    .sort((a, b) => {
      const da = a.scheduled_date ? new Date(a.scheduled_date).getTime() : Infinity;
      const db = b.scheduled_date ? new Date(b.scheduled_date).getTime() : Infinity;
      return da - db;
    })[0];

  return (
    <Panel
      title={t("cc.overview.viewingDay")}
      action={live ? <GoButton label={t("cc.overview.goViewings")} onClick={onGo} /> : null}
    >
      {!live ? (
        <Empty>{t("cc.overview.viewingDayEmpty")}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={ITINERARY_TONE[live.status] ?? "neutral"}>
              {t(`cc.itinerary.status.${live.status}`)}
            </Pill>
            {live.status === "draft" && live.readiness.blockers.length > 0 && (
              <Pill tone="warning">
                {tn("cc.itinerary.blockers", live.readiness.blockers.length)}
              </Pill>
            )}
          </div>

          <p className="mt-2.5 text-lg text-ink">
            {live.scheduled_date
              ? formatDate(live.scheduled_date, locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : t("cc.itinerary.noDate")}
          </p>
          {live.scheduled_date && (
            <p className="text-xs text-ink/45">
              {relativeDayLabel(live.scheduled_date, t, tn)}
            </p>
          )}

          <ul className="mt-3 space-y-1">
            {[...live.stops]
              .sort(compareStopsByDay)
              .slice(0, 4)
              .map((stop) => (
                <li
                  key={stop.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="min-w-0 truncate text-ink/75">
                    {stop.selection.property.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      stop.confirmation_status === "confirmed"
                        ? "text-emerald-700"
                        : "text-ink/40",
                    )}
                  >
                    {stop.time_pending || !stop.scheduled_at
                      ? t("cc.itinerary.timePending")
                      : formatDate(stop.scheduled_at, locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                  </span>
                </li>
              ))}
            {live.stops.length > 4 && (
              <li className="text-xs text-ink/35">
                {t("clientes.ficha.moreCount", { count: live.stops.length - 4 })}
              </li>
            )}
          </ul>

          {live.activeShare && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink/45">
              <Eye size={11} strokeWidth={1.75} className="text-emerald-600" />
              {tn("cc.itinerary.opens", live.activeShare.opensCount)}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function relativeDayLabel(
  iso: string,
  t: (k: string, v?: Record<string, string | number>) => string,
  tn: (k: string, n: number, v?: Record<string, string | number>) => string,
) {
  const d = daysAway(iso);
  if (d === null) return "";
  if (d === 0) return t("cc.itinerary.today");
  if (d === 1) return t("cc.itinerary.tomorrow");
  if (d > 0) return t("cc.itinerary.inDays", { count: d });
  return tn("cc.itinerary.daysAgo", Math.abs(d));
}

function Cell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dd
        className={cn(
          "crm-number text-[22px] leading-none",
          emphasis ? "text-gold-dark" : "text-ink",
        )}
      >
        {value}
      </dd>
      <dt className="crm-label-sm mt-1 text-ink/40">
        {label}
      </dt>
    </div>
  );
}

function GoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-ink/55 transition hover:text-ink"
    >
      {label}
      <ArrowRight size={11} strokeWidth={2} />
    </button>
  );
}
