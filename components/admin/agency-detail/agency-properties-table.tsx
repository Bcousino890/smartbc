"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PLACEHOLDER_GRADIENT } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { formatRelativeMinutes } from "@/lib/relative-time";
import type { AgencyPropertyRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AgencyPropertiesTable({
  properties,
}: {
  properties: AgencyPropertyRow[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");

  // Buscador local: filtra por título, referencia o zona sobre las propiedades
  // ya cargadas. Soluciona el "lío" de encontrar un piso concreto entre muchos.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) =>
      [p.title, p.reference, p.zone]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q)),
    );
  }, [properties, query]);

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          {t("agency.properties.title")}
        </h2>
        <Link
          href="/admin/propiedades"
          className="flex items-center gap-1.5 text-[12px] font-medium text-gold-dark transition hover:text-gold"
        >
          <span>{t("agency.properties.viewAll")}</span>
          <ArrowRight size={13} strokeWidth={1.75} />
        </Link>
      </header>

      {properties.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 py-2">
          <Search size={15} strokeWidth={1.75} className="text-ink/45" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("agency.properties.search")}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
          />
          {query && (
            <span className="shrink-0 text-[11px] text-ink/50">
              {filtered.length}/{properties.length}
            </span>
          )}
        </div>
      )}

      {properties.length === 0 ? (
        <p className="mt-6 rounded-xl border border-gold/15 bg-white/40 px-4 py-10 text-center text-sm text-ink/55">
          {t("agency.properties.empty")}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-y-1.5 text-left text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                <th className="px-4 pb-2">
                  {t("agency.properties.table.property")}
                </th>
                <th className="px-4 pb-2">
                  {t("agency.properties.table.type")}
                </th>
                <th className="px-4 pb-2">
                  {t("agency.properties.table.zone")}
                </th>
                <th className="px-4 pb-2 text-center">
                  {t("agency.properties.table.bedrooms")}
                </th>
                <th className="px-4 pb-2 text-center">
                  {t("agency.properties.table.bathrooms")}
                </th>
                <th className="px-4 pb-2">
                  {t("agency.properties.table.price")}
                </th>
                <th className="px-4 pb-2">
                  {t("agency.properties.table.lastUpdate")}
                </th>
                <th className="px-4 pb-2 text-right">{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <PropertyRow key={p.id} property={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PropertyRow({ property }: { property: AgencyPropertyRow }) {
  const t = useT();
  const isRent = property.operation === "alquiler";
  const formatted = formatPrice(property.price);
  const priceLabel = isRent
    ? t("agency.properties.price.rent", { price: `${formatted} €` })
    : t("agency.properties.price.sale", { price: `${formatted} €` });

  return (
    <tr className="bg-white/55 transition hover:bg-white/85">
      <td className="rounded-l-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-12 w-16 shrink-0 rounded-md"
            style={{ backgroundImage: PLACEHOLDER_GRADIENT }}
          />
          <div>
            <p className="font-medium text-ink">{property.title}</p>
            <p className="text-[11px] text-ink/55">
              {t("agency.properties.ref", { ref: property.reference })}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
            isRent
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {isRent
            ? t("filters.operation.rent")
            : t("filters.operation.sale")}
        </span>
      </td>
      <td className="px-4 py-3 text-ink/75">{property.zone}</td>
      <td className="px-4 py-3 text-center font-medium text-ink">
        {property.bedrooms}
      </td>
      <td className="px-4 py-3 text-center font-medium text-ink">
        {property.bathrooms}
      </td>
      <td className="px-4 py-3 font-semibold text-ink">{priceLabel}</td>
      <td className="px-4 py-3 text-[12px] text-ink/65">
        {formatRelativeMinutes(property.lastUpdateMinutes, t)}
      </td>
      <td className="rounded-r-xl px-4 py-3 text-right">
        <Link
          href={`/admin/propiedades/${property.id}`}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft"
        >
          <span>{t("agency.properties.table.viewDetails")}</span>
          <ArrowRight size={13} strokeWidth={1.75} className="text-gold" />
        </Link>
      </td>
    </tr>
  );
}
