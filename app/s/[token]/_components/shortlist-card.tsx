"use client";

// ============================================================================
// La residencia dentro del Shortlist.
//
// No es una tarjeta de CRM: es una lámina de catálogo. Manda la FOTOGRAFÍA —a
// ancho completo en el móvil, a media página en escritorio—, después el nombre,
// después el número de prioridad. Sin caja, sin sombras, sin píldoras: el aire
// y una línea de pelo separan una residencia de la siguiente.
//
// Jerarquía, en este orden: fotografía · nombre · ranking · decisión ·
// comentario · acciones secundarias.
//
// Las tres decisiones son botones de verdad (no un deslizamiento), porque
// tienen que funcionar con el pulgar, con teclado y con lector de pantalla. El
// arrastre es un extra encima de las flechas, nunca en su lugar.
// ============================================================================

import type { PublicShortlistProperty } from "@/lib/client-shortlist/public-contract";
import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import type { ShortlistDecision } from "@/lib/client-shortlist/types";
import { cn } from "@/lib/utils";

export function ShortlistCard({
  property,
  t,
  rankLabel,
  canMoveUp,
  canMoveDown,
  onDecide,
  onMove,
  onView,
  onNote,
  busy,
  dragHandleProps,
  isDragging,
  itemRef,
  itemStyle,
}: {
  property: PublicShortlistProperty;
  t: ShortlistDictionary;
  /** "01", "02"… solo en las prioritarias. */
  rankLabel?: string;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDecide: (d: ShortlistDecision) => void;
  onMove?: (dir: -1 | 1) => void;
  onView: () => void;
  onNote: () => void;
  busy?: boolean;
  /** Manejadores de puntero del asa de arrastre (ver useReorderList). */
  dragHandleProps?: React.ComponentProps<"button">;
  isDragging?: boolean;
  itemRef?: (el: HTMLElement | null) => void;
  itemStyle?: React.CSSProperties;
}) {
  const discarded = property.decision === "not_for_me";

  return (
    <article
      ref={itemRef}
      style={itemStyle}
      data-reorder-id={property.itemId}
      className={cn(
        // `vc-plate-in` da la entrada suave cuando la residencia cambia de
        // sección: aparece en su grupo nuevo en vez de saltar.
        "vc-shortlist-item group relative bg-cream-50 py-6 transition-[opacity,transform] duration-500 ease-out first:pt-0",
        discarded && "opacity-55",
        busy && "opacity-75",
        isDragging && "z-10 opacity-95 shadow-[0_18px_40px_-24px_rgba(40,28,10,0.5)]",
      )}
    >
      <div className="sm:flex sm:items-stretch sm:gap-6">
        {/* ── Fotografía ──
            Móvil: a todo el ancho, formato editorial 16:10. Escritorio: media
            columna. Es lo que de verdad ayuda a decidir entre quince casas. */}
        <button
          type="button"
          onClick={onView}
          aria-label={`${t.viewResidence}: ${property.title}`}
          className="vc-focus relative block w-full overflow-hidden bg-ink/5 sm:w-[52%] sm:shrink-0"
        >
          <span className="block aspect-[16/10] w-full sm:aspect-[4/3]">
            {property.coverPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={property.coverPhotoUrl}
                alt={property.title}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.02]"
              />
            ) : (
              // Sin fotografía: marca discreta, no un hueco roto.
              <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-ink/[0.04]">
                <span className="font-display text-[10px] font-medium uppercase vc-tracked text-ink/25">
                  Benjamín Cousiño
                </span>
                <span aria-hidden className="block h-px w-6 bg-ink/15" />
              </span>
            )}
          </span>

          {/* El número de prioridad, sobre la fotografía. Es donde se lee de un
              vistazo cuál va primera. */}
          {rankLabel && (
            <span className="pointer-events-none absolute start-0 top-0 flex h-12 w-12 items-center justify-center bg-cream-50/92 font-serif text-[20px] leading-none vc-nums text-ink sm:h-14 sm:w-14 sm:text-[24px]">
              {rankLabel}
            </span>
          )}

          <span className="pointer-events-none absolute bottom-3 end-3 bg-ink/55 px-3 py-1.5 font-display text-[9px] font-medium uppercase vc-tracked text-cream-50 opacity-0 backdrop-blur-sm transition-opacity duration-500 group-hover:opacity-100">
            {t.viewResidence}
          </span>
        </button>

        {/* ── Texto ── */}
        <div className="flex min-w-0 flex-1 flex-col justify-center py-4 sm:py-6">
          {property.zoneLabel && (
            <p className="font-display text-[10px] font-medium uppercase vc-tracked text-gold-dark">
              {property.zoneLabel}
            </p>
          )}
          <h3 className="mt-1.5 font-serif text-[24px] leading-[1.1] text-ink sm:text-[28px]">
            {property.title}
          </h3>

          <p
            dir="ltr"
            className="mt-2.5 font-serif text-[19px] vc-nums text-ink/85 rtl:text-right sm:text-[21px]"
          >
            {property.priceLabel}
          </p>

          <p className="mt-1.5 font-sans text-[11.5px] text-ink/45">
            {[
              property.bedrooms ? `${property.bedrooms} ${t.bedrooms}` : null,
              property.bathrooms ? `${property.bathrooms} ${t.bathrooms}` : null,
              property.squareMeters ? `${property.squareMeters} m²` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {property.origin === "client_added" && (
            <p className="mt-2 font-display text-[9px] font-medium uppercase vc-tracked-sm text-gold-dark">
              {t.addedByYou}
            </p>
          )}

          {/* ── Decisión ──
              Texto, no píldoras. La elegida se subraya en oro; las otras
              esperan en gris. Área de toque cómoda sin dibujar un botón. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
            {discarded ? (
              <Choice active onClick={() => onDecide("undecided")} disabled={busy}>
                {t.restore}
              </Choice>
            ) : (
              <>
                <Choice
                  active={property.decision === "must_visit"}
                  onClick={() => onDecide("must_visit")}
                  disabled={busy}
                >
                  {t.mustVisit}
                </Choice>
                <Choice
                  active={property.decision === "maybe"}
                  onClick={() => onDecide("maybe")}
                  disabled={busy}
                >
                  {t.maybe}
                </Choice>
                <Choice
                  active={false}
                  muted
                  onClick={() => onDecide("not_for_me")}
                  disabled={busy}
                >
                  {t.notForMe}
                </Choice>
              </>
            )}
          </div>

          {/* ── Acciones secundarias ── */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
            <Secondary onClick={onView}>{t.viewResidence}</Secondary>
            <Secondary onClick={onNote} highlighted={Boolean(property.comment)}>
              {property.comment ? t.editNote : t.addNote}
            </Secondary>

            {/* Reordenar: flechas siempre (teclado y lector de pantalla) y asa
                para arrastrar donde la haya. */}
            {onMove && (
              <span className="ms-auto flex items-center gap-0.5">
                <IconBtn
                  onClick={() => onMove(-1)}
                  disabled={!canMoveUp || busy}
                  label={t.moveUp}
                >
                  &uarr;
                </IconBtn>
                <IconBtn
                  onClick={() => onMove(1)}
                  disabled={!canMoveDown || busy}
                  label={t.moveDown}
                >
                  &darr;
                </IconBtn>
                {dragHandleProps && (
                  <button
                    type="button"
                    {...dragHandleProps}
                    aria-label={t.dragToReorder}
                    title={t.dragToReorder}
                    className="vc-focus flex h-11 w-11 cursor-grab items-center justify-center text-ink/25 transition-colors duration-300 hover:text-ink/60 active:cursor-grabbing"
                  >
                    <span aria-hidden className="text-[15px] leading-none">
                      ⠿
                    </span>
                  </button>
                )}
              </span>
            )}
          </div>

          {property.comment && (
            <p className="mt-3 border-s-2 border-gold/30 ps-3 font-sans text-[12.5px] italic leading-relaxed text-ink/55">
              {property.comment}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/** Decisión: texto con subrayado, no píldora. */
function Choice({
  active,
  muted,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  muted?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "vc-focus relative -mx-1 px-1 py-2.5 font-display text-[10.5px] font-medium uppercase vc-tracked-sm transition-colors duration-300 disabled:opacity-40",
        active ? "text-ink" : muted ? "text-ink/30 hover:text-ink/55" : "text-ink/45 hover:text-ink/75",
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-1 bottom-1.5 h-px origin-left bg-gold transition-transform duration-500 ease-out",
          active ? "scale-x-100" : "scale-x-0",
        )}
      />
    </button>
  );
}

function Secondary({
  onClick,
  highlighted,
  children,
}: {
  onClick: () => void;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "vc-focus vc-underline py-2 font-display text-[9.5px] font-medium uppercase vc-tracked-sm transition-colors duration-300",
        highlighted ? "text-gold-dark" : "text-ink/40 hover:text-ink/70",
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
      className="vc-focus flex h-11 w-11 items-center justify-center text-[13px] text-ink/30 transition-colors duration-300 hover:text-ink/70 disabled:opacity-20"
    >
      {children}
    </button>
  );
}
