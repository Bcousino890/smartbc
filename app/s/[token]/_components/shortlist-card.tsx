"use client";

// ============================================================================
// La tarjeta de una residencia dentro del Shortlist.
//
// Manda la fotografía y el nombre; los datos van debajo, en pequeño. No es una
// ficha de portal: es una carta que el cliente mueve de sitio.
//
// Las tres decisiones son botones de verdad (no un deslizamiento), porque
// tienen que funcionar con el pulgar, con teclado y con lector de pantalla.
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
  /** Registro del elemento para medir su altura durante el arrastre. */
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
        "vc-card group relative overflow-hidden rounded-2xl border border-ink/10 bg-white/70 transition-opacity duration-300",
        discarded && "opacity-60",
        busy && "opacity-70",
        // Levantada mientras se arrastra: sin una señal clara, en un móvil no
        // se sabe cuál de las catorce se está moviendo.
        isDragging &&
          "border-gold/60 shadow-[0_12px_28px_-10px_rgba(40,28,10,0.45)] ring-1 ring-gold/40",
      )}
    >
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        {/* Número de prioridad + flechas. Las flechas son la alternativa
            accesible al arrastre, no un extra: en móvil son la vía principal. */}
        {rankLabel && (
          <div className="flex w-7 shrink-0 flex-col items-center gap-1 pt-1 sm:w-8">
            <span className="font-display text-[11px] font-medium vc-nums text-gold-dark">
              {rankLabel}
            </span>
            {onMove && (
              <>
                <button
                  type="button"
                  onClick={() => onMove(-1)}
                  disabled={!canMoveUp || busy}
                  aria-label={t.moveUp}
                  className="vc-focus flex h-7 w-7 items-center justify-center rounded-full text-ink/35 transition hover:bg-ink/5 hover:text-ink disabled:opacity-20"
                >
                  <span aria-hidden>&uarr;</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMove(1)}
                  disabled={!canMoveDown || busy}
                  aria-label={t.moveDown}
                  className="vc-focus flex h-7 w-7 items-center justify-center rounded-full text-ink/35 transition hover:bg-ink/5 hover:text-ink disabled:opacity-20"
                >
                  <span aria-hidden>&darr;</span>
                </button>
              </>
            )}
            {dragHandleProps && (
              <button
                type="button"
                {...dragHandleProps}
                aria-label={t.dragToReorder}
                title={t.dragToReorder}
                className="vc-focus mt-0.5 flex h-7 w-7 touch-none items-center justify-center rounded-full text-ink/25 transition hover:bg-ink/5 hover:text-ink active:cursor-grabbing"
              >
                {/* Seis puntos: el asa de toda la vida, sin importar un icono. */}
                <span aria-hidden className="text-[13px] leading-none tracking-[0.12em]">
                  ⠿
                </span>
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onView}
          aria-label={`${t.viewResidence}: ${property.title}`}
          className="vc-focus relative h-[76px] w-[100px] shrink-0 overflow-hidden rounded-xl bg-ink/5 sm:h-[92px] sm:w-[130px]"
        >
          {property.coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={property.coverPhotoUrl}
              alt={property.title}
              loading="lazy"
              decoding="async"
              // La foto de un anuncio todavía sin ficha vive en el CDN del
              // portal. Sin esto, el navegador del cliente le mandaría a
              // Idealista la URL privada de este shortlist en el Referer.
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-display text-[9px] uppercase vc-tracked text-ink/30">
              BCP
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 font-serif text-[17px] leading-tight text-ink sm:text-[19px]">
              {property.title}
            </h3>
            {property.origin === "client_added" && (
              <span className="shrink-0 rounded-full border border-gold/35 bg-gold/10 px-2 py-0.5 font-display text-[8.5px] font-medium uppercase vc-tracked-sm text-gold-dark">
                {t.addedByYou}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-sans text-[11.5px] text-ink/50">
            {property.zoneLabel}
          </p>
          <p dir="ltr" className="mt-1 font-serif text-[15px] vc-nums text-ink rtl:text-right">
            {property.priceLabel}
          </p>
          {/* Lo que el anuncio no traía se OMITE: un "0 baños" en la tarjeta
              de un cliente se lee como un dato, y es un hueco.
              Y cada cifra lleva SU PALABRA. Antes iban desnudas ("4 · 3 · 250
              m²"), que se entendía porque el m² del final anclaba la lectura;
              en un anuncio sin baños ni superficie quedaba un "4" solo,
              colgando bajo el precio, que no dice absolutamente nada.
              La etiqueta va TAL CUAL viene del diccionario, sin pasarla a
              minúsculas: en alemán los sustantivos se escriben con mayúscula
              y "schlafzimmer" estaría mal escrito. */}
          {(property.bedrooms != null ||
            property.bathrooms != null ||
            property.squareMeters != null) && (
            <p className="mt-0.5 font-sans text-[10.5px] text-ink/45">
              {[
                property.bedrooms != null
                  ? `${property.bedrooms} ${t.bedrooms}`
                  : null,
                property.bathrooms != null
                  ? `${property.bathrooms} ${t.bathrooms}`
                  : null,
                property.squareMeters != null
                  ? `${property.squareMeters} m²`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-ink/8 px-3 py-2.5 sm:px-4">
        {discarded ? (
          <button
            type="button"
            onClick={() => onDecide("undecided")}
            disabled={busy}
            className="vc-focus rounded-full border border-ink/15 bg-white px-3.5 py-2 font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/70 transition hover:border-gold/50 disabled:opacity-50"
          >
            {t.restore}
          </button>
        ) : (
          <>
            <Choice
              active={property.decision === "must_visit"}
              onClick={() => onDecide("must_visit")}
              disabled={busy}
              tone="gold"
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
              onClick={() => onDecide("not_for_me")}
              disabled={busy}
              muted
            >
              {t.notForMe}
            </Choice>
          </>
        )}

        <span className="ms-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onNote}
            className={cn(
              "vc-focus rounded-full px-3 py-2 font-display text-[10px] font-medium uppercase vc-tracked-sm transition",
              property.comment
                ? "text-gold-dark hover:bg-gold/10"
                : "text-ink/45 hover:bg-ink/5 hover:text-ink",
            )}
          >
            {property.comment ? t.editNote : t.addNote}
          </button>
        </span>
      </div>

      {property.comment && (
        <p className="border-t border-ink/8 bg-cream-100/50 px-3 py-2.5 font-sans text-[12px] italic leading-relaxed text-ink/60 sm:px-4">
          “{property.comment}”
        </p>
      )}
    </article>
  );
}

function Choice({
  active,
  muted,
  tone,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  muted?: boolean;
  tone?: "gold";
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
        "vc-focus rounded-full border px-3.5 py-2 font-display text-[10px] font-medium uppercase vc-tracked-sm transition duration-300 disabled:opacity-50",
        active && tone === "gold" && "border-gold/60 bg-gold/15 text-ink",
        active && !tone && "border-ink/35 bg-ink/5 text-ink",
        !active && !muted && "border-ink/12 bg-white text-ink/60 hover:border-ink/25",
        !active && muted && "border-transparent text-ink/35 hover:text-ink/60",
      )}
    >
      {children}
    </button>
  );
}
