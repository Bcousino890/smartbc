"use client";

// ============================================================================
// A · TARJETA DE SOLICITUD
//
// Lo que hay que reconocer en dos segundos, en este orden: la vivienda que
// consultó (foto, dirección, precio al consultar), si el anuncio está
// IDENTIFICADO, quién es y qué preguntó con sus palabras, quién la lleva y
// cuánto hace.
//
// La foto y el precio son los que la persona vio en Idealista (capturados del
// propio hilo): evidencia de lo que consultó. Si el anuncio no está
// identificado exactamente se dice al lado; nunca se le pone la foto de una
// ficha nuestra «parecida».
// ============================================================================

import { Globe, ImageOff } from "lucide-react";
import type { LeadListItem } from "@/lib/sales-inbox/types";
import { REASON_PRIORITY } from "@/lib/sales-inbox/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Pill, type Tone } from "@/components/admin/ui/primitives";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { LeadAvatar } from "./lead-avatar";

const LINK_TONE: Record<LeadListItem["linkStatus"], Tone> = {
  exact: "positive",
  unverified: "warning",
  conflict: "critical",
  no_data: "warning",
};

export function LinkBadge({ status }: { status: LeadListItem["linkStatus"] }) {
  const t = useT();
  return <Pill tone={LINK_TONE[status]}>{t(`inbox.link.${status}`)}</Pill>;
}

/** Responsable visible siempre: nombre, «Pendiente de reparto» o conflicto. */
export function OwnerBadge({ lead }: { lead: Pick<LeadListItem, "assignedName" | "assignedTo" | "routingStatus"> }) {
  const t = useT();
  if (lead.routingStatus === "conflict") {
    return <Pill tone="critical">{t("inbox.routing.conflict")}</Pill>;
  }
  if (!lead.assignedTo) return <Pill tone="warning">{t("inbox.routing.pending")}</Pill>;
  return <span className="truncate text-xs text-ink/70">{lead.assignedName ?? t("inbox.row.assigned")}</span>;
}

export function LeadCard({
  lead,
  active,
  locale,
  selectMode,
  selected,
  onOpen,
  onToggleSelect,
}: {
  lead: LeadListItem;
  active: boolean;
  locale: string;
  selectMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: (checked: boolean) => void;
}) {
  const t = useT();
  const top = lead.reasons.slice().sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b])[0];
  const urgent = top && REASON_PRIORITY[top] === 1;

  return (
    <li className="relative list-none">
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          aria-label={t("inbox.row.select", { name: lead.name ?? "" })}
          className="absolute left-2.5 top-2.5 z-10 h-5 w-5 accent-[#8a6d3b]"
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        data-lead-id={lead.id}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-lg border bg-white text-left transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
          active ? "border-ink/60 ring-1 ring-ink/40" : "border-ink/10 hover:border-gold/50",
          selected && "border-gold/60 bg-gold/[0.04]",
        )}
      >
        {/* Vivienda */}
        <span className="relative block aspect-[16/9] w-full overflow-hidden bg-ink/[0.05]">
          {lead.propertyImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lead.propertyImageUrl}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-ink/35">
              <ImageOff size={18} strokeWidth={1.5} aria-hidden />
              <span className="text-xs">{t("inbox.card.noImage")}</span>
            </span>
          )}
          {top && (
            <span className="absolute right-2 top-2">
              <Pill tone={urgent ? "critical" : "warning"} className="bg-white/95">
                {t(`inbox.reason.${top}`)}
              </Pill>
            </span>
          )}
        </span>

        <span className="flex flex-1 flex-col gap-2 p-3">
          {/* Anuncio */}
          <span className="block">
            <span className="block truncate text-[15px] font-semibold text-ink">
              {lead.propertyTitle ?? t("inbox.card.unknownListing")}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/55">
              {lead.propertyPrice ? (
                <span className="tabular-nums">{lead.propertyPrice}</span>
              ) : (
                <span className="text-ink/40">{t("inbox.card.noPrice")}</span>
              )}
              <span aria-hidden>·</span>
              <span>{t(`inbox.operation.${lead.operation ?? "unknown"}`)}</span>
            </span>
            <span className="mt-1.5 flex flex-wrap gap-1">
              <LinkBadge status={lead.linkStatus} />
            </span>
          </span>

          {/* Persona y mensaje literal */}
          <span className="flex items-start gap-2 border-t border-ink/8 pt-2">
            {lead.avatarUrl ? (
              <LeadAvatar src={lead.avatarUrl} name={lead.name} className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/[0.07] text-[11px] font-semibold text-ink/55">
                {(lead.name?.trim()?.[0] ?? "?").toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <span className="truncate">{lead.name?.trim() || t("inbox.row.noName")}</span>
                {lead.isInternational && <Globe size={12} className="shrink-0 text-ink/35" aria-label={t("inbox.filter.international")} />}
              </span>
              {lead.messageExcerpt && (
                <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink/60">
                  «{lead.messageExcerpt}»
                </span>
              )}
            </span>
          </span>

          {/* Responsable y antigüedad */}
          <span className="mt-auto flex items-center justify-between gap-2 border-t border-ink/8 pt-2">
            <OwnerBadge lead={lead} />
            <span className="shrink-0 text-xs text-ink/40">
              <RelativeTime at={lead.createdAt} locale={locale} />
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
