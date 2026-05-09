"use client";

import { LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";
import { PropertyCard } from "@/components/property-card";
import { PropertyFilters } from "@/components/property-filters";
import { SectionHeader } from "@/components/section-header";
import { PageFooter } from "@/components/ui/page-footer";
import { useT } from "@/lib/i18n/provider";
import { mockProperties } from "@/lib/mock-properties";
import type { Filters, Property } from "@/lib/types";
import { cn } from "@/lib/utils";

type View = "grid" | "list";

export default function PropiedadesPage() {
  const t = useT();
  const [filters, setFilters] = useState<Filters>({
    stayType: "corta",
    operation: "alquiler",
  });
  const [view, setView] = useState<View>("grid");

  const properties = useMemo(
    () => filterProperties(mockProperties, filters),
    [filters],
  );

  const resultsKey =
    properties.length === 0
      ? "propiedades.results.0"
      : properties.length === 1
        ? "propiedades.results.1"
        : "propiedades.results.n";

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 md:px-8">
      <SectionHeader
        titleKey="propiedades.title"
        subtitleKey="propiedades.subtitle"
      />

      <div className="mt-8">
        <PropertyFilters initial={filters} onApply={setFilters} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-gold-dark">
          {t(resultsKey, { count: properties.length })}
        </p>
        <div className="flex items-center rounded-lg border border-gold/20 bg-cream-50/70 p-1">
          <ViewButton
            active={view === "grid"}
            onClick={() => setView("grid")}
            label={t("propiedades.view.grid")}
          >
            <LayoutGrid size={16} strokeWidth={1.75} />
          </ViewButton>
          <ViewButton
            active={view === "list"}
            onClick={() => setView("list")}
            label={t("propiedades.view.list")}
          >
            <List size={16} strokeWidth={1.75} />
          </ViewButton>
        </div>
      </div>

      <div className="mt-4">
        {properties.length === 0 ? (
          <EmptyState />
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {properties.map((p) =>
              p.description ? (
                <div key={p.id} className="md:col-span-2">
                  <PropertyCard property={p} variant="list" />
                </div>
              ) : (
                <PropertyCard key={p.id} property={p} variant="grid" />
              ),
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} variant="list" />
            ))}
          </div>
        )}
      </div>

      <PageFooter textKey="login.footer" />
    </div>
  );
}

function filterProperties(list: Property[], filters: Filters) {
  return list.filter((p) => {
    if (filters.bedrooms && p.bedrooms < filters.bedrooms) return false;
    if (filters.bathrooms && p.bathrooms < filters.bathrooms) return false;
    if (filters.minSquareMeters && p.squareMeters < filters.minSquareMeters)
      return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    if (filters.zone && p.zone !== filters.zone) return false;
    if (filters.stayType && p.stayType !== filters.stayType) return false;
    if (filters.operation && p.operation !== filters.operation) return false;
    return true;
  });
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition",
        active ? "bg-ink text-gold" : "text-ink/55 hover:bg-white/60 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="rounded-2xl border border-gold/25 bg-cream-50/70 p-12 text-center backdrop-blur-sm">
      <p className="font-serif text-lg text-ink">
        {t("propiedades.empty.title")}
      </p>
      <p className="mt-2 text-sm text-ink/60">{t("propiedades.empty.text")}</p>
    </div>
  );
}

