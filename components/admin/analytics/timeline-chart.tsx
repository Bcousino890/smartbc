"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useThemed } from "@/components/admin/crm-theme";
import { DARK_CHART } from "@/lib/theme/crm-chart";

const LIGHT_CHROME = { grid: "#e5e7eb", axis: "#6b7280", tooltipBg: "#ffffff", tooltipBorder: "#e5e7eb", tooltipText: undefined as string | undefined, legend: "#6b7280" };

interface TimelineChartProps {
  data: Array<{
    date: string;
    sessions: number;
    pageViews: number;
  }>;
}

export function TimelineChart({ data }: TimelineChartProps) {
  const c = useThemed(LIGHT_CHROME, DARK_CHART);
  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    ...item,
    date: new Date(item.date).toLocaleDateString("es-ES", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis dataKey="date" stroke={c.axis} fontSize={12} />
        <YAxis stroke={c.axis} fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: c.tooltipBg,
            border: `1px solid ${c.tooltipBorder}`,
            borderRadius: "0.5rem",
            color: c.tooltipText,
          }}
          formatter={(value: any) => Number(value).toLocaleString()}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: c.legend }}
          iconType="line"
        />
        <Line
          type="monotone"
          dataKey="sessions"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: "#3b82f6", r: 4 }}
          activeDot={{ r: 6 }}
          name="Sesiones"
        />
        <Line
          type="monotone"
          dataKey="pageViews"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: "#10b981", r: 4 }}
          activeDot={{ r: 6 }}
          name="Vistas"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
