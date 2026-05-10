"use client";

import { Building2, Home, Tag } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import type { AgencyDetail } from "@/lib/types";

export function AgencyStatsGrid({ agency }: { agency: AgencyDetail }) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        labelKey="agency.stats.rentCommission"
        helpKey="agency.stats.rentCommission.help"
        value={`${agency.rentCommissionPct}%`}
        rightSlot={<Donut percent={agency.rentCommissionPct} />}
        footer={
          <CommissionMinPrice
            initialValue={agency.rentCommissionMinPrice}
            operation="alquiler"
          />
        }
      />
      <StatCard
        labelKey="agency.stats.saleCommission"
        helpKey="agency.stats.saleCommission.help"
        value={`${agency.saleCommissionPct}%`}
        rightSlot={<Donut percent={agency.saleCommissionPct} />}
        footer={
          <CommissionMinPrice
            initialValue={agency.saleCommissionMinPrice}
            operation="venta"
          />
        }
      />
      <StatCard
        labelKey="agency.stats.rentCount"
        helpKey="agency.stats.availableNow"
        value={agency.rentCount}
        rightSlot={
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Home size={20} strokeWidth={1.75} />
          </span>
        }
      />
      <StatCard
        labelKey="agency.stats.saleCount"
        helpKey="agency.stats.availableNow"
        value={agency.saleCount}
        rightSlot={
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Tag size={19} strokeWidth={1.75} />
          </span>
        }
      />
      <StatCard
        labelKey="agency.stats.totalCount"
        helpKey="agency.stats.availableNow"
        value={agency.rentCount + agency.saleCount}
        rightSlot={
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Building2 size={20} strokeWidth={1.75} />
          </span>
        }
      />
    </section>
  );
}

const RENT_THRESHOLDS = [0, 1000, 1500, 1800, 2200, 2500, 3000, 3500, 4000];
const SALE_THRESHOLDS = [
  0,
  200000,
  300000,
  350000,
  450000,
  500000,
  600000,
  750000,
  1000000,
];

function CommissionMinPrice({
  initialValue,
  operation,
}: {
  initialValue: number;
  operation: "alquiler" | "venta";
}) {
  const t = useT();
  const [value, setValue] = useState<number>(initialValue);
  const options =
    operation === "alquiler" ? RENT_THRESHOLDS : SALE_THRESHOLDS;

  // Make sure the agency's stored value is always picked from the dropdown.
  const allOptions = options.includes(value) ? options : [...options, value];
  allOptions.sort((a, b) => a - b);

  const formatLabel = (v: number) => {
    if (v <= 0) return t("agency.stats.minPrice.notSet");
    const base = t("agency.stats.minPrice", { price: formatPrice(v) });
    return operation === "alquiler"
      ? `${base}${t("agency.stats.minPrice.rentSuffix")}`
      : base;
  };

  return (
    <select
      value={value}
      onChange={(e) => setValue(Number(e.target.value))}
      className="w-full appearance-none rounded-lg border border-gold/25 bg-white/70 px-2.5 py-1.5 text-[11px] font-medium text-ink/75 focus:border-gold/55 focus:outline-none"
    >
      {allOptions.map((v) => (
        <option key={v} value={v}>
          {formatLabel(v)}
        </option>
      ))}
    </select>
  );
}

function Donut({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <svg
      viewBox="0 0 36 36"
      className="h-14 w-14 shrink-0"
      aria-hidden="true"
    >
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-gold/15"
      />
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={`${safe} ${100 - safe}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        className="text-gold"
      />
    </svg>
  );
}
