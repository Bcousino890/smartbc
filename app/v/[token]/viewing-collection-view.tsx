"use client";

// ============================================================================
// Colección privada · superficie de cliente.
//
// Consume EXCLUSIVAMENTE PublicViewingCollection. No accede a base de datos ni
// carga el cliente de Supabase: todo lo que se ve aquí ya pasó por la
// proyección del servidor.
//
// UI funcional mobile-first. La capa editorial luxury se aplicará después
// sobre estos mismos bloques, sin tocar la lógica.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Bath,
  BedDouble,
  Clock,
  Mail,
  MapPin,
  Phone,
  Ruler,
} from "lucide-react";
import type {
  PublicAgentContact,
  PublicStopStatus,
  PublicViewingCollection,
  PublicViewingStop,
} from "@/lib/viewing-collections/public-contract";
import { useAnalytics } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<PublicStopStatus, string> = {
  confirmed: "Visita confirmada",
  pending: "Pendiente de confirmar",
  cancelled: "Visita cancelada",
};

const STATUS_STYLE: Record<PublicStopStatus, string> = {
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-ink/15 bg-ink/5 text-ink/55",
};

const AVAILABILITY_LABEL: Record<string, string> = {
  reserved: "Reservada",
  sold: "Vendida",
  unavailable: "Ya no disponible",
};

export function ViewingCollectionView({
  collection,
  shareId,
}: {
  collection: PublicViewingCollection;
  shareId: string;
}) {
  const trackerRef = useAnalytics({
    pageType: "viewing_collection",
    collectionShareId: shareId,
  });

  useEffect(() => {
    trackerRef.current?.trackEvent?.("collection_open", {
      stops: collection.stopCount,
    });
  }, [trackerRef, collection.stopCount]);

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="sticky top-0 z-20 border-b border-gold/15 bg-cream-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3.5 md:px-8">
          <Image
            src="/logo.png"
            alt="Benjamín Cousiño Propiedades"
            width={130}
            height={Math.round(130 * (519 / 3282))}
            priority
            className="h-auto w-[118px] select-none md:w-[130px]"
          />
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-gold-dark sm:inline">
            Colección privada
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-20 md:px-8">
        <CollectionCover collection={collection} />

        {collection.stops.length > 0 && (
          <DayOverview stops={collection.stops} />
        )}

        <div className="mt-10 space-y-10 md:space-y-14">
          {collection.stops.map((stop) => (
            <ResidencePreview
              key={stop.order}
              stop={stop}
              onView={() =>
                trackerRef.current?.trackEvent?.("stop_view", {
                  order: stop.order,
                })
              }
              onExpand={() =>
                trackerRef.current?.trackEvent?.("stop_expand", {
                  order: stop.order,
                })
              }
              onSmartLinkClick={() =>
                trackerRef.current?.trackEvent?.("share_click", {
                  order: stop.order,
                })
              }
            />
          ))}
        </div>

        <AgentContactBlock agent={collection.agent} />
      </main>

      <footer className="border-t border-gold/15 px-5 py-8 text-center md:px-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">
          Benjamín Cousiño Propiedades
        </p>
        <p className="mt-2 text-[11px] text-ink/40">
          Colección privada · válida hasta el {collection.expiresAtLabel}
        </p>
      </footer>
    </div>
  );
}

// ─── Portada ─────────────────────────────────────────────────────────────────

function CollectionCover({
  collection,
}: {
  collection: PublicViewingCollection;
}) {
  return (
    <section className="pt-10 text-center md:pt-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-dark">
        Private Viewing Collection
      </p>
      <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight text-ink md:text-5xl">
        {collection.title}
      </h1>
      <p className="mt-3 font-serif text-lg text-ink/70 md:text-xl">
        Seleccionado para {collection.clientFirstName}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-ink/60">
        {collection.dateLabel && <span>{collection.dateLabel}</span>}
        {collection.windowLabel && (
          <>
            <span className="text-gold/60">·</span>
            <span>{collection.windowLabel}</span>
          </>
        )}
        <span className="text-gold/60">·</span>
        <span>
          {collection.stopCount}{" "}
          {collection.stopCount === 1 ? "residencia" : "residencias"}
        </span>
      </div>

      <div className="mx-auto mt-8 h-px w-16 bg-gold/40" />
    </section>
  );
}

