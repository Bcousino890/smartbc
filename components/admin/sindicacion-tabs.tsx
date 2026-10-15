import Link from "next/link";
import { cn } from "@/lib/utils";

export type SindicacionTabId = "feeds" | "portales" | "particulares" | "salud";

export const SINDICACION_TABS: Array<{ id: SindicacionTabId; label: string; help: string; resource: "sindicacion" | "particulares" }> = [
  { id: "feeds", label: "Agencias (feeds)", help: "Webs de agencias colaboradoras sincronizadas con el CRM", resource: "sindicacion" },
  { id: "portales", label: "Portales inmobiliarios", help: "Idealista, Fotocasa, Pisos.com y Habitaclia: zonas, claves, presupuesto", resource: "particulares" },
  { id: "particulares", label: "Particulares", help: "Qué hace el crawler de particulares y dónde verlo", resource: "particulares" },
  { id: "salud", label: "Salud y actividad", help: "Semáforo, créditos y estadísticas de los scrapers", resource: "particulares" },
];

/** Pestañas por URL (?tab=…): cada una es un enlace, así sirven los botones atrás/adelante y los marcadores. */
export function SindicacionTabs({ active, allowed }: { active: SindicacionTabId; allowed: SindicacionTabId[] }) {
  return (
    <nav aria-label="Secciones de Sindicación" className="-mx-1 overflow-x-auto px-1">
      <ul role="tablist" className="inline-flex min-w-full gap-1 rounded-xl border border-ink/10 bg-white p-1">
        {SINDICACION_TABS.filter((t) => allowed.includes(t.id)).map((t) => (
          <li key={t.id} role="presentation">
            <Link
              role="tab"
              aria-selected={active === t.id}
              aria-current={active === t.id ? "page" : undefined}
              title={t.help}
              href={`?tab=${t.id}`}
              scroll={false}
              className={cn(
                "inline-flex h-10 items-center whitespace-nowrap rounded-lg px-4 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                active === t.id ? "bg-ink font-semibold text-cream-50" : "font-medium text-ink/70 hover:bg-ink/[0.04]",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
