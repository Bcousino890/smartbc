"use client";

import {
  Banknote,
  CalendarClock,
  Handshake,
  Percent,
  TrendingUp,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { StatCard } from "@/components/ui/stat-card";
import { formatPrice } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import {
  mockAgencyRanking,
  mockReportsStats,
  mockRevenueByMonth,
} from "@/lib/mock-admin-extras";
import type { AgencyRanking, RevenueMonth } from "@/lib/types";

export default function AdminReportesPage() {
  const t = useT();

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="reportes.title"
        subtitleKey="reportes.subtitle"
      />

      {/* KPIs */}
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote size={20} strokeWidth={1.75} />}
          labelKey="reportes.kpi.commissions"
          value={`${formatPrice(mockReportsStats.monthlyCommissionsEUR)} €`}
          helpKey="reportes.kpi.commissions.help"
        />
        <StatCard
          icon={<Handshake size={20} strokeWidth={1.75} />}
          labelKey="reportes.kpi.deals"
          value={mockReportsStats.monthlyClosedDeals}
          helpKey="reportes.kpi.deals.help"
        />
        <StatCard
          icon={<Percent size={20} strokeWidth={1.75} />}
          labelKey="reportes.kpi.conversion"
          value={`${mockReportsStats.conversionRatePct}%`}
          helpKey="reportes.kpi.conversion.help"
        />
        <StatCard
          icon={<CalendarClock size={20} strokeWidth={1.75} />}
          labelKey="reportes.kpi.daysToClose"
          value={mockReportsStats.averageDaysToClose}
          helpKey="reportes.kpi.daysToClose.help"
        />
      </div>

      {/* Two-column: revenue chart + ranking */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
        <RevenueChart months={mockRevenueByMonth} />
        <AgencyRankingBlock agencies={mockAgencyRanking} />
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}

function RevenueChart({ months }: { months: RevenueMonth[] }) {
  const t = useT();
  const max = Math.max(...months.map((m) => m.rentEUR + m.saleEUR));

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-ink">
            {t("reportes.revenue.title")}
          </h2>
          <p className="text-[12px] text-ink/55">
            {t("reportes.revenue.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink/65">
          <Legend color="bg-ink" labelKey="reportes.revenue.legend.sale" />
          <Legend color="bg-gold" labelKey="reportes.revenue.legend.rent" />
        </div>
      </header>

      <div className="mt-6 flex h-56 items-end gap-3">
        {months.map((m) => {
          const total = m.rentEUR + m.saleEUR;
          const totalH = (total / max) * 100;
          const saleH = (m.saleEUR / total) * totalH;
          const rentH = (m.rentEUR / total) * totalH;
          return (
            <div
              key={m.monthKey}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="relative flex h-full w-full items-end justify-center">
                <div className="flex w-7 flex-col-reverse overflow-hidden rounded-md md:w-10">
                  <div
                    className="bg-ink"
                    style={{ height: `${saleH}%` }}
                    title={`${t("reportes.revenue.legend.sale")}: ${formatPrice(m.saleEUR)} €`}
                  />
                  <div
                    className="bg-gold"
                    style={{ height: `${rentH}%` }}
                    title={`${t("reportes.revenue.legend.rent")}: ${formatPrice(m.rentEUR)} €`}
                  />
                </div>
              </div>
              <span className="text-[11px] text-ink/55">{t(m.monthKey)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ color, labelKey }: { color: string; labelKey: string }) {
  const t = useT();
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {t(labelKey)}
    </span>
  );
}

function AgencyRankingBlock({ agencies }: { agencies: AgencyRanking[] }) {
  const t = useT();
  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <header>
        <h2 className="font-serif text-xl font-semibold text-ink">
          {t("reportes.ranking.title")}
        </h2>
        <p className="text-[12px] text-ink/55">
          {t("reportes.ranking.subtitle")}
        </p>
      </header>

      <ol className="mt-5 space-y-3">
        {agencies.map((a, i) => (
          <li
            key={a.agencyId}
            className="flex items-center gap-3 rounded-xl border border-gold/15 bg-white/55 p-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 font-serif text-sm font-semibold text-gold-dark">
              {i + 1}
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-serif text-[10px] font-medium text-cream-50">
              {a.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{a.name}</p>
              <p className="text-[11px] text-ink/55">
                {t("reportes.ranking.deals", { count: a.closedDeals })}
              </p>
            </div>
            <p className="font-serif text-base font-semibold text-ink">
              {formatPrice(a.commissionsEUR)} €
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

