// Colores de los gráficos (recharts) en la apariencia oscura del CRM
// (expediente docs/changes/2026-10-23-crm-apariencia). Las series conservan
// sus colores; solo cambian rejilla, ejes y tooltip para leerse sobre carbón.
// En claro cada gráfico sigue usando sus colores de siempre (useThemed).
export const DARK_CHART = {
  grid: "rgba(236, 230, 220, 0.12)",
  axis: "rgba(236, 230, 220, 0.62)",
  tooltipBg: "#2b2824",
  tooltipBorder: "rgba(236, 230, 220, 0.16)",
  tooltipText: "#ece6dc",
  legend: "#a39b8f",
  sliceStroke: "#24211d",
  gold: "#c9a96e",
} as const;
