"use client";

// ============================================================================
// MODO REVISAR · una residencia cada vez.
//
// Diecinueve láminas grandes en columna son una página interminable: el
// cliente se cansa antes de decidir. Aquí solo hay una, ocupando la pantalla,
// y al decidir se pasa sola a la siguiente que quede pendiente.
//
// Decidir y ordenar son tareas distintas y viven en sitios distintos. Esto
// solo decide.
//
// Cambiar de residencia SIN decidir no asigna ningún estado: pasar de largo no
// es una opinión.
// ============================================================================

import { useEffect, useRef } from "react";
import type { PublicShortlistProperty } from "@/lib/client-shortlist/public-contract";
import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import type { ShortlistDecision } from "@/lib/client-shortlist/types";
import { cn } from "@/lib/utils";

export function ReviewStage({
  property,
  index,
  total,
  t,
  rtl,
  busy,
  onDecide,
  onPrev,
  onNext,
  onView,
  onNote,
  hasPrev,
  hasNext,
}: {
  property: PublicShortlistProperty;
  index: number;
  total: number;
  t: ShortlistDictionary;
  rtl: boolean;
  busy?: boolean;
  onDecide: (d: ShortlistDecision) => void;
  onPrev: () => void;
  onNext: () => void;
  onView: () => void;
  onNote: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const hasPhotos = property.photoUrls.length > 0;

  // Teclado en escritorio: flechas para moverse. En RTL van al revés, igual
  // que en el libro.
  const prevRef = useRef(onPrev);
  const nextRef = useRef(onNext);
  prevRef.current = onPrev;
  nextRef.current = onNext;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
      const fwd = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd) nextRef.current();
      else if (e.key === back) prevRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rtl]);

  // Swipe horizontal en táctil. Umbral alto y con desempate contra el gesto
  // vertical: leer la ficha hacia abajo no puede cambiar de residencia.
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <section
      aria-label={property.title}
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        if ((rtl ? dx > 0 : dx < 0) && hasNext) onNext();
        if ((rtl ? dx < 0 : dx > 0) && hasPrev) onPrev();
      }}
      className="mx-auto max-w-5xl px-5 pb-4 pt-6 sm:px-6 sm:pt-8"
    >
      <p className="font-display text-[10px] font-medium uppercase vc-tracked text-ink/35">
        {t.ofTotal(index + 1, total)}
      </p>

      <div className="mt-4 gap-10 md:flex md:items-start">
        {/* ── Fotografía ── */}
        <button
          type="button"
          onClick={hasPhotos ? onView : undefined}
          disabled={!hasPhotos}
          aria-label={hasPhotos ? `${t.viewResidence}: ${property.title}` : property.title}
          className="vc-focus group relative block w-full overflow-hidden bg-ink/5 md:w-[56%] md:shrink-0"
        >
          <span className="block aspect-[4/3] w-full">
            {property.coverPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={property.itemId}
                src={property.coverPhotoUrl}
                alt={property.title}
                decoding="async"
                referrerPolicy="no-referrer"
                className="vc-plate h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-ink/[0.04]">
                <span className="font-display text-[10px] font-medium uppercase vc-tracked text-ink/25">
                  Benjamín Cousiño
                </span>
                <span aria-hidden className="block h-px w-6 bg-ink/15" />
              </span>
            )}
          </span>
          {hasPhotos && (
            <span className="pointer-events-none absolute bottom-3 end-3 bg-ink/55 px-3 py-1.5 font-display text-[9px] font-medium uppercase vc-tracked text-cream-50 opacity-0 backdrop-blur-sm transition-opacity duration-500 group-hover:opacity-100">
              {t.viewResidence}
            </span>
          )}
        </button>

        {/* ── Ficha y decisión ── */}
        <div className="mt-6 min-w-0 flex-1 md:mt-0">
          {property.zoneLabel && (
            <p className="font-display text-[10px] font-medium uppercase vc-tracked text-gold-dark">
              {property.zoneLabel}
            </p>
          )}
          <h2 className="mt-2 font-serif text-[30px] leading-[1.04] text-ink sm:text-[38px]">
            {property.title}
          </h2>

          <p
            dir="ltr"
            className="mt-3.5 font-serif text-[22px] vc-nums text-ink/80 rtl:text-right sm:text-[25px]"
          >
            {property.priceLabel}
          </p>

          <p className="mt-2 font-sans text-[12px] leading-relaxed text-ink/40">
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

          {/* Las tres decisiones, en vertical y con área de toque generosa:
              es la acción principal de esta pantalla. */}
          <div className="mt-7 flex flex-col items-start gap-0.5">
            <Decision
              active={property.decision === "must_visit"}
              onClick={() => onDecide("must_visit")}
              disabled={busy}
            >
              {t.mustVisit}
            </Decision>
            <Decision
              active={property.decision === "maybe"}
              onClick={() => onDecide("maybe")}
              disabled={busy}
            >
              {t.maybe}
            </Decision>
            <Decision
              active={property.decision === "not_for_me"}
              muted
              onClick={() => onDecide("not_for_me")}
              disabled={busy}
            >
              {t.notForMe}
            </Decision>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1">
            {hasPhotos && (
              <Secondary onClick={onView}>{t.viewResidence}</Secondary>
            )}
            <Secondary onClick={onNote} highlighted={Boolean(property.comment)}>
              {property.comment ? t.editNote : t.addNote}
            </Secondary>
          </div>

          {property.comment && (
            <p className="mt-4 border-s-2 border-gold/30 ps-3 font-sans text-[12.5px] italic leading-relaxed text-ink/55">
              {property.comment}
            </p>
          )}
        </div>
      </div>

      {/* ── Recorrido manual ── */}
      <div className="mt-8 flex items-center justify-between border-t border-ink/8 pt-4">
        <NavBtn onClick={onPrev} disabled={!hasPrev} side="prev" rtl={rtl}>
          {t.previousPhoto}
        </NavBtn>
        <NavBtn onClick={onNext} disabled={!hasNext} side="next" rtl={rtl}>
          {t.nextPhoto}
        </NavBtn>
      </div>
    </section>
  );
}

function Decision({
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
        "vc-focus relative -mx-1 px-1 py-3 font-display text-[12px] font-medium uppercase vc-tracked-sm transition-colors duration-300 disabled:opacity-40 sm:text-[13px]",
        active ? "text-ink" : muted ? "text-ink/30 hover:text-ink/60" : "text-ink/45 hover:text-ink/75",
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-1 bottom-2 h-px origin-left bg-gold transition-transform duration-500 ease-out",
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

function NavBtn({
  onClick,
  disabled,
  side,
  rtl,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  side: "prev" | "next";
  rtl: boolean;
  children: React.ReactNode;
}) {
  const arrow = side === "prev" ? (rtl ? "→" : "←") : rtl ? "←" : "→";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="vc-focus flex items-center gap-2.5 px-1 py-3 font-display text-[10px] font-medium uppercase vc-tracked text-ink/45 transition-colors duration-300 hover:text-ink disabled:opacity-20"
    >
      {side === "prev" && <span aria-hidden>{arrow}</span>}
      {children}
      {side === "next" && <span aria-hidden>{arrow}</span>}
    </button>
  );
}
