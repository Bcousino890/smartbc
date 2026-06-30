"use client";

import type { AnalyticsSummary } from "@/lib/db/queries/analytics";

interface KPICardsProps {
  summary: AnalyticsSummary;
}

export function KPICards({ summary }: KPICardsProps) {
  const conversionRate =
    summary.totalSessions > 0
      ? (
          ((summary.sessionsWithVisitRequest ?? 0) / summary.totalSessions) *
          100
        ).toFixed(1)
      : "0.0";

  const avgTimeMinutes =
    summary.avgTimeSeconds !== null
      ? (summary.avgTimeSeconds / 60).toFixed(1)
      : "0.0";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        title="Sesiones"
        value={summary.totalSessions.toLocaleString()}
        description="Sesiones únicas"
      />
      <Card
        title="Vistas totales"
        value={summary.totalPageViews.toLocaleString()}
        description="Page views"
      />
      <Card
        title="Tasa de conversión"
        value={`${conversionRate}%`}
        description="Solicitudes de visita / sesiones"
      />
      <Card
        title="Tiempo promedio"
        value={`${avgTimeMinutes}m`}
        description="Tiempo en página"
      />
    </div>
  );
}

interface CardProps {
  title: string;
  value: string | number;
  description?: string;
}

function Card({ title, value, description }: CardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
        {title}
      </p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  );
}
