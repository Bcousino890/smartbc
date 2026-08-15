"use client";

import { useState } from "react";
import { ChevronDown, Radar } from "lucide-react";
import type { IdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import { ScraperStatusPanel } from "./scraper/scraper-status-panel";
import { ScraperConfigForm } from "./scraper/scraper-config-form";

// Antes vivía en su propia página (/admin/particulares/scraper), pero es un
// detalle técnico del scraper que alimenta esta lista, no una sección
// aparte del menú — se pliega aquí, cerrado por defecto.
export function ParticularesScraperSection({ config }: { config: IdealistaScraperConfig }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-2xl border border-ink/10 bg-cream-50/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-ink/70">
          <Radar size={15} className="text-ink/45" />
          Configuración scraper Idealista
        </span>
        <ChevronDown
          size={16}
          className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-8 border-t border-ink/10 px-4 py-5">
          <section>
            <h3 className="mb-3 font-serif text-base font-semibold text-ink">Estado</h3>
            <ScraperStatusPanel />
          </section>
          <section>
            <h3 className="font-serif text-base font-semibold text-ink">Configuración</h3>
            <p className="mb-4 mt-1 max-w-3xl text-xs text-ink/55">
              Estos valores no están escritos en el código del scraper: el proveedor los lee en{" "}
              <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[11px]">
                GET /api/v1/idealista/config
              </code>{" "}
              y los aplica en su siguiente consulta.
            </p>
            <ScraperConfigForm initial={config} />
          </section>
        </div>
      )}
    </div>
  );
}
