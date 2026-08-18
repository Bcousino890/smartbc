"use client";

// ============================================================================
// Capítulo de residencia.
//
// Composición: apertura (número + nombre) → fotografía a sangre → bloque
// editorial asimétrico → acción. En desktop el bloque alterna de lado según
// el capítulo sea par o impar: es lo que da ritmo de revista sin recurrir a
// plantillas distintas.
//
// La ficha técnica se compone con DataPoint (etiqueta + cifra en serif), no
// con chips de icono. La galería completa solo se carga bajo interacción.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type {
  PublicAvailability,
  PublicViewingStop,
} from "@/lib/viewing-collections/public-contract";
import { cn } from "@/lib/utils";
import { ResidenceRating } from "./residence-rating";
import type { CollectionDictionary } from "@/lib/viewing-collections/i18n";
import { PrivateGallery } from "./private-gallery";
import {
  ChapterMark,
  DataPoint,
  EditorialAction,
  Label,
  Reveal,
  Rule,
  StatusLine,
} from "./editorial";

function availabilityWord(
  t: CollectionDictionary,
): Partial<Record<PublicAvailability, string>> {
  return {
    reserved: `${t.residence} · ${t.reserved}`,
    sold: `${t.residence} · ${t.sold}`,
  };
}

function viewingLine(
  stop: PublicViewingStop,
  t: CollectionDictionary,
): { text: string; tone: "confirmed" | "pending" | "muted" } {
  if (stop.status === "cancelled") {
    return { text: `${t.privateViewing} · ${t.statusCancelled}`, tone: "muted" };
  }
  if (stop.status === "confirmed") {
    return {
      text: `${t.privateViewing} · ${t.statusConfirmed}`,
      tone: "confirmed",
    };
  }
  return { text: `${t.privateViewing} · ${t.statusPending}`, tone: "pending" };
}

