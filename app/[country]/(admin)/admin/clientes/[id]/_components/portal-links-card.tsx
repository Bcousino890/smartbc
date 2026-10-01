"use client";

// ============================================================================
// Overview · ANUNCIOS DE PORTALES
//
// Es donde aterriza lo que se manda desde la extensión de Chrome ("SmartBC ·
// Enviar a una ficha"). Hasta ahora eso solo se veía entrando en Propiedades y
// bajando hasta el tercer bloque: desde Resumen no había forma de saber que
// habían llegado anuncios nuevos. Esta tarjeta lo dice en la primera pantalla
// y lleva directa al bloque donde se trabajan.
//
// No reemplaza al bloque grande (`PortalLinksBlock`): ahí se llama, se anota,
// se reparte y se crea la ficha. Aquí solo se cuenta y se enseña lo último.
// ============================================================================

import { ArrowRight, Building2, Puzzle } from "lucide-react";
import { useMemo } from "react";
import type { PortalLinkWithNotes } from "@/lib/portal-links/types";
import { portalLabel } from "@/lib/portal-links/portals";
import { isFreshLink, type PortalLinkSummary } from "@/lib/portal-links/summary";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useTn } from "./plural";
import { RelativeTime } from "./relative-time";
import { Panel, Pill } from "./ui";

const LATEST = 3;

export function PortalLinksCard({
  links,
  summary,
  clientName,
  locale,
  onGo,
}: {
  links: PortalLinkWithNotes[];
  summary: PortalLinkSummary;
  clientName: string;
  locale: string;
  onGo: () => void;
}) {
  const t = useT();
  const tn = useTn();

  // Lo último que llegó, no lo primero de la cola de prioridad: la pregunta
  // al abrir la ficha es "¿qué me han mandado?".
  const latest = useMemo(
    () =>
      [...links]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, LATEST),
    [links],
  );

  // "Nuevo" se mide contra el instante del resumen (calculado en el
  // servidor), no contra `Date.now()`: así el servidor y el navegador marcan
  // las mismas filas.
  const at = summary.computedAt ? new Date(summary.computedAt) : null;
  const isFresh = (l: PortalLinkWithNotes) => Boolean(at && isFreshLink(l, at));

  return (
    <Panel
      title={t("cc.overview.portalLinks")}
      count={summary.total}
      action={
        <button
          type="button"
          onClick={onGo}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink/55 transition hover:text-ink"
        >
          {summary.total > 0 ? t("cc.overview.goPortalLinks") : t("cc.overview.addPortalLinks")}
          <ArrowRight size={11} strokeWidth={2} />
        </button>
      }
    >
      {summary.total === 0 ? (
        <div className="text-xs leading-relaxed text-ink/50">
          <p>{t("cc.overview.portalLinksEmpty")}</p>
          <p className="mt-2 flex items-start gap-1.5 text-ink/45">
            <Puzzle size={12} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold-dark" />
            <span>{t("cc.overview.portalLinksHowTo", { name: clientName })}</span>
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {summary.fresh > 0 && (
              <Pill tone="gold">{tn("cc.portal.fresh", summary.fresh)}</Pill>
            )}
            {summary.callbacks > 0 && (
              <Pill tone="warning">{tn("cc.portal.callbacks", summary.callbacks)}</Pill>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Cell label={t("cc.portal.toCall")} value={summary.toCall} emphasis={summary.toCall > 0} />
            <Cell label={t("cc.portal.toVisit")} value={summary.toVisit} />
            <Cell label={t("cc.portal.converted")} value={summary.converted} />
          </dl>

          <ul className="mt-4 space-y-2 border-t border-ink/8 pt-3">
            {latest.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={onGo}
                  className="group flex w-full items-center gap-2.5 text-left"
                >
                  {l.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.image_url}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-9 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-ink/5 text-ink/25">
                      <Building2 size={13} strokeWidth={1.5} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {isFresh(l) && (
                        <span
                          aria-label={t("cc.portal.newBadge")}
                          title={t("cc.portal.newBadge")}
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                        />
                      )}
                      <span className="truncate text-xs font-medium text-ink group-hover:text-gold-dark">
                        {l.title || t("cc.portal.untitled")}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/45">
                      {l.price_label && <span className="tabular-nums text-ink/65">{l.price_label}</span>}
                      {l.price_label && <span aria-hidden>·</span>}
                      <span className="truncate">{portalLabel(l.portal)}</span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      l.status === "to_visit"
                        ? "text-emerald-700"
                        : l.status === "discarded"
                          ? "text-ink/35"
                          : "text-ink/50",
                    )}
                  >
                    {t(`cc.portal.status.${l.status}`)}
                  </span>
                </button>
              </li>
            ))}
            {summary.total > LATEST && (
              <li className="text-xs text-ink/35">
                {t("clientes.ficha.moreCount", { count: summary.total - LATEST })}
              </li>
            )}
          </ul>

          {summary.lastAddedAt && (
            <p className="mt-3 text-xs text-ink/40">
              {t("cc.portal.lastAdded")}{" "}
              <RelativeTime at={summary.lastAddedAt} locale={locale} className="text-ink/60" />
            </p>
          )}
        </>
      )}
    </Panel>
  );
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
      <dt className="crm-label-sm mt-1 text-ink/40">{label}</dt>
    </div>
  );
}
