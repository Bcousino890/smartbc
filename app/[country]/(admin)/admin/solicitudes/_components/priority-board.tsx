"use client";

// ============================================================================
// C · PRIORIDADES
//
// La misma bandeja (mismos filtros y alcance) repartida por PRÓXIMO PASO:
// atender hoy · esperando respuesta · programadas. Cada solicitud está en una
// sola columna (lib/sales-inbox/views.ts). Arrastrar no cambia nada: el estado
// cambia con acciones reales (registrar contacto, programar), nunca moviendo
// una tarjeta.
// ============================================================================

import type { LeadListItem, PriorityBoard, PriorityColumn } from "@/lib/sales-inbox/types";
import { REASON_PRIORITY } from "@/lib/sales-inbox/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Empty, Pill } from "@/components/admin/ui/primitives";
import { formatDateTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/format";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { LinkBadge, OwnerBadge } from "./lead-card";

const COLUMNS: PriorityColumn[] = ["today", "awaiting", "scheduled"];

export function PriorityBoardView({
  board,
  activeLeadId,
  locale,
  compact,
  onOpen,
  onShowCards,
}: {
  board: PriorityBoard & { unplanned: number };
  activeLeadId: string | null;
  locale: string;
  /** Con una ficha abierta al lado, las columnas se apilan. */
  compact: boolean;
  onOpen: (id: string) => void;
  onShowCards: () => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <p className="px-3 pt-3 text-xs text-ink/50">{t("inbox.board.noDrag")}</p>
      <div className={cn("grid gap-3 p-3", compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3")}>
        {COLUMNS.map((col) => (
          <section key={col} aria-labelledby={`col-${col}`} className="flex min-w-0 flex-col rounded-lg border border-ink/10 bg-cream-50/40">
            <header className="flex items-center justify-between gap-2 border-b border-ink/8 px-3 py-2">
              <h2 id={`col-${col}`} className="crm-label-sm text-ink/70">{t(`inbox.board.${col}`)}</h2>
              <span className="crm-number rounded bg-ink/[0.06] px-1.5 text-xs text-ink/55">{board[col].total}</span>
            </header>
            {board[col].items.length === 0 ? (
              <div className="p-3"><Empty>{t(`inbox.board.empty.${col}`)}</Empty></div>
            ) : (
              <ul className="space-y-2 p-2">
                {board[col].items.map((lead) => (
                  <BoardCard key={lead.id} lead={lead} column={col} locale={locale} active={lead.id === activeLeadId} onOpen={() => onOpen(lead.id)} />
                ))}
              </ul>
            )}
            {board[col].total > board[col].items.length && (
              <p className="px-3 pb-2 text-xs text-ink/45">
                {t("inbox.board.more", { count: board[col].total - board[col].items.length })}
              </p>
            )}
          </section>
        ))}
      </div>
      {board.unplanned > 0 && (
        <p className="px-3 pb-4 text-xs text-ink/50">
          {t("inbox.board.unplanned", { count: board.unplanned })}{" "}
          <button type="button" onClick={onShowCards} className="font-medium text-gold-dark underline-offset-2 hover:underline">
            {t("inbox.board.seeCards")}
          </button>
        </p>
      )}
    </div>
  );
}

function BoardCard({
  lead,
  column,
  locale,
  active,
  onOpen,
}: {
  lead: LeadListItem;
  column: PriorityColumn;
  locale: string;
  active: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const top = lead.reasons.slice().sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b])[0];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        data-lead-id={lead.id}
        className={cn(
          "flex w-full gap-2.5 rounded-md border bg-white p-2.5 text-left transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
          active ? "border-ink/60" : "border-ink/10 hover:border-gold/50",
        )}
      >
        <span className="h-12 w-16 shrink-0 overflow-hidden rounded bg-ink/[0.05]">
          {lead.propertyImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lead.propertyImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{lead.name?.trim() || t("inbox.row.noName")}</span>
          <span className="block truncate text-xs text-ink/55">{lead.propertyTitle ?? t("inbox.card.unknownListing")}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {column === "today" && top && <Pill tone={REASON_PRIORITY[top] === 1 ? "critical" : "warning"}>{t(`inbox.reason.${top}`)}</Pill>}
            {column === "scheduled" && lead.nextActionAt && <Pill tone="info">{formatDateTime(lead.nextActionAt, locale)}</Pill>}
            {column === "awaiting" && (
              <Pill tone="neutral">
                {t("inbox.board.lastTouch")} <RelativeTime at={lead.lastActivityAt ?? lead.createdAt} locale={locale} />
              </Pill>
            )}
            {lead.linkStatus !== "exact" && <LinkBadge status={lead.linkStatus} />}
          </span>
          <span className="mt-1 block"><OwnerBadge lead={lead} /></span>
        </span>
      </button>
    </li>
  );
}
