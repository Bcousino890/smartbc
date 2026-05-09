"use client";

import { Building2, Home, Tag } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { AgencyDetail } from "@/lib/types";

export function AgencyStatsGrid({ agency }: { agency: AgencyDetail }) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        labelKey="agency.stats.rentCommission"
        helpKey="agency.stats.rentCommission.help"
        value={`${agency.rentCommissionPct}%`}
        rightSlot={<Donut percent={agency.rentCommissionPct} />}
      />
      <StatCard
        labelKey="agency.stats.saleCommission"
        helpKey="agency.stats.saleCommission.help"
        value={`${agency.saleCommissionPct}%`}
        rightSlot={<Donut percent={agency.saleCommissionPct} />}
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
