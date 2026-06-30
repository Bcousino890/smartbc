"use client";

import { useState } from "react";
import { KPICards } from "./kpi-cards";
import { TopPropertiesTable } from "./top-properties-table";
import { TimelineChart } from "./timeline-chart";
import { DeviceChart } from "./device-chart";
import { GeoChart } from "./geo-chart";
import { RecentSessionsTable } from "./recent-sessions-table";
import { FilterBar } from "./filter-bar";
import type { AnalyticsSummary, PageViewRow } from "@/lib/db/queries/analytics";

interface AnalyticsDashboardProps {
  data: {
    summary: AnalyticsSummary;
    topProperties: Array<{
      propertyId: string;
      totalSessions: number;
      lastViewedAt: string;
    }>;
    recentSessions: Array<
      PageViewRow & {
        eventsCount: number;
      }
    >;
    timeline: Array<{
      date: string;
      sessions: number;
      pageViews: number;
    }>;
    devices: Array<{
      device: string;
      count: number;
      percentage: number;
    }>;
    geo: Array<{
      country: string;
      countryCode: string;
      count: number;
    }>;
  };
  filters: {
    startDate: string;
    endDate: string;
    propertyId?: string;
  };
  period: string;
}

export function AnalyticsDashboard({
  data,
  filters,
  period,
}: AnalyticsDashboardProps) {
  return (
    <div className="space-y-8 p-8 bg-gray-50 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Analytics de Smart Links
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Métricas y estadísticas de la web pública
        </p>
      </div>

      <FilterBar period={period} propertyId={filters.propertyId} />

      <KPICards summary={data.summary} />

      <div className="space-y-8">
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Propiedades más vistas
          </h2>
          <TopPropertiesTable properties={data.topProperties} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Vistas por día
            </h2>
            <TimelineChart data={data.timeline} />
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Distribución de dispositivos
            </h2>
            <DeviceChart data={data.devices} />
          </section>
        </div>

        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Geografía
          </h2>
          <GeoChart data={data.geo} />
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Últimas sesiones
          </h2>
          <RecentSessionsTable sessions={data.recentSessions} />
        </section>
      </div>
    </div>
  );
}
