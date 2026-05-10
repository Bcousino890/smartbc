"use client";

import {
  ArrowRight,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PLACEHOLDER_GRADIENT } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import type { AdminProperty, AdminPropertyStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<AdminPropertyStatus, string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-700",
  reserved: "border-amber-200 bg-amber-50 text-amber-700",
  rented: "border-blue-200 bg-blue-50 text-blue-700",
  sold: "border-violet-200 bg-violet-50 text-violet-700",
  draft: "border-ink/15 bg-ink/5 text-ink/55",
};

export function PropertiesAdminClient({
  properties,
}: {
  properties: AdminProperty[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.reference.toLowerCase().includes(q) ||
        p.zone.toLowerCase().includes(q),
    );
  }, [properties, query]);

  return (
    <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
          <Search size={15} strokeWidth={1.75} className="text-ink/45" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adminProps.search.placeholder")}
            className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </label>
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink-soft"
        >
          <Plus size={14} strokeWidth={1.75} className="text-gold" />
          <span>{t("adminProps.add")}</span>
        </button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-separate border-spacing-y-1.5 text-left text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              <th className="px-3 pb-2">{t("adminProps.table.property")}</th>
              <th className="px-3 pb-2">{t("adminProps.table.agency")}</th>
              <th className="px-3 pb-2">{t("adminProps.table.zone")}</th>
              <th className="px-3 pb-2">{t("adminProps.table.operation")}</th>
              <th className="px-3 pb-2 text-center">
                {t("adminProps.table.size")}
              </th>
              <th className="px-3 pb-2">{t("adminProps.table.price")}</th>
              <th className="px-3 pb-2">{t("adminProps.table.status")}</th>
              <th className="px-3 pb-2">
                {t("adminProps.table.published")}
              </th>
              <th className="px-3 pb-2 text-right">
                {t("adminProps.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="rounded-xl border border-gold/15 bg-white/40 px-4 py-10 text-center text-ink/55"
                >
                  {t("adminProps.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((p) => <PropertyRow key={p.id} property={p} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PropertyRow({ property }: { property: AdminProperty }) {
  const t = useT();
  const isRent = property.operation === "alquiler";
  const formatted = formatPrice(property.price);
  return (
    <tr className="bg-white/55 transition hover:bg-white/85">
      <td className="rounded-l-xl px-3 py-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-12 w-16 shrink-0 rounded-md"
            style={{ backgroundImage: PLACEHOLDER_GRADIENT }}
          />
          <div>
            <p className="flex items-center gap-2 font-medium text-ink">
              {property.title}
              {property.featured && (
                <span className="rounded-md border border-gold/35 bg-gold/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gold-dark">
                  {t("adminProps.featured.badge")}
                </span>
              )}
            </p>
            <p className="text-[11px] text-ink/55">
              {t("agency.properties.ref", { ref: property.reference })}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-ink/75">{property.agencyName}</td>
      <td className="px-3 py-3 text-ink/75">{property.zone}</td>
      <td className="px-3 py-3">
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
      <td className="px-3 py-3 text-center text-[12px] text-ink/75">
        {property.bedrooms} / {property.bathrooms} / {property.squareMeters}
      </td>
      <td className="px-3 py-3 font-semibold text-ink">
        {formatted} €{isRent ? " /mes" : ""}
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-medium",
            STATUS_STYLES[property.status],
          )}
        >
          {t(`adminProps.status.${property.status}`)}
        </span>
      </td>
      <td className="px-3 py-3 text-[12px] text-ink/65">
        {property.publishedLabel}
      </td>
      <td className="rounded-r-xl px-3 py-3 text-right">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-cream-50 transition hover:bg-ink-soft"
        >
          <span>{t("clientes.table.viewDetails")}</span>
          <ArrowRight size={12} strokeWidth={1.75} className="text-gold" />
        </button>
      </td>
    </tr>
  );
}
