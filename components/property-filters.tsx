"use client";

import {
  Bath,
  Bed,
  Calendar,
  Euro,
  MapPin,
  Maximize2,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { MADRID_ZONES } from "@/lib/mock-properties";
import type { Filters, Operation, StayType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  initial?: Filters;
  onApply: (filters: Filters) => void;
};

export function PropertyFilters({ initial, onApply }: Props) {
  const t = useT();
  const [bedrooms, setBedrooms] = useState<string>(
    initial?.bedrooms ? String(initial.bedrooms) : "",
  );
  const [entryDate, setEntryDate] = useState<string>(initial?.entryDate ?? "");
  const [stayType, setStayType] = useState<StayType>(
    initial?.stayType ?? "corta",
  );
  const [maxPrice, setMaxPrice] = useState<string>(
    initial?.maxPrice ? String(initial.maxPrice) : "",
  );
  const [bathrooms, setBathrooms] = useState<string>(
    initial?.bathrooms ? String(initial.bathrooms) : "",
  );
  const [minSquareMeters, setMinSquareMeters] = useState<string>(
    initial?.minSquareMeters ? String(initial.minSquareMeters) : "",
  );
  const [zone, setZone] = useState<string>(initial?.zone ?? "");
  const [operation, setOperation] = useState<Operation>(
    initial?.operation ?? "alquiler",
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onApply({
      bedrooms: bedrooms ? Number(bedrooms) : undefined,
      entryDate: entryDate || undefined,
      stayType,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      bathrooms: bathrooms ? Number(bathrooms) : undefined,
      minSquareMeters: minSquareMeters ? Number(minSquareMeters) : undefined,
      zone: zone || undefined,
      operation,
    });
  }

  const minOption = (n: number) => t("filters.bedrooms.min", { n });
  const areaOption = (n: number) => t("filters.area.min", { n });
  const priceOption = (price: number) =>
    t("filters.price.upTo", { price: formatPrice(price) });

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gold/25 bg-cream-50/85 p-5 shadow-[0_20px_60px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-6"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <FieldGroup
          label={t("filters.bedrooms")}
          icon={<Bed size={16} strokeWidth={1.5} />}
        >
          <SelectInput
            value={bedrooms}
            onChange={setBedrooms}
            placeholder={t("common.any")}
            options={[
              { value: "", label: t("common.any") },
              { value: "1", label: minOption(1) },
              { value: "2", label: minOption(2) },
              { value: "3", label: minOption(3) },
              { value: "4", label: minOption(4) },
            ]}
          />
        </FieldGroup>

        <FieldGroup
          label={t("filters.entryDate")}
          icon={<Calendar size={16} strokeWidth={1.5} />}
        >
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full bg-transparent py-2.5 pr-3 text-sm text-ink placeholder:text-ink/40 focus:outline-none"
            placeholder={t("filters.entryDate.placeholder")}
          />
        </FieldGroup>

        <FieldGroup label={t("filters.stay")}>
          <Toggle
            value={stayType}
            onChange={(v) => setStayType(v as StayType)}
            options={[
              { value: "corta", label: t("filters.stay.short") },
              { value: "larga", label: t("filters.stay.long") },
            ]}
          />
        </FieldGroup>

        <FieldGroup
          label={t("filters.price")}
          icon={<Euro size={16} strokeWidth={1.5} />}
        >
          <SelectInput
            value={maxPrice}
            onChange={setMaxPrice}
            placeholder={t("common.any")}
            options={[
              { value: "", label: t("common.any") },
              { value: "2000", label: priceOption(2000) },
              { value: "3500", label: priceOption(3500) },
              { value: "5000", label: priceOption(5000) },
              { value: "8000", label: priceOption(8000) },
            ]}
          />
        </FieldGroup>

        <FieldGroup
          label={t("filters.bathrooms")}
          icon={<Bath size={16} strokeWidth={1.5} />}
        >
          <SelectInput
            value={bathrooms}
            onChange={setBathrooms}
            placeholder={t("common.any")}
            options={[
              { value: "", label: t("common.any") },
              { value: "1", label: minOption(1) },
              { value: "2", label: minOption(2) },
              { value: "3", label: minOption(3) },
            ]}
          />
        </FieldGroup>

        <FieldGroup
          label={t("filters.area")}
          icon={<Maximize2 size={16} strokeWidth={1.5} />}
        >
          <SelectInput
            value={minSquareMeters}
            onChange={setMinSquareMeters}
            placeholder={t("common.any")}
            options={[
              { value: "", label: t("common.any") },
              { value: "60", label: areaOption(60) },
              { value: "100", label: areaOption(100) },
              { value: "150", label: areaOption(150) },
              { value: "200", label: areaOption(200) },
            ]}
          />
        </FieldGroup>

        <FieldGroup
          label={t("filters.zone")}
          icon={<MapPin size={16} strokeWidth={1.5} />}
        >
          <SelectInput
            value={zone}
            onChange={setZone}
            placeholder={t("filters.zone.all")}
            options={[
              { value: "", label: t("filters.zone.all") },
              ...MADRID_ZONES.map((z) => ({ value: z, label: z })),
            ]}
          />
        </FieldGroup>

        <FieldGroup label={t("filters.operation")}>
          <Toggle
            value={operation}
            onChange={(v) => setOperation(v as Operation)}
            options={[
              { value: "alquiler", label: t("filters.operation.rent") },
              { value: "venta", label: t("filters.operation.sale") },
            ]}
          />
        </FieldGroup>
      </div>

      <div className="mt-5 flex justify-center">
        <button
          type="submit"
          className="flex w-full max-w-md items-center justify-center gap-2.5 rounded-xl bg-ink py-3 text-sm font-medium text-cream-50 transition hover:bg-ink-soft"
        >
          <SlidersHorizontal size={16} strokeWidth={1.75} />
          <span>{t("common.applyFilters")}</span>
        </button>
      </div>
    </form>
  );
}

function FieldGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-ink/65">{label}</label>
      <div className="flex items-center rounded-lg border border-gold/25 bg-white/70 transition focus-within:border-gold/55">
        {icon ? (
          <span className="pl-3 pr-2 text-ink/45">{icon}</span>
        ) : (
          <span className="pl-1" />
        )}
        {children}
      </div>
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none bg-transparent py-2.5 pr-3 text-sm text-ink focus:outline-none"
    >
      <option value="" disabled hidden>
        {placeholder}
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex w-full gap-1 p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
              active
                ? "bg-ink text-cream-50 shadow-sm"
                : "text-ink/60 hover:bg-white/60 hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
