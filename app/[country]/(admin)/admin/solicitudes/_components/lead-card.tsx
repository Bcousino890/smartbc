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

import { Globe } from "lucide-react";
import type { LeadListItem } from "@/lib/sales-inbox/types";
import { REASON_PRIORITY } from "@/lib/sales-inbox/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Pill, type Tone } from "@/components/admin/ui/primitives";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";

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

/**
 * Lo que dice la etiqueta de la foto: el motivo más urgente si lo hay; si no,
 * el estado comercial. Mismo criterio que la cola de atención.
 */
export function cardStatus(lead: LeadListItem): { label: string; tone: "plain" | "review" | "error" } | null {
  const top = lead.reasons.slice().sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b])[0];
  if (top) return { label: `inbox.reason.${top}`, tone: REASON_PRIORITY[top] === 1 ? "error" : "review" };
  if (lead.routingStatus === "pending") return { label: "inbox.routing.pending", tone: "review" };
  return { label: `inbox.state.${lead.state}`, tone: "plain" };
}

const STATUS_CLASS = {
  plain: "bg-sol-surface text-sol-action",
  review: "bg-sol-review text-sol-review-ink",
  error: "bg-sol-error-bg text-sol-error",
} as const;

export function StatusTag({ lead, className }: { lead: LeadListItem; className?: string }) {
  const t = useT();
  const s = cardStatus(lead);
  if (!s) return null;
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 sol-meta font-semibold leading-none shadow-sm", STATUS_CLASS[s.tone], className)}>
      {t(s.label)}
    </span>
  );
}

/** «Ref. · Vínculo exacto» en verde, o el aviso de revisión en ámbar. */
export function ListingLine({
  lead,
  className,
}: {
  lead: Pick<LeadListItem, "listingRef" | "linkStatus"> & { listingRetired?: boolean };
  className?: string;
}) {
  const t = useT();
  const exact = lead.linkStatus === "exact";
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs font-medium", exact ? "text-sol-action" : "text-sol-review-ink", className)}>
      <span className="truncate">{lead.listingRef ?? t("inbox.card.noRef")}</span>
      <span aria-hidden>·</span>
      <span>{t(`inbox.link.${lead.linkStatus}`)}</span>
      {/* El anuncio ya no está publicado: se sigue sabiendo cuál era. */}
      {lead.listingRetired && (
        <>
          <span aria-hidden>·</span>
          <span className="text-sol-muted">{t("inbox.listing.retired")}</span>
        </>
      )}
    </span>
  );
}

/**
 * Foto que la persona vio en Idealista (capturada del propio hilo): evidencia
 * de lo que consultó, no una ficha nuestra «parecida». Sin foto se dice si el
 * anuncio está además sin verificar.
 */
export function ListingPhoto({ lead, className, children }: { lead: Pick<LeadListItem, "propertyImageUrl" | "linkStatus">; className?: string; children?: React.ReactNode }) {
  const t = useT();
  const show = !!lead.propertyImageUrl;
  return (
    <span className={cn("relative block w-full overflow-hidden rounded-lg bg-sol-column", className)}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lead.propertyImageUrl!}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-end p-3 sol-ui text-sol-muted sm:items-center sm:p-4">
          {lead.linkStatus === "exact" ? t("inbox.card.noImage") : t("inbox.card.noVerifiedImage")}
        </span>
      )}
      {children}
    </span>
  );
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
  const unassigned = !lead.assignedTo || lead.routingStatus !== "assigned";

  return (
    <li className="relative list-none">
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          aria-label={t("inbox.row.select", { name: lead.name ?? "" })}
          className="absolute right-4 top-4 z-10 h-5 w-5 accent-sol-action"
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        data-lead-id={lead.id}
        className={cn(
          "group flex h-full w-full flex-col rounded-lg border bg-sol-surface p-2 text-left transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-action",
          active ? "border-sol-action ring-1 ring-sol-action" : "border-sol-line hover:border-sol-action/40 hover:shadow-sm",
          selected && "border-sol-action bg-sol-select/40",
        )}
      >
        {/* Vivienda */}
        <ListingPhoto lead={lead} className="aspect-[3/1]">
          <span className="absolute left-3 top-3">
            <StatusTag lead={lead} />
          </span>
        </ListingPhoto>

        <span className="flex w-full min-w-0 flex-1 flex-col px-3 pb-2 pt-3">
          {/* Anuncio */}
          <span className="block truncate text-lg font-semibold leading-snug text-sol-ink">
            {lead.propertyTitle ?? t("inbox.card.unknownListing")}
          </span>
          <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-3">
            {lead.propertyPrice ? (
              <span className="min-w-0 truncate text-[22px] font-bold leading-tight tabular-nums text-sol-ink">{lead.propertyPrice}</span>
            ) : (
              <span className="text-[22px] font-bold leading-tight text-sol-ink">{t("inbox.card.noPrice")}</span>
            )}
            <span className="shrink-0 sol-meta text-sol-muted">{t(`inbox.operation.${lead.operation ?? "unknown"}`)}</span>
          </span>
          <ListingLine lead={lead} className="mt-1.5" />

          {/* Persona y mensaje literal */}
          <span className="mt-3 block border-t border-sol-line pt-3">
            <span className="flex items-center gap-1.5 text-lg font-semibold leading-snug text-sol-ink">
              <span className="truncate">{lead.name?.trim() || t("inbox.row.noName")}</span>
              {lead.isInternational && <Globe size={14} className="shrink-0 text-sol-faint" aria-label={t("inbox.filter.international")} />}
            </span>
            {lead.messageExcerpt && (
              <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-sol-muted">
                {lead.messageExcerpt}
              </span>
            )}
          </span>

          {/* Responsable y antigüedad */}
          <span className="mt-auto flex items-center justify-between gap-2 pt-3 sol-meta">
            <span className={cn("truncate", unassigned ? "font-medium text-sol-review-ink" : "text-sol-ink")}>
              {lead.routingStatus === "conflict"
                ? t("inbox.routing.conflict")
                : unassigned
                  ? t("inbox.routing.pending")
                  : (lead.assignedName ?? t("inbox.row.assigned"))}
            </span>
            <span className="shrink-0 text-sol-muted">
              <RelativeTime at={lead.createdAt} locale={locale} />
            </span>
          </span>
          <span className="mt-2 text-sm font-semibold text-sol-action group-hover:underline">{t("inbox.card.open")}</span>
        </span>
      </button>
    </li>
  );
}
