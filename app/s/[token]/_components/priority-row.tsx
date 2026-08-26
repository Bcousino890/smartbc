"use client";

// ============================================================================
// MODO PRIORIDADES · fila compacta.
//
// Aquí ya no hacen falta láminas grandes: la decisión está tomada y lo que
// toca es COLOCAR. Diez residencias tienen que caber a la vista para poder
// moverlas rápido, así que miniatura, número, nombre y precio.
//
// El número manda, porque es lo que el cliente está construyendo.
// ============================================================================

import type { PublicShortlistProperty } from "@/lib/client-shortlist/public-contract";
import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import type { ShortlistDecision } from "@/lib/client-shortlist/types";
import { cn } from "@/lib/utils";

export function PriorityRow({
  property,
  t,
  rankLabel,
  canMoveUp,
  canMoveDown,
  onMove,
  onView,
  onNote,
  onDecide,
  busy,
  dragHandleProps,
  isDragging,
  itemRef,
  itemStyle,
  compact,
}: {
  property: PublicShortlistProperty;
  t: ShortlistDictionary;
  rankLabel?: string;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (dir: -1 | 1) => void;
  onView: () => void;
  onNote: () => void;
  onDecide: (d: ShortlistDecision) => void;
  busy?: boolean;
  dragHandleProps?: React.ComponentProps<"button">;
  isDragging?: boolean;
  itemRef?: (el: HTMLElement | null) => void;
  itemStyle?: React.CSSProperties;
  /** Sin número ni arrastre: alternativas y descartadas. */
  compact?: boolean;
}) {
  const hasPhotos = property.photoUrls.length > 0;

  return (
    <article
      ref={itemRef}
      style={itemStyle}
      data-reorder-id={property.itemId}
      className={cn(
        "vc-shortlist-item flex items-center gap-3 bg-cream-50 py-3.5 sm:gap-4",
        busy && "opacity-70",
        isDragging && "z-10 shadow-[0_14px_32px_-20px_rgba(40,28,10,0.5)]",
      )}
    >
      {rankLabel && (
        <span className="w-8 shrink-0 text-center font-serif text-[22px] leading-none vc-nums text-ink sm:w-10 sm:text-[26px]">
          {rankLabel}
        </span>
      )}

      <button
        type="button"
        onClick={hasPhotos ? onView : undefined}
        disabled={!hasPhotos}
        aria-label={`${t.viewResidence}: ${property.title}`}
        className="vc-focus h-16 w-[86px] shrink-0 overflow-hidden bg-ink/5 sm:h-[72px] sm:w-[104px]"
      >
        {property.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.coverPhotoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-[8px] uppercase vc-tracked text-ink/25">
            BCP
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-serif text-[18px] leading-tight text-ink sm:text-[20px]">
          {property.title}
        </h3>
        <p className="truncate font-sans text-[11px] text-ink/45">
          {property.zoneLabel}
        </p>
        <p dir="ltr" className="mt-0.5 font-serif text-[14px] vc-nums text-ink/70 rtl:text-right">
          {property.priceLabel}
        </p>
        {compact && (
          <div className="mt-1 flex flex-wrap items-center gap-x-4">
            <Mini onClick={() => onDecide("must_visit")}>{t.mustVisit}</Mini>
            {property.decision !== "maybe" && (
              <Mini onClick={() => onDecide("maybe")}>{t.maybe}</Mini>
            )}
            {property.decision === "not_for_me" ? (
              <Mini onClick={() => onDecide("undecided")}>{t.restore}</Mini>
            ) : (
              <Mini onClick={() => onDecide("not_for_me")} muted>
                {t.notForMe}
              </Mini>
            )}
            <Mini onClick={onNote} highlighted={Boolean(property.comment)}>
              {property.comment ? t.editNote : t.addNote}
            </Mini>
          </div>
        )}
        {property.comment && (
          <p className="mt-1.5 truncate font-sans text-[11.5px] italic text-ink/45">
            {property.comment}
          </p>
        )}
      </div>

      {!compact && (
        <span className="flex shrink-0 items-center">
          <Mini onClick={onNote} highlighted={Boolean(property.comment)}>
            {property.comment ? t.editNote : t.addNote}
          </Mini>
          <IconBtn onClick={() => onMove?.(-1)} disabled={!canMoveUp || busy} label={t.moveUp}>
            &uarr;
          </IconBtn>
          <IconBtn onClick={() => onMove?.(1)} disabled={!canMoveDown || busy} label={t.moveDown}>
            &darr;
          </IconBtn>
          {dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps}
              aria-label={t.dragToReorder}
              title={t.dragToReorder}
              className="vc-focus flex h-11 w-9 cursor-grab items-center justify-center text-ink/25 transition-colors duration-300 hover:text-ink/60 active:cursor-grabbing"
            >
              <span aria-hidden className="text-[15px] leading-none">⠿</span>
            </button>
          )}
        </span>
      )}
    </article>
  );
}

function Mini({
  onClick,
  muted,
  highlighted,
  children,
}: {
  onClick: () => void;
  muted?: boolean;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "vc-focus vc-underline py-1.5 font-display text-[9px] font-medium uppercase vc-tracked-sm transition-colors duration-300",
        highlighted ? "text-gold-dark" : muted ? "text-ink/25 hover:text-ink/50" : "text-ink/40 hover:text-ink/70",
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="vc-focus flex h-11 w-9 items-center justify-center text-[13px] text-ink/30 transition-colors duration-300 hover:text-ink/70 disabled:opacity-20"
    >
      {children}
    </button>
  );
}