export function ResidenceChapter({
  stop,
  total,
  onView,
  onExpand,
  onSmartLinkClick,
  registerRef,
  dict,
  rtl = false,
  collectionToken = "",
}: {
  stop: PublicViewingStop;
  total: number;
  onView: () => void;
  onExpand: () => void;
  onSmartLinkClick: () => void;
  registerRef: (order: number, el: HTMLElement | null) => void;
  dict: CollectionDictionary;
  rtl?: boolean;
  /** Vacío en la previsualización del agente: entonces no se guarda nada. */
  collectionToken?: string;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const viewed = useRef(false);
  /** Índice de la lámina abierta a pantalla completa; null = ninguna. */
  const [plate, setPlate] = useState<number | null>(null);

  // `onView` cambia de identidad en cada render del padre, y el padre
  // re-renderiza en cada frame de scroll. Si el efecto dependiera de él,
  // recrearía el observador constantemente y cancelaría notificaciones aún no
  // entregadas: en un scroll rápido el stop_view se perdía. Se guarda en un ref
  // y el efecto se monta UNA vez.
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  useEffect(() => {
    const el = sectionRef.current;
    registerRef(stop.order, el);
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Banda central del viewport en vez de `threshold: 0.35`. Un capítulo más
    // alto que ~2.9 pantallas NUNCA podía alcanzar ese ratio (el máximo posible
    // es 1/altura-en-pantallas), así que su stop_view no se emitía jamás. Con
    // rootMargin negativo el criterio es "el capítulo ocupa el centro de la
    // pantalla", que es lo que de verdad significa estar leyéndolo.
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !viewed.current) {
            viewed.current = true;
            onViewRef.current();
            obs.disconnect();
          }
        }
      },
      { threshold: 0, rootMargin: "-35% 0px -35% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [stop.order, registerRef]);

  const unavailable = stop.availability === "unavailable";
  const cancelled = stop.status === "cancelled";
  const flipped = stop.order % 2 === 0;
  const extraPhotos = stop.photoUrls.slice(1, 13);
  /** Portada + extras: el orden que ve el cliente en la lámina y el contador. */
  const allPhotos = stop.photoUrls.slice(0, 13);
  const viewing = viewingLine(stop, dict);
  const AVAILABILITY_WORD = availabilityWord(dict);

  return (
    <section
      ref={sectionRef}
      id={`residence-${stop.order}`}
      aria-labelledby={`residence-${stop.order}-title`}
      className={cn(
        // El aire entre capítulos se redujo un punto: tras el CTA quedaba un
        // hueco que empezaba a leer como accidental, sobre todo en móvil.
        "scroll-mt-16 py-12 md:py-20 lg:py-24",
        (unavailable || cancelled) && "opacity-60",
      )}
    >
      {/* ── Apertura ───────────────────────────────────────────────────── */}
      <Reveal className="mx-auto max-w-5xl px-6 md:px-10">
        <div className="flex items-center gap-5">
          <ChapterMark index={stop.order} total={total} />
          <span aria-hidden className="h-px flex-1 bg-ink/12" />
        </div>

        <div className="mt-7 md:mt-9">
          <Label tone="gold">{stop.zoneLabel}</Label>
          <h2
            id={`residence-${stop.order}-title`}
            className="mt-3 max-w-[20ch] font-serif text-[30px] font-normal vc-tight text-ink sm:text-[38px] md:text-[48px] lg:text-[54px]"
          >
            {stop.title}
          </h2>
        </div>
      </Reveal>

      {unavailable ? (
        <Reveal delay={1} className="mx-auto mt-10 max-w-5xl px-6 md:px-10">
          <Rule />
          <p className="py-12 text-center font-sans text-[13px] text-ink/50 md:py-16 md:text-sm">
            {dict.noLongerAvailable}
          </p>
          <Rule />
        </Reveal>
      ) : (
        <>
          {/* ── Fotografía a sangre ──────────────────────────────────────── */}
          {stop.coverPhotoUrl && (
            <Reveal delay={1} as="figure" className="mt-9 md:mt-12">
              <button
                type="button"
                onClick={() => {
                  onExpand();
                  setPlate(0);
                }}
                aria-haspopup="dialog"
                className="vc-focus group relative block w-full overflow-hidden"
              >
                <div className="aspect-[4/5] w-full sm:aspect-[3/2] lg:aspect-[16/8]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={stop.coverPhotoUrl}
                    alt={stop.title}
                    loading={stop.order === 1 ? "eager" : "lazy"}
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
                  />
                </div>

                {extraPhotos.length > 0 && (
                  <span className="pointer-events-none absolute bottom-5 right-5 border border-cream-50/45 bg-ink/55 px-4 py-2.5 font-display text-[9.5px] font-medium uppercase vc-tracked text-cream-50 backdrop-blur-sm md:bottom-8 md:right-8 md:text-[10px]">
                    {dict.viewPhotos(extraPhotos.length)}
                  </span>
                )}
              </button>
            </Reveal>
          )}

          {/* La lámina: la fotografía entera sobre tinta, sin recorte ni
              ampliación. Misma pieza que en el libro. */}
          {plate !== null && (
            <PrivateGallery
              title={stop.title}
              photos={allPhotos}
              dict={dict}
              rtl={rtl}
              startIndex={plate}
              onClose={() => setPlate(null)}
            />
          )}

          {/* ── Bloque editorial ─────────────────────────────────────────── */}
          <Reveal
            delay={1}
            className="mx-auto mt-10 max-w-5xl px-6 md:mt-14 md:px-10"
          >
            {/* El ritmo de revista sale de alternar el lado del bloque según
                el capítulo sea par o impar. Se hace con colocación explícita
                en la rejilla: probar con `direction: rtl` no funcionaba porque
                entra en conflicto con los col-start. */}
            <div className="grid gap-x-12 gap-y-9 lg:grid-cols-12">
              {/* Precio + ficha técnica */}
              <div
                className={cn(
                  "lg:col-span-7",
                  flipped ? "lg:col-start-6" : "lg:col-start-1",
                )}
              >
                <p dir="ltr" className="font-serif text-[27px] leading-none text-ink vc-nums md:text-[34px] rtl:text-right">
                  {stop.priceLabel}
                </p>

                <Rule className="my-7 md:my-8" />

                <div className="flex flex-wrap gap-x-12 gap-y-6 sm:gap-x-16">
                  <DataPoint label={dict.bedrooms} value={stop.bedrooms} />
                  <DataPoint label={dict.bathrooms} value={stop.bathrooms} />
                  {stop.squareMeters ? (
                    <DataPoint
                      label={dict.surface}
                      value={
                        <>
                          {stop.squareMeters}
                          <span className="ml-1 text-[13px] text-ink/45 md:text-[15px]">
                            m²
                          </span>
                        </>
                      }
                    />
                  ) : null}
                  {stop.propertyTypeLabel && (
                    <DataPoint
                      label={dict.typology}
                      value={
                        <span className="text-[17px] md:text-[19px]">
                          {stop.propertyTypeLabel}
                        </span>
                      }
                    />
                  )}
                </div>

                {AVAILABILITY_WORD[stop.availability] && (
                  <StatusLine tone="alert" className="mt-7">
                    {AVAILABILITY_WORD[stop.availability]}
                  </StatusLine>
                )}
              </div>

              {/* Visita + ubicación */}
              <div
                className={cn(
                  "lg:col-span-5 lg:row-start-1",
                  flipped ? "lg:col-start-1" : "lg:col-start-8",
                )}
              >
                {/* El filete separador va del lado que mira al bloque de
                    precio, así que cambia de mano con el volteo. */}
                <div
                  className={cn(
                    "border-t border-ink/12 pt-7 lg:border-t-0 lg:pt-0",
                    flipped
                      ? "lg:border-r lg:pr-10 lg:text-right"
                      : "lg:border-l lg:pl-10",
                  )}
                >
                  {!stop.timeLabel && stop.timePending && !cancelled && (
                    <span className="font-display text-[10px] font-medium uppercase vc-tracked text-gold-dark">
                      {dict.timeToBeConfirmed}
                    </span>
                  )}
                  {stop.timeLabel && !cancelled && (
                    <p dir="ltr" className="font-serif text-[27px] leading-none text-ink vc-nums md:text-[32px] rtl:text-right">
                      {stop.timeLabel}
                      {stop.durationLabel && (
                        <span className="ml-2.5 font-sans text-[12px] font-normal text-ink/40 md:text-[13px]">
                          {stop.durationLabel}
                        </span>
                      )}
                    </p>
                  )}

                  <StatusLine tone={viewing.tone} className="mt-3">
                    {viewing.text}
                  </StatusLine>

                  <div className="mt-7">
                    <Label>{dict.location}</Label>
                    {stop.exactAddress ? (
                      <p className="mt-2 font-sans text-[13.5px] leading-relaxed text-ink/80 md:text-[14.5px]">
                        {stop.exactAddress}
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 font-sans text-[13.5px] leading-relaxed text-ink/80 md:text-[14.5px]">
                          {stop.zoneLabel}
                        </p>
                        <p className="mt-2 font-sans text-[11.5px] leading-relaxed text-ink/40">
                          {dict.addressOnConfirm}
                        </p>
                      </>
                    )}
                  </div>

                  {stop.bcReference && (
                    <p className="mt-7 font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/30">
                      Ref. {stop.bcReference}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Acción ─────────────────────────────────────────────────── */}
            {stop.smartLinkUrl && !cancelled && (
              <div className="mt-8 md:mt-10">
                <EditorialAction
                  href={stop.smartLinkUrl}
                  onClick={onSmartLinkClick}
                  className="w-full sm:w-auto"
                  sameOrigin
                >
                  {dict.explore}
                </EditorialAction>
                <p className="mt-4 font-sans text-[11.5px] text-ink/40">
                  {dict.exploreHint}
                </p>
              </div>
            )}

            {/* Lo único que el cliente escribe. No aparece en una residencia
                que se ha caído: preguntar por algo cancelado es ruido. */}
            {!cancelled && (
              <ResidenceRating
                order={stop.order}
                initialRating={stop.clientRating}
                collectionToken={collectionToken}
                dict={dict}
              />
            )}
          </Reveal>
        </>
      )}
    </section>
  );
}
