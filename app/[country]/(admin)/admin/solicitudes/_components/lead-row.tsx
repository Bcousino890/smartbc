"use client";

// ============================================================================
// Una fila de la bandeja.
//
// Tiene que leerse en dos segundos, así que lleva CUATRO líneas y ni una más:
//
//   Nombre                                              hace 14 min
//   Idealista · Serrano 12
//   WhatsApp enviado · Asignado a Fabricio
//   [motivo de atención, solo si lo hay]
//
// Antes esto era una tarjeta con foto, mensaje, perfil y ocho botones, y 322
// de ellas en una rejilla. Ver diez leads exigía hacer scroll medio minuto.
// ============================================================================

import { Globe, MessageCircle, Phone, User } from "lucide-react";
import type { LeadListItem } from "@/lib/sales-inbox/types";
import { REASON_PRIORITY } from "@/lib/sales-inbox/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { Pill, type Tone } from "@/components/admin/ui/primitives";

const STATE_TONE: Record<string, Tone> = {
  new: "neutral",
  contacted: "info",
  engaged: "positive",
  converted: "gold",
  discarded: "neutral",
};

export function LeadRow({
  lead,
  active,
  selected,
  selectable,
  locale,
  grouped,
  onOpen,
  onToggleSelect,
}: {
  lead: LeadListItem;
  active: boolean;
  selected: boolean;
  selectable: boolean;
  locale: string;
  /** Dentro de un piso: la propiedad ya la dice la cabecera, no se repite. */
  grouped?: boolean;
  onOpen: () => void;
  onToggleSelect: (checked: boolean) => void;
}) {
  const t = useT();

  // Solo se enseña el motivo MÁS urgente. Cuatro insignias en una fila de
  // lista no informan: decoran.
  const top = lead.reasons
    .slice()
    .sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b])[0];
  const topPriority = top ? REASON_PRIORITY[top] : null;

  return (
    <li className="relative">
      <div
        className={cn(
          "group flex gap-2 border-b border-ink/6 py-2 transition-colors",
          grouped ? "ps-9 pe-3" : "px-3",
          active ? "bg-gold/[0.07]" : "hover:bg-ink/[0.025]",
        )}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelect(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label={t("inbox.row.select", { name: lead.name ?? "" })}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#8a6d3b]"
          />
        )}

        <button
          type="button"
          onClick={onOpen}
          aria-current={active ? "true" : undefined}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          {/* Línea 1 — quién y cuándo */}
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-[13px]",
                active ? "font-semibold text-ink" : "font-medium text-ink/90",
              )}
            >
              {lead.name?.trim() || t("inbox.row.noName")}
            </span>
            {lead.isInternational && (
              <Globe
                size={11}
                strokeWidth={1.9}
                className="shrink-0 text-ink/30"
                aria-label={t("inbox.filter.international")}
              />
            )}
            <span className="ms-auto shrink-0 text-[10.5px] text-ink/35">
              <RelativeTime at={lead.createdAt} locale={locale} />
            </span>
          </div>

          {/* Línea 2 — por qué escribió (redundante dentro de un piso) */}
          {!grouped && (
            <p className="truncate text-[11.5px] leading-[1.35] text-ink/50">
              {lead.propertyTitle ?? t("inbox.row.noProperty")}
            </p>
          )}

          {/* Línea 3 — por dónde va y qué reclama */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink/45">
            <Pill tone={STATE_TONE[lead.state] ?? "neutral"}>
              {t(`inbox.state.${lead.state}`)}
            </Pill>
            {lead.whatsapp.conversationId && (
              <span className="inline-flex items-center gap-1 text-[#128C7E]">
                <MessageCircle size={10} strokeWidth={2} />
                {lead.whatsapp.outbound > 0
                  ? t("inbox.row.waSent", { count: lead.whatsapp.outbound })
                  : t("inbox.row.waOpened")}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {lead.assignedName ? (
                <>
                  <User size={10} strokeWidth={2} className="text-ink/30" />
                  {lead.assignedName}
                </>
              ) : (
                <span className="text-amber-700">{t("inbox.row.unassigned")}</span>
              )}
            </span>
            {lead.nextActionAt && (
              <span className="inline-flex items-center gap-1 text-ink/45">
                <Phone size={10} strokeWidth={2} className="text-ink/30" />
                <RelativeTime at={lead.nextActionAt} locale={locale} />
              </span>
            )}

            {/* Qué reclama, en la MISMA línea: una cuarta línea por fila son
                veinte píxeles que se pagan en cada uno de los cientos de
                leads, y esta cola se lee de arriba abajo. */}
            {top && topPriority !== null && topPriority <= 2 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 font-medium",
                  topPriority === 1 ? "text-rose-700" : "text-amber-700",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    topPriority === 1 ? "bg-rose-500" : "bg-amber-500",
                  )}
                />
                {t(`inbox.reason.${top}`)}
              </span>
            )}
          </div>
        </button>
      </div>
    </li>
  );
}
