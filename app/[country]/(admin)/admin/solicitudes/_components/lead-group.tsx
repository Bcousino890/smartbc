"use client";

// ============================================================================
// UN PISO Y SU DEMANDA.
//
// 332 consultas se reparten en **27 propiedades**, y una sola concentra 61.
// Vistas en fila son una lista interminable; agrupadas por piso son una lista
// de pisos con quién ha preguntado por cada uno debajo — y de paso se ve de un
// vistazo cuál está tirando y cuál no.
//
// La cabecera del grupo no es decorativa: lleva la foto, la referencia, el
// precio actual de la ficha y cuántas consultas van sin trabajar.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { LeadGroup } from "@/lib/sales-inbox/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/plural";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { LeadRow } from "./lead-row";

export function LeadGroupBlock({
  group,
  country,
  activeLeadId,
  selected,
  selectable,
  onOpen,
  onToggleSelect,
  onToggleGroup,
}: {
  group: LeadGroup;
  country: Country;
  activeLeadId: string | null;
  selected: Set<string>;
  selectable: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  /** Marcar o desmarcar todas las consultas del piso de una vez. */
  onToggleGroup: (ids: string[], checked: boolean) => void;
}) {
  const t = useT();
  const tn = useTn();
  const config = getCountryConfig(country);
  // Como en el Figma (B01), cada anuncio es una tarjeta y sus solicitudes se
  // despliegan a demanda. Al volver de una ficha, el anuncio de esa solicitud
  // sigue abierto.
  const [open, setOpen] = useState(() => group.leads.some((l) => l.id === activeLeadId));

  const ids = group.leads.map((l) => l.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const latest = group.leads.reduce<(typeof group.leads)[number] | null>(
    (acc, l) => (!acc || l.createdAt > acc.createdAt ? l : acc),
    null,
  );
  const exact = group.kind === "exact";
  const listId = `group-leads-${group.key.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <li className="list-none rounded-xl border border-sol-line bg-sol-surface">
      <div className="flex flex-col gap-4 p-2.5 md:flex-row md:gap-6">
        {/* Foto del anuncio */}
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-lg bg-sol-column md:aspect-auto md:h-[180px] md:w-[248px]">
          {group.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center p-4 sol-ui text-sol-muted">
              {exact ? t("inbox.card.noImage") : t("inbox.card.noVerifiedImage")}
            </span>
          )}
          {selectable && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleGroup(ids, e.target.checked)}
              aria-label={t("inbox.group.selectAll", { property: group.title ?? "" })}
              className="absolute left-3 top-3 h-5 w-5 accent-sol-action"
            />
          )}
        </div>

        {/* El anuncio */}
        <div className="min-w-0 flex-1 px-1 md:py-2">
          <h3 className="truncate text-2xl font-semibold leading-tight text-sol-ink">
            {exact ? (group.title ?? t("inbox.group.noProperty")) : t("inbox.group.unverified")}
          </h3>
          {group.price !== null && (
            <p className="mt-2 text-[22px] font-semibold leading-tight tabular-nums text-sol-ink">
              {config.formatPrice(group.price, null, group.operation)}
            </p>
          )}
          <p className={cn("mt-2.5 flex flex-wrap gap-x-1.5 text-sm font-semibold", exact ? "text-sol-action" : "text-sol-review-ink")}>
            {exact ? (
              <>
                <span>{group.reference ?? t("inbox.card.noRef")}</span>
                <span aria-hidden>·</span>
                <span>{t("inbox.link.exact")}</span>
                {group.zone && <span className="font-normal text-sol-muted">· {group.zone}</span>}
              </>
            ) : (
              <span>{t("inbox.group.unverifiedHint")}</span>
            )}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-sol-select px-2.5 py-1 sol-meta font-semibold text-sol-action">
              {tn("inbox.group.leads", group.count)}
            </span>
            {group.newCount > 0 && (
              <span className="rounded-lg bg-sol-review px-2.5 py-1 sol-meta font-semibold text-sol-review-ink">
                {t("inbox.group.uncontacted", { count: group.newCount })}
              </span>
            )}
            {exact && (
              <span className="rounded-lg bg-sol-ink/[0.06] px-2.5 py-1 sol-meta font-semibold text-sol-muted">
                {t(`inbox.operation.${group.leadOperation ?? "unknown"}`)}
              </span>
            )}
          </p>
          {/* La ficha propia se abre por SLUG (`/propiedades/[slug]`); un
              anuncio de Idealista sin ficha propia vive en /idealista. */}
          {exact && (group.slug || group.listingId) && (
            <Link
              href={group.slug ? `${config.prefix}/propiedades/${group.slug}` : `${config.prefix}/idealista`}
              className="mt-3 inline-flex items-center gap-1 sol-meta font-medium text-sol-muted hover:text-sol-action"
            >
              {t("inbox.group.openProperty")}
              <ArrowUpRight size={13} strokeWidth={2} />
            </Link>
          )}
        </div>

        {/* Última consulta y acceso a la demanda */}
        <div className="flex shrink-0 flex-col justify-between gap-4 px-1 pb-1 md:w-[300px] md:py-3 md:pe-4 xl:w-[370px]">
          <div>
            <p className="sol-meta text-sol-muted">{t("inbox.group.lastEnquiry")}</p>
            <p className="mt-1 truncate text-lg font-semibold text-sol-ink">
              {latest?.name?.trim() || t("inbox.row.noName")}
            </p>
            <p className="mt-0.5 sol-meta text-sol-muted">
              <RelativeTime at={group.lastLeadAt} locale={config.locale} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={listId}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-sol-action px-4 sol-ui font-semibold text-sol-on-action transition hover:bg-sol-action-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-action"
          >
            {open ? t("inbox.group.hideLeads") : t("inbox.group.showLeads")}
            <ChevronDown size={16} strokeWidth={2} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* ── Quién ha preguntado por él ── */}
      {open && (
        <ul id={listId} className="border-t border-sol-line">
          {group.leads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              active={lead.id === activeLeadId}
              selected={selected.has(lead.id)}
              selectable={selectable}
              locale={config.locale}
              grouped
              onOpen={() => onOpen(lead.id)}
              onToggleSelect={(checked) => onToggleSelect(lead.id, checked)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
