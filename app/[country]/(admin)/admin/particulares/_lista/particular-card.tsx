"use client";

import {
  Bath,
  BedDouble,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  ImageOff,
  Link2,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneOff,
  Ruler,
  TrendingDown,
  UserCheck,
  Video,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { setTabIntent } from "../_ficha/tab-intent";
import type { ParticularRow } from "../particulares-types";
import {
  fmtEur,
  fmtNum,
  fmtPct,
  hasBothOps,
  isNew,
  opLabel,
  sourceOffers,
  portalName,
  pricePerM2Label,
  shortPhone,
  streetLabel,
  telHref,
  exactTime,
  whatsappHref,
  zoneLabel,
} from "./format";

// timeZone fijo a Madrid (mismo motivo que DATE_FMT del modal: el servidor está
// en UTC y el navegador en hora local → sin esto, error de hidratación #418).
const SHORT_DATE = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});
const LONG_DATE = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/** Cómo se pinta la tarjeta. `auto` = cuadrícula en escritorio y fila compacta en móvil. */
export type CardLayout = "grid" | "list" | "auto";

// Clases por layout, escritas enteras (Tailwind solo ve literales): la tarjeta
// es UNA misma estructura que cambia de dirección/medidas, no tres componentes.
const L = {
  // En `list` de escritorio las acciones pasan a la derecha de la fila.
  root: {
    grid: "flex-col",
    list: "flex-col sm:flex-row",
    auto: "flex-col",
  },
  top: {
    grid: "flex-col",
    list: "flex-row sm:min-w-0 sm:flex-1",
    auto: "flex-row sm:flex-col",
  },
  photo: {
    grid: "aspect-[16/10] w-full",
    list: "min-h-[116px] w-[120px] shrink-0 self-stretch sm:w-44",
    auto: "min-h-[116px] w-[120px] shrink-0 self-stretch sm:aspect-[16/10] sm:min-h-0 sm:w-full sm:self-auto",
  },
  info: {
    grid: "gap-2.5 p-4",
    list: "gap-1 p-3 sm:p-3.5",
    auto: "gap-1 p-3 sm:gap-2.5 sm:p-4",
  },
  // Etiquetas sobre la foto: en miniatura (120 px) no caben, pasan a la línea de meta.
  photoChips: {
    grid: "",
    list: "hidden",
    auto: "hidden sm:block",
  },
  metaPrefix: {
    grid: "hidden",
    list: "",
    auto: "sm:hidden",
  },
  linked: {
    grid: "",
    list: "hidden",
    auto: "hidden sm:block",
  },
  actions: {
    grid: "border-t",
    list: "border-t sm:w-[276px] sm:shrink-0 sm:border-l sm:border-t-0",
    auto: "border-t",
  },
} as const;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-white";

type CardProps = {
  row: ParticularRow;
  layout: CardLayout;
  /** `Date.now()` ya montado en cliente; null mientras hidrata (se pinta fecha absoluta). */
  now: number | null;
  /** Enlace real de la ficha (?ficha=…): permite abrir en otra pestaña. */
  href: string;
  onOpen: (row: ParticularRow) => void;
  onPrefetch: (id: string) => void;
  copied: boolean;
  onCopyPhone: (phone: string, id: string) => void;
};

