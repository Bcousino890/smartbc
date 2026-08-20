"use client";

// ============================================================================
// Primitivas del panel de enlaces de portales.
//
// Toman prestado el lenguaje de la colección privada (/v/[token]): la
// información se compone con TIPOGRAFÍA y FILETES, no con cajas ni badges de
// colores. Etiquetas en versalitas (crm-label-sm), cifras tabulares
// (crm-number), una línea de oro para separar. La diferencia con la colección
// es la densidad: esto es una herramienta de trabajo y hay que ver diez
// anuncios de un vistazo, así que las escalas son más pequeñas y el aire,
// menor.
// ============================================================================

import { Star } from "lucide-react";
import { portalLabel } from "@/lib/portal-links/portals";
import {
  LINK_STATUS_LABEL,
  type PortalLinkStatus,
} from "@/lib/portal-links/types";
import { cn } from "@/lib/utils";

/** Etiqueta en versalitas. */
export function Label({
  children,
  className,
  tone = "ink",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "ink" | "gold" | "cream";
}) {
  return (
    <span
      className={cn(
        "block crm-label-sm",
        tone === "ink" && "text-ink/45",
        tone === "gold" && "text-gold-dark",
        tone === "cream" && "text-cream-50/70",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Filete horizontal: el único "borde" que usa el panel. */
export function Rule({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "gold";
}) {
  return (
    <hr
      className={cn(
        "border-0 border-t",
        tone === "ink" ? "border-ink/10" : "border-gold/30",
        className,
      )}
    />
  );
}

/** Filete corto centrado, al modo de un libro. */
export function Ornament({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("block h-px w-8 bg-gold/50", className)} />
  );
}

/**
 * El estado se dice con PALABRAS, como en la colección. El color solo matiza:
 * oro para lo que avanza, tinta apagada para lo que se cae.
 */
const STATUS_TONE: Record<PortalLinkStatus, string> = {
  pending: "text-ink/50",
  no_answer: "text-amber-700/85",
  callback: "text-amber-700/85",
  to_visit: "text-gold-dark",
  discarded: "text-ink/30",
  converted: "text-emerald-700/85",
};

export function StatusWord({
  status,
  className,
}: {
  status: PortalLinkStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "crm-label-sm",
        STATUS_TONE[status],
        className,
      )}
    >
      {LINK_STATUS_LABEL[status]}
    </span>
  );
}

/** Procedencia del anuncio + su referencia en el portal. */
export function PortalTag({
  portal,
  externalRef,
  className,
}: {
  portal: string;
  externalRef?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "crm-label-sm text-ink/35",
        className,
      )}
    >
      {portalLabel(portal)}
      {externalRef ? ` · ${externalRef}` : ""}
    </span>
  );
}

/**
 * Valoración del CLIENTE, de 0 a 5. Pulsar la misma estrella que ya estaba
 * puesta la quita: sin ese gesto, una nota mal dada solo se corrige bajándola
 * a 1, nunca a "sin valorar".
 *
 * Es el único icono del panel. Se gana el sitio: cinco estrellas se leen de un
 * vistazo al repasar catorce anuncios, y no hay forma tipográfica de decir eso
 * igual de rápido.
 */
export function RatingStars({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number;
  onChange?: (next: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const readOnly = !onChange || disabled;
  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      role={readOnly ? "img" : "radiogroup"}
      aria-label={`Le gusta al cliente: ${value} de 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n} de 5`}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(value === n ? 0 : n);
            }}
            className={cn(
              "transition",
              readOnly ? "cursor-default" : "cursor-pointer hover:scale-110",
            )}
          >
            <Star
              size={13}
              strokeWidth={1.75}
              className={cn(
                on ? "fill-gold text-gold" : "fill-transparent text-ink/20",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Cifra editorial: tabular, sin caja. */
export function Figure({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("crm-number leading-none text-ink", className)}>
      {children}
    </span>
  );
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

const DATE_TIME_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Intl.format con una fecha inválida lanza RangeError — parseo defensivo. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME_FMT.format(d);
}

export function formatVisitMoment(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

/** "hace 5 min", "hace 2 h", "ayer" — para el hilo de llamadas. */
export function formatAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return DATE_TIME_FMT.format(d);
}

/** Iniciales para el avatar del compañero asignado. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * `tel:` no admite espacios ni paréntesis en todos los marcadores; se limpia
 * todo menos dígitos y el "+" inicial.
 */
export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}
