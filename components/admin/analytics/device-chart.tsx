"use client";

import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useThemed } from "@/components/admin/crm-theme";
import { DARK_CHART } from "@/lib/theme/crm-chart";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

interface DeviceChartProps {
  data: Array<{
    device: string;
    count: number;
    percentage: number;
  }>;
}

export function DeviceChart({ data }: DeviceChartProps) {
  const dark = useThemed(false, true);
  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="device"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ percent }: { percent?: number }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={dark ? DARK_CHART.sliceStroke : undefined} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={dark ? { backgroundColor: DARK_CHART.tooltipBg, border: `1px solid ${DARK_CHART.tooltipBorder}`, color: DARK_CHART.tooltipText } : undefined}
          itemStyle={dark ? { color: DARK_CHART.tooltipText } : undefined}
          formatter={(value, name, props) => {
            if (name === "count") {
              return [`${value} sesiones`, "Sesiones"];
            }
            return value;
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: dark ? DARK_CHART.legend : "#6b7280" }}
          verticalAlign="bottom"
          height={36}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