// ─── Resumen del día ─────────────────────────────────────────────────────────

function DayOverview({ stops }: { stops: PublicViewingStop[] }) {
  return (
    <section className="mt-10 rounded-2xl border border-gold/20 bg-white/70 p-5 md:p-6">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/50">
        Tu jornada de visitas
      </h2>
      <ul className="mt-4 divide-y divide-gold/10">
        {stops.map((stop) => (
          <li
            key={stop.order}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="w-12 shrink-0 font-mono text-[12px] font-medium tabular-nums text-ink/70">
              {stop.timeLabel ?? "—"}
            </span>
            <a
              href={`#residence-${stop.order}`}
              className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink transition hover:text-gold-dark"
            >
              {stop.title}
            </a>
            <span className="hidden shrink-0 text-[11px] text-ink/45 sm:inline">
              {stop.zoneLabel}
            </span>
            <StatusPill status={stop.status} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPill({
  status,
  compact = false,
}: {
  status: PublicStopStatus;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        STATUS_STYLE[status],
      )}
    >
      {compact
        ? status === "confirmed"
          ? "Confirmada"
          : status === "pending"
            ? "Pendiente"
            : "Cancelada"
        : STATUS_LABEL[status]}
    </span>
  );
}

// ─── Residencia ──────────────────────────────────────────────────────────────

function ResidencePreview({
  stop,
  onView,
  onExpand,
  onSmartLinkClick,
}: {
  stop: PublicViewingStop;
  onView: () => void;
  onExpand: () => void;
  onSmartLinkClick: () => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const viewed = useRef(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Una residencia cuenta como "vista" cuando entra en el viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !viewed.current) {
            viewed.current = true;
            onView();
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onView]);

  const isCancelled = stop.status === "cancelled";
  const isUnavailable = stop.availability === "unavailable";

  const handleExpand = () => {
    setGalleryOpen((open) => {
      if (!open) onExpand();
      return !open;
    });
  };

  return (
    <section
      ref={ref}
      id={`residence-${stop.order}`}
      className={cn("scroll-mt-20", (isCancelled || isUnavailable) && "opacity-70")}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold-dark">
          Residencia {String(stop.order).padStart(2, "0")}
        </span>
        <span className="h-px flex-1 bg-gold/25" />
      </div>

      {isUnavailable ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white/50 px-5 py-10 text-center">
          <p className="font-serif text-lg text-ink/70">{stop.title}</p>
          <p className="mt-2 text-[13px] text-ink/55">
            Esta propiedad ya no está disponible.
          </p>
        </div>
      ) : (
        <article className="overflow-hidden rounded-2xl border border-gold/20 bg-white/80 shadow-[0_18px_45px_-32px_rgba(40,28,10,0.4)]">
          {stop.coverPhotoUrl && (
            <button
              type="button"
              onClick={handleExpand}
              className="relative block aspect-[16/10] w-full overflow-hidden bg-ink/5 md:aspect-[16/9]"
              aria-label="Ver más fotos"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stop.coverPhotoUrl}
                alt={stop.title}
                loading={stop.order === 1 ? "eager" : "lazy"}
                className="h-full w-full object-cover transition duration-500 hover:scale-[1.02]"
              />
              {stop.photoUrls.length > 1 && (
                <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-medium text-cream-50 backdrop-blur">
                  {galleryOpen
                    ? "Ocultar fotos"
                    : `+${stop.photoUrls.length - 1} fotos`}
                </span>
              )}
            </button>
          )}

          {/* Galería diferida: no se cargan 6 galerías completas de entrada. */}
          {galleryOpen && stop.photoUrls.length > 1 && (
            <div className="grid grid-cols-2 gap-1 bg-ink/5 p-1 sm:grid-cols-3">
              {stop.photoUrls.slice(1, 10).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`${stop.title} — foto ${i + 2}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              ))}
            </div>
          )}

          <div className="p-5 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-serif text-xl font-semibold text-ink md:text-2xl">
                  {stop.title}
                </h3>
                <p className="mt-1 text-[13px] text-ink/55">
                  {stop.propertyTypeLabel
                    ? `${stop.propertyTypeLabel} · ${stop.zoneLabel}`
                    : stop.zoneLabel}
                </p>
              </div>
              <div className="text-right">
                <p className="font-serif text-xl font-semibold text-ink md:text-2xl">
                  {stop.priceLabel}
                </p>
                {stop.bcReference && (
                  <p className="mt-1 font-mono text-[10px] tracking-wider text-ink/45">
                    {stop.bcReference}
                  </p>
                )}
              </div>
            </div>

            {(stop.availability === "reserved" ||
              stop.availability === "sold") && (
              <p className="mt-3 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                {AVAILABILITY_LABEL[stop.availability]}
              </p>
            )}

            <ScheduleBlock stop={stop} />

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-gold/15 pt-4 text-[13px] text-ink/70">
              <Spec icon={<BedDouble size={15} strokeWidth={1.6} />}>
                {stop.bedrooms} hab
              </Spec>
              <Spec icon={<Bath size={15} strokeWidth={1.6} />}>
                {stop.bathrooms} baños
              </Spec>
              {stop.squareMeters ? (
                <Spec icon={<Ruler size={15} strokeWidth={1.6} />}>
                  {stop.squareMeters} m²
                </Spec>
              ) : null}
            </div>

            <LocationBlock stop={stop} />

            {stop.smartLinkUrl && !isCancelled && (
              <a
                href={stop.smartLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onSmartLinkClick}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-[13px] font-medium text-cream-50 transition hover:bg-ink-soft sm:w-auto"
              >
                <span>Ver la residencia</span>
                <ArrowUpRight size={15} strokeWidth={1.75} className="text-gold" />
              </a>
            )}
          </div>
        </article>
      )}
    </section>
  );
}

function Spec({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-gold-dark">{icon}</span>
      {children}
    </span>
  );
}

function ScheduleBlock({ stop }: { stop: PublicViewingStop }) {
  if (!stop.timeLabel && stop.status !== "cancelled") return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {stop.timeLabel && (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/5 px-2.5 py-1.5 text-[12px] font-medium text-ink/80">
          <Clock size={13} strokeWidth={1.75} className="text-gold-dark" />
          {stop.timeLabel}
          {stop.durationLabel && (
            <span className="text-ink/50">· {stop.durationLabel}</span>
          )}
        </span>
      )}
      <StatusPill status={stop.status} />
    </div>
  );
}

/**
 * Dirección o zona.
 *
 * Cuando la parada es `area_only`, el contrato trae exactAddress, exactLat y
 * exactLng a null y areaLocation también (V1 no tiene centroides fiables), así
 * que aquí simplemente NO hay mapa. No se oculta con CSS: el dato no existe.
 */
function LocationBlock({ stop }: { stop: PublicViewingStop }) {
  const hasExact = Boolean(stop.exactAddress);
  return (
    <div className="mt-4 flex items-start gap-2 text-[13px]">
      <MapPin
        size={15}
        strokeWidth={1.6}
        className="mt-0.5 shrink-0 text-gold-dark"
      />
      <div className="min-w-0">
        <p className="text-ink/80">
          {hasExact ? stop.exactAddress : stop.zoneLabel}
        </p>
        {!hasExact && (
          <p className="mt-0.5 text-[11px] text-ink/45">
            La dirección exacta se facilita al confirmar la visita
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Agente ──────────────────────────────────────────────────────────────────

function AgentContactBlock({ agent }: { agent: PublicAgentContact }) {
  return (
    <section className="mt-14 rounded-2xl border border-gold/20 bg-white/70 p-6 md:p-8">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/50">
        Tu asesor
      </h2>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink font-serif text-base text-cream-50">
            {agent.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agent.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              agent.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
          <p className="font-serif text-lg font-medium text-ink">
            {agent.displayName}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {agent.email && (
            <a
              href={`mailto:${agent.email}`}
              className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
            >
              <Mail size={13} strokeWidth={1.75} className="text-gold-dark" />
              Email
            </a>
          )}
          {agent.phone && (
            <a
              href={`tel:${agent.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
            >
              <Phone size={13} strokeWidth={1.75} className="text-gold-dark" />
              {agent.phone}
            </a>
          )}
          {agent.whatsappUrl && (
            <a
              href={agent.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft"
            >
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