function ParticularCardImpl({ row, layout, now, href, onOpen, onPrefetch, copied, onCopyPhone }: CardProps) {
  const retired = !row.is_active;
  const cover = row.cover_url ?? row.photos?.[0]?.url ?? null;
  const op = opLabel(row);
  const both = hasBothOps(row);
  const zone = zoneLabel(row.zone);
  const street = streetLabel(row.address, row.zone);
  const portal = portalName(row.portal);
  const perM2 = pricePerM2Label(row.price, row.square_meters, row.operation);
  const isRent = row.operation === "rent";
  const drop = row.price_drop_pct != null && row.price_drop_pct > 0 ? row.price_drop_pct : null;
  const fresh = !retired && isNew(row.created_at, now);
  const ago = exactTime(row.created_at, now);
  const absolute = row.created_at ? LONG_DATE.format(new Date(row.created_at)) : null;
  const sources = sourceOffers(row);
  const hasVideo = Boolean(row.has_video || row.video_url);
  const hasPlan = Boolean(row.has_floor_plan || row.floor_plan_url);
  const priceText = row.price != null ? fmtEur(row.price) : null;

  const specs: Array<{ key: string; icon: React.ReactNode; text: string }> = [];
  if (row.bedrooms != null)
    specs.push({
      key: "hab",
      icon: <BedDouble size={15} strokeWidth={1.75} aria-hidden="true" />,
      text: row.bedrooms === 0 ? "Estudio" : `${fmtNum(row.bedrooms)} hab.`,
    });
  if (row.bathrooms != null)
    specs.push({
      key: "ban",
      icon: <Bath size={15} strokeWidth={1.75} aria-hidden="true" />,
      text: `${fmtNum(row.bathrooms)} ${row.bathrooms === 1 ? "baño" : "baños"}`,
    });
  if (row.square_meters != null)
    specs.push({
      key: "m2",
      icon: <Ruler size={15} strokeWidth={1.75} aria-hidden="true" />,
      text: `${fmtNum(row.square_meters)} m²`,
    });

  const ariaLabel = [
    `Abrir ficha: ${op} en ${zone}`,
    street || null,
    priceText ? `${priceText}${isRent ? " al mes" : ""}` : "sin precio",
    retired ? "anuncio retirado" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const waText = `Hola, le escribo por su anuncio de ${both ? "venta/alquiler" : isRent ? "alquiler" : "venta"} en ${zone} (${portal}).`;

  return (
    <article
      onMouseEnter={() => onPrefetch(row.id)}
      onFocus={() => onPrefetch(row.id)}
      onTouchStart={() => onPrefetch(row.id)}
      className={cn(
        "group relative flex overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_1px_2px_rgba(40,28,10,0.05)] transition",
        "hover:border-gold/60 hover:shadow-[0_14px_32px_-18px_rgba(40,28,10,0.4)]",
        L.root[layout],
      )}
    >
      {/* Overlay: ÚNICO elemento accesible que abre la ficha. Las acciones rápidas
          (llamar, WhatsApp…) son hermanas, nunca hijas: así no hay <button> dentro
          de <button> y cada una se puede enfocar y leer por separado. */}
      <a
        href={href}
        onClick={(e) => {
          // Ctrl/⌘/Shift/clic central: que el navegador abra otra pestaña con ?ficha=.
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onOpen(row);
        }}
        aria-label={ariaLabel}
        className={cn("absolute inset-0 z-[1] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink")}
      />

      <div className={cn("flex", L.top[layout])}>
        {/* ── Foto ───────────────────────────────────────────────────── */}
        <div className={cn("relative overflow-hidden bg-cream-100", L.photo[layout])}>
          <CoverImage src={cover} retired={retired} />

          {/* Degradado inferior: da fondo legible a las etiquetas sin tapar la foto. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/55 to-transparent"
          />

          <div className={cn("pointer-events-none", L.photoChips[layout])}>
            <span className="absolute left-2.5 top-2.5 rounded-md bg-ink/90 px-2 py-1 text-xs font-bold uppercase leading-none tracking-wider text-cream-50">
              {op}
            </span>
            <span className="absolute right-2.5 top-2.5 rounded-md bg-white/95 px-2 py-1 text-xs font-bold leading-none text-ink shadow-sm">
              {portal}
            </span>
          </div>

          {/* Nuevo / Bajó de precio: lo que más pesa para captar, siempre sobre la foto. */}
          {(fresh || drop != null) && (
            <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-1">
              {fresh && (
                <span className="rounded-md bg-gold px-2 py-1 text-xs font-bold leading-none text-ink shadow-sm">Nuevo</span>
              )}
              {drop != null && (
                <span
                  title={row.previous_price != null ? `Antes: ${fmtEur(row.previous_price)}` : undefined}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-2 py-1 text-xs font-bold leading-none text-white shadow-sm"
                >
                  <TrendingDown size={12} strokeWidth={2.25} aria-hidden="true" />
                  Bajó {fmtPct(drop)}
                </span>
              )}
            </div>
          )}

          {retired && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/35">
              <span className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow">
                Retirado
              </span>
            </span>
          )}
        </div>

        {/* ── Datos ──────────────────────────────────────────────────── */}
        <div className={cn("flex min-w-0 flex-1 flex-col", L.info[layout])}>
          <div className="flex items-baseline gap-x-2">
            {priceText ? (
              <p className="min-w-0 truncate text-xl font-bold leading-7 tracking-tight text-ink tabular-nums sm:text-[22px]">
                {priceText}
                {isRent && <span className="ml-1 text-sm font-medium text-ink/60">/mes</span>}
              </p>
            ) : (
              <p className="text-base font-semibold text-ink/60">Precio sin indicar</p>
            )}
            {perM2 && (
              <span className="ml-auto shrink-0 text-xs font-medium text-ink/60 tabular-nums" title="Precio por metro cuadrado">
                {perM2}
              </span>
            )}
          </div>

          {specs.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink/75">
              {specs.map((s) => (
                <li key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="text-ink/45">{s.icon}</span>
                  {s.text}
                </li>
              ))}
            </ul>
          )}

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <MapPin size={14} strokeWidth={1.75} className="shrink-0 text-gold-dark" aria-hidden="true" />
              <span className="truncate">{zone}</span>
            </p>
            {street && (
              <p className="truncate pl-[21px] text-sm text-ink/65" title={street}>
                {street}
              </p>
            )}
          </div>

          {sources && (
            <div className={cn("min-w-0 rounded-lg border border-ink/10 bg-cream-50/70 px-2.5 py-1.5", L.linked[layout])}>
              <ul className="space-y-0.5" aria-label="Fuentes del inmueble">
                {sources.shown.map((o, i) => (
                  <li key={`${o.portal}-${o.op}-${i}`} className={cn("flex items-baseline gap-1.5 text-xs", o.active ? "text-ink" : "text-ink/50")}>
                    <Link2 size={11} strokeWidth={1.75} className="shrink-0 translate-y-px text-gold-dark" aria-hidden="true" />
                    <span className="truncate font-medium">
                      {portalName(o.portal)}
                      {o.op && <span className="font-normal text-ink/60"> · {o.op === "rent" ? "Alquiler" : "Venta"}</span>}
                    </span>
                    <span className="ml-auto shrink-0 font-semibold tabular-nums">
                      {o.price != null ? `${fmtEur(o.price)}${o.op === "rent" ? "/mes" : ""}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setTabIntent("fuentes");
                  onOpen(row);
                }}
                className={cn("relative z-[2] mt-1 text-xs font-semibold text-gold-dark underline-offset-2 hover:underline", FOCUS)}
              >
                Ver todos los {sources.total} anuncios
              </button>
            </div>
          )}

          {/* Estado del contacto y gestión interna: pastillas, no párrafos. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {row.phone ? (
              <button
                type="button"
                onClick={() => onCopyPhone(row.phone!, row.id)}
                aria-label={copied ? "Teléfono copiado" : `Copiar teléfono ${shortPhone(row.phone)}`}
                title="Copiar teléfono"
                className={cn(
                  "relative z-[2] inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition",
                  copied
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-emerald-700/25 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                  FOCUS,
                )}
              >
                {copied ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={12} strokeWidth={2} aria-hidden="true" />}
                {copied ? "¡Copiado!" : shortPhone(row.phone)}
              </button>
            ) : row.chat_only ? (
              <Pill tone="amber" icon={<MessageSquare size={12} strokeWidth={2} />}>
                Solo chat
              </Pill>
            ) : (
              <Pill tone="grey" icon={<PhoneOff size={12} strokeWidth={2} />}>
                Sin teléfono
              </Pill>
            )}
            {row.assigned_name && (
              <Pill tone="blue" icon={<UserCheck size={12} strokeWidth={2} />}>
                {row.assigned_name}
              </Pill>
            )}
            {row.last_contact_by && (
              <Pill tone="violet" icon={<ClipboardList size={12} strokeWidth={2} />}>
                Contactado · {row.last_contact_by}
                {row.last_contact_at && ` · ${SHORT_DATE.format(new Date(row.last_contact_at))}`}
              </Pill>
            )}
            {retired && row.taken_down_at && (
              <Pill tone="red">Retirado · {SHORT_DATE.format(new Date(row.taken_down_at))}</Pill>
            )}
            {hasVideo && (
              <Pill tone="neutral" icon={<Video size={12} strokeWidth={2} />}>
                Vídeo
              </Pill>
            )}
            {hasPlan && (
              <Pill tone="neutral" icon={<Ruler size={12} strokeWidth={2} />}>
                Plano
              </Pill>
            )}
          </div>

          {/* Línea de meta: portal y tiempo en el portal. En miniatura lleva además la operación. */}
          <p className="mt-auto flex flex-wrap items-center gap-x-1.5 text-xs text-ink/65">
            <span className={cn("font-semibold text-ink/75", L.metaPrefix[layout])}>
              {op}
              <span aria-hidden="true"> · </span>
              {portal}
              <span aria-hidden="true"> · </span>
            </span>
            <span title={absolute ? `Detectado el ${absolute}` : undefined}>
              {ago ?? (absolute ? `Detectado el ${absolute}` : "")}
            </span>
            {row.particular_reference && (
              <span className="ml-auto hidden font-mono text-xs text-ink/55 sm:inline">{row.particular_reference}</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Acciones rápidas: hermanas del overlay, por encima de él ───────── */}
      <div
        className={cn(
          "pointer-events-none relative z-[2] flex items-center gap-2 border-ink/10 bg-cream-50/70 p-2.5",
          L.actions[layout],
        )}
      >
        {row.phone ? (
          <>
            <a
              href={telHref(row.phone)}
              aria-label={`Llamar al ${shortPhone(row.phone)}`}
              className={cn(
                "pointer-events-auto flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-3 text-sm font-semibold text-cream-50 transition hover:bg-ink-soft",
                FOCUS,
              )}
            >
              <Phone size={16} strokeWidth={2} aria-hidden="true" />
              Llamar
            </a>
            <a
              href={whatsappHref(row.phone, waText)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Escribir por WhatsApp al ${shortPhone(row.phone)} (se abre en otra pestaña)`}
              className={cn(
                "pointer-events-auto flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100",
                FOCUS,
              )}
            >
              <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
              WhatsApp
            </a>
          </>
        ) : (
          <a
            href={row.source_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${row.chat_only ? "Contactar por el chat de" : "Abrir el anuncio en"} ${portal} (se abre en otra pestaña)`}
            className={cn(
              "pointer-events-auto flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-ink/15 bg-white px-3 text-sm font-semibold text-ink transition hover:border-gold/60 hover:bg-gold/5",
              FOCUS,
            )}
          >
            <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
            <span className="truncate">{row.chat_only ? `Chat en ${portal}` : `Abrir en ${portal}`}</span>
          </a>
        )}
        {/* Decorativo: el clic lo recoge el overlay (pointer-events-none lo deja pasar). */}
        <span
          aria-hidden="true"
          className="pointer-events-none flex h-10 shrink-0 items-center gap-1 rounded-xl border border-ink/15 bg-white px-3 text-sm font-semibold text-ink transition group-hover:border-gold/60"
        >
          Ficha
          <ChevronRight size={15} strokeWidth={2} />
        </span>
      </div>
    </article>
  );
}

export const ParticularCard = memo(ParticularCardImpl);

// ── Piezas ────────────────────────────────────────────────────────────────────

const TONES = {
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  grey: "border-ink/15 bg-ink/[0.04] text-ink/70",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
  red: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-ink/10 bg-ink/[0.04] text-ink/70",
} as const;

function Pill({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs font-semibold",
        TONES[tone],
      )}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Portada con carga perezosa y estados: esqueleto mientras llega, fundido al
 * cargar y, sin foto o si el enlace está roto, un fondo cálido con icono (nunca
 * un hueco gris vacío).
 */
function CoverImage({ src, retired }: { src: string | null; retired: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");
  const ref = useRef<HTMLImageElement>(null);

  // Una imagen cacheada puede estar ya completa antes de hidratar: su `onLoad`
  // no se dispara y se quedaría invisible. Se comprueba al montar.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "loaded" : "error");
  }, [src]);

  if (!src || state === "error") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-cream-100 via-cream-100 to-cream-200">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/75 text-ink/45 ring-1 ring-ink/10">
          <ImageOff size={20} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="text-xs font-medium text-ink/60">Sin foto</span>
      </div>
    );
  }

  return (
    <>
      {state === "loading" && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-cream-200" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]",
          state === "loaded" ? "opacity-100" : "opacity-0",
          retired && "grayscale",
        )}
      />
    </>
  );
}
