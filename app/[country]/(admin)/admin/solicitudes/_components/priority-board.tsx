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
import { formatDateTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/format";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { ListingPhoto } from "./lead-card";

const COLUMNS: PriorityColumn[] = ["today", "awaiting", "scheduled"];

export function PriorityBoardView({
  board,
  activeLeadId,
  locale,
  onOpen,
  onShowCards,
}: {
  board: PriorityBoard & { unplanned: number };
  activeLeadId: string | null;
  locale: string;
  onOpen: (id: string) => void;
  onShowCards: () => void;
}) {
  const t = useT();
  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <section key={col} aria-labelledby={`col-${col}`} className="flex min-w-0 flex-col rounded-2xl bg-sol-column p-2.5">
            <header className="flex items-center justify-between gap-2 px-1.5 pb-3 pt-2">
              <h2 id={`col-${col}`} className="text-xl font-semibold text-sol-ink">{t(`inbox.board.${col}`)}</h2>
              <span className="min-w-[32px] rounded-lg bg-sol-surface px-2 py-0.5 text-center sol-meta font-semibold tabular-nums text-sol-ink">
                {board[col].total}
              </span>
            </header>
            {board[col].items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-sol-line bg-sol-surface/60 px-4 py-6 text-center text-sm text-sol-muted">
                {t(`inbox.board.empty.${col}`)}
              </p>
            ) : (
              <ul className="space-y-4">
                {board[col].items.map((lead) => (
                  <BoardCard key={lead.id} lead={lead} column={col} locale={locale} active={lead.id === activeLeadId} onOpen={() => onOpen(lead.id)} />
                ))}
              </ul>
            )}
            {board[col].total > board[col].items.length && (
              <p className="px-1.5 pt-3 sol-meta text-sol-muted">
                {t("inbox.board.more", { count: board[col].total - board[col].items.length })}
              </p>
            )}
          </section>
        ))}
      </div>
      <p className="mt-4 text-sm text-sol-muted">{t("inbox.board.noDrag")}</p>
      {board.unplanned > 0 && (
        <p className="mt-1 text-sm text-sol-muted">
          {t("inbox.board.unplanned", { count: board.unplanned })}{" "}
          <button type="button" onClick={onShowCards} className="font-semibold text-sol-action underline-offset-2 hover:underline">
            {t("inbox.board.seeCards")}
          </button>
        </p>
      )}
    </div>
  );
}

const TAG = "inline-flex items-center rounded-lg px-2.5 py-1 sol-meta font-semibold";

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
  const unassigned = !lead.assignedTo || lead.routingStatus !== "assigned";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        data-lead-id={lead.id}
        className={cn(
          "group flex w-full flex-col rounded-xl border bg-sol-surface p-2.5 text-left transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-action",
          active ? "border-sol-action" : "border-sol-line hover:border-sol-action/40 hover:shadow-sm",
        )}
      >
        <ListingPhoto lead={lead} className="aspect-[4/1]" />
        <span className="flex w-full min-w-0 flex-col px-1.5 pb-1 pt-3">
          <span className="block truncate text-lg font-semibold text-sol-ink">{lead.name?.trim() || t("inbox.row.noName")}</span>
          <span className="mt-1 block truncate sol-ui text-sol-ink">{lead.propertyTitle ?? t("inbox.card.unknownListing")}</span>
          <span className="mt-1 block truncate sol-price-sm font-semibold tabular-nums text-sol-ink">
            {lead.propertyPrice ?? t("inbox.card.noPrice")}
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {column === "today" && top && (
              <span className={cn(TAG, REASON_PRIORITY[top] === 1 ? "bg-sol-error-bg text-sol-error" : "bg-sol-review text-sol-review-ink")}>
                {t(`inbox.reason.${top}`)}
              </span>
            )}
            {column === "scheduled" && lead.nextActionAt && (
              <span className={cn(TAG, "bg-sol-info text-sol-info-ink")}>{formatDateTime(lead.nextActionAt, locale)}</span>
            )}
            {column === "awaiting" && (
              <span className={cn(TAG, "bg-sol-select text-sol-action")}>
                {t("inbox.board.lastTouch")}&nbsp;<RelativeTime at={lead.lastActivityAt ?? lead.createdAt} locale={locale} />
              </span>
            )}
            {lead.linkStatus !== "exact" && (
              <span className={cn(TAG, lead.linkStatus === "conflict" ? "bg-sol-error-bg text-sol-error" : "bg-sol-review text-sol-review-ink")}>
                {t(`inbox.link.${lead.linkStatus}`)}
              </span>
            )}
          </span>
          <span className="mt-3 flex items-center justify-between gap-2 sol-meta">
            <span className={cn("truncate", unassigned ? "font-medium text-sol-review-ink" : "text-sol-muted")}>
              {lead.routingStatus === "conflict"
                ? t("inbox.routing.conflict")
                : unassigned
                  ? t("inbox.routing.pending")
                  : (lead.assignedName ?? t("inbox.row.assigned"))}
            </span>
            <span className="shrink-0 font-semibold text-sol-action group-hover:underline">{t("inbox.board.nextStep")}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
