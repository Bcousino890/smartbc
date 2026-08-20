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
import { ArrowUpRight, ChevronDown, ImageOff } from "lucide-react";
import type { LeadGroup } from "@/lib/sales-inbox/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/plural";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/admin/ui/primitives";
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
  // Un piso con el trabajo hecho arranca plegado: lo que se busca al abrir la
  // bandeja es lo que falta.
  const [open, setOpen] = useState(group.attentionCount > 0 || group.count <= 3);

  const ids = group.leads.map((l) => l.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  return (
    <li className="border-b-2 border-ink/10">
      {/* ── El piso ── */}
      {/* Pegajosa: un piso con sesenta y una consultas se recorre entero sin
          perder de vista de cuál se está hablando. */}
      <div
        className={cn(
          "sticky top-0 z-10 flex items-start gap-2.5 border-b border-ink/8 px-3 py-2 backdrop-blur-sm",
          group.attentionCount > 0 ? "bg-cream-100/95" : "bg-cream-50/95",
        )}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleGroup(ids, e.target.checked)}
            aria-label={t("inbox.group.selectAll", { property: group.title ?? "" })}
            className="mt-1.5 h-3.5 w-3.5 shrink-0 accent-[#8a6d3b]"
          />
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        >
          <span className="mt-0.5 flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-ink/[0.06]">
            {group.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.coverUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageOff size={14} strokeWidth={1.6} className="text-ink/25" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 truncate text-sm font-semibold text-ink">
                {group.title ?? t("inbox.group.noProperty")}
              </span>
              <span className="ms-auto shrink-0 text-xs text-ink/35">
                <RelativeTime at={group.lastLeadAt} locale={config.locale} />
              </span>
            </span>

            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/45">
              <span className="font-medium text-ink/60">
                {tn("inbox.group.count", group.count)}
              </span>
              {group.newCount > 0 && (
                <span className="text-amber-700">
                  {tn("inbox.group.newCount", group.newCount)}
                </span>
              )}
              {group.reference && <span>{group.reference}</span>}
              {group.price !== null && (
                <span>{config.formatPrice(group.price, null, group.operation)}</span>
              )}
              {group.zone && <span>{group.zone}</span>}
              {!group.propertyId && (
                <Pill tone="warning">{t("inbox.group.noFile")}</Pill>
              )}
            </span>
          </span>

          <ChevronDown
            size={14}
            strokeWidth={1.9}
            className={cn(
              "mt-1 shrink-0 text-ink/30 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {group.propertyId && (
          <Link
            href={`${config.prefix}/propiedades/${group.propertyId}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={t("inbox.property.open")}
            className="mt-1 shrink-0 rounded p-1 text-ink/35 transition hover:text-ink"
          >
            <ArrowUpRight size={13} strokeWidth={2} />
          </Link>
        )}
      </div>

      {/* ── Quién ha preguntado por él ── */}
      {open && (
        <ul>
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
