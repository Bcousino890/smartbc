"use client";

// ============================================================================
// Una fila del catálogo.
//
// Sustituye a la tabla de once columnas y 1.200 px de ancho mínimo. La fila
// lleva lo que decide en dos segundos —foto, qué es, cuánto vale, en qué
// estado está y si alguien la quiere— y ni una columna por inercia: "Agencia"
// (cinco valores en 1.331 filas) y "Publicado" viven ahora en el workspace.
// ============================================================================

import { Calendar, Film, ImageOff, Users } from "lucide-react";
import type { PropertyListItem } from "@/lib/properties-workspace/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/plural";
import { cn } from "@/lib/utils";
import { Pill, type Tone } from "@/components/admin/ui/primitives";

const STATUS_TONE: Record<string, Tone> = {
  available: "positive",
  reserved: "warning",
  sold: "info",
  rented: "info",
  archived: "neutral",
  draft: "neutral",
};

export function PropertyRow({
  property,
  active,
  selected,
  selectable,
  country,
  onOpen,
  onToggleSelect,
}: {
  property: PropertyListItem;
  active: boolean;
  selected: boolean;
  selectable: boolean;
  country: Country;
  onOpen: () => void;
  onToggleSelect: (checked: boolean) => void;
}) {
  const t = useT();
  const tn = useTn();
  const config = getCountryConfig(country);
  const p = property;

  const specs = [
    p.bedrooms > 0 ? tn("pw.spec.bedrooms", p.bedrooms) : null,
    p.bathrooms > 0 ? tn("pw.spec.bathrooms", p.bathrooms) : null,
    p.squareMeters ? `${p.squareMeters} m²` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const operational = p.attention.operational.length > 0;

  return (
    <li>
      <div
        className={cn(
          "flex gap-2.5 border-b border-ink/6 px-3 py-2 transition-colors",
          active ? "bg-gold/[0.07]" : "hover:bg-ink/[0.025]",
        )}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelect(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label={t("pw.row.select", { title: p.title })}
            className="mt-4 h-3.5 w-3.5 shrink-0 accent-[#8a6d3b]"
          />
        )}

        <button
          type="button"
          onClick={onOpen}
          aria-current={active ? "true" : undefined}
          className="flex min-w-0 flex-1 gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          {/* La miniatura va en una caja fija con lazy: no se baja la galería,
              solo la portada, y el navegador la reescala. */}
          <span className="mt-0.5 flex h-[52px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded bg-ink/[0.06]">
            {p.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <ImageOff size={15} strokeWidth={1.6} className="text-ink/25" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            {/* Línea 1 — qué es y cuánto vale */}
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  "min-w-0 truncate text-[13px]",
                  active ? "font-semibold text-ink" : "font-medium text-ink/90",
                )}
              >
                {p.title}
              </span>
              <span dir="ltr" className="ms-auto shrink-0 text-[12.5px] font-medium tabular-nums text-ink">
                {config.formatPrice(p.price, p.currency, p.operation)}
              </span>
            </span>

            {/* Línea 2 — dónde y cómo de grande */}
            <span className="mt-0.5 flex items-baseline gap-2 text-[11px] text-ink/50">
              <span className="min-w-0 truncate">
                {[p.zone, p.bcReference].filter(Boolean).join(" · ")}
              </span>
              <span className="ms-auto shrink-0 text-ink/45">{specs}</span>
            </span>

            {/* Línea 3 — estado y señales. Solo lo que cambia la acción. */}
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink/45">
              <Pill tone={STATUS_TONE[p.status] ?? "neutral"}>
                {t(`pw.status.${p.status}`)}
              </Pill>
              {p.publishedWeb && <Pill tone="gold">{t("pw.row.published")}</Pill>}
              {p.interestClients > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-gold-dark">
                  <Users size={10} strokeWidth={2} />
                  {tn("pw.row.interest", p.interestClients)}
                </span>
              )}
              {p.upcomingStops > 0 && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Calendar size={10} strokeWidth={2} />
                  {tn("pw.row.viewings", p.upcomingStops)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                {tn("pw.row.photos", p.photoCount)}
                {p.hasVideo && <Film size={10} strokeWidth={2} className="text-ink/35" />}
              </span>
              {operational && (
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {t(`pw.attention.${p.attention.operational[0]}`)}
                </span>
              )}
            </span>
          </span>
        </button>
      </div>
    </li>
  );
}
