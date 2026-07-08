// Paleta fija de colores para las etapas del pipeline. Tailwind solo genera
// las clases que aparecen literalmente en el código fuente en tiempo de
// build, así que un color arbitrario elegido en la UI (ej. un hex guardado
// en la base de datos) nunca tendría su clase compilada. Por eso el admin
// elige de esta paleta cerrada en vez de un color libre.
export type PipelineColorKey =
  | "slate"
  | "blue"
  | "orange"
  | "purple"
  | "amber"
  | "rose"
  | "emerald"
  | "cyan"
  | "red"
  | "violet"
  | "teal"
  | "pink";

export const PIPELINE_COLOR_KEYS: PipelineColorKey[] = [
  "slate", "blue", "orange", "purple", "amber", "rose",
  "emerald", "cyan", "red", "violet", "teal", "pink",
];

export const PIPELINE_COLORS: Record<PipelineColorKey, { badge: string; dot: string }> = {
  slate: { badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  blue: { badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  orange: { badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  purple: { badge: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  amber: { badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  rose: { badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  emerald: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  cyan: { badge: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  red: { badge: "bg-red-100 text-red-700", dot: "bg-red-400" },
  violet: { badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  teal: { badge: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
  pink: { badge: "bg-pink-100 text-pink-700", dot: "bg-pink-500" },
};

export function pipelineColor(colorKey: string): { badge: string; dot: string } {
  return PIPELINE_COLORS[colorKey as PipelineColorKey] || PIPELINE_COLORS.slate;
}
