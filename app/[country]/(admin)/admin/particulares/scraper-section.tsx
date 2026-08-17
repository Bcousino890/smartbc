"use client";

import { useState } from "react";
import { ChevronDown, Radar } from "lucide-react";
import type { IdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import { ScraperStatusPanel } from "./scraper/scraper-status-panel";
import { ScraperConfigForm } from "./scraper/scraper-config-form";
import { FotocasaZonesPanel } from "./fotocasa-zones-section";

// Antes vivía en su propia página (/admin/particulares/scraper), pero es un
// detalle técnico de los scrapers que alimentan esta lista, no una sección
// aparte del menú — se pliega aquí, cerrado por defecto.
//
// Es el único sitio donde se configuran los scrapers: Idealista (estado y
// frecuencias del proveedor externo) y Fotocasa (las zonas de Madrid que se
// recorren enteras). Tenerlos separados obligaba a buscar en dos lados.
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
          Configuración de scrapers
        </span>
        <ChevronDown
          size={16}
          className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-ink/10 px-4 py-5">
          <h3 className="font-serif text-base font-semibold text-ink">Idealista</h3>
          <div className="mt-3 space-y-8">
            <section>
              <h4 className="mb-3 font-serif text-sm font-semibold text-ink/80">Estado</h4>
              <ScraperStatusPanel />
            </section>
            <section>
              <h4 className="font-serif text-sm font-semibold text-ink/80">Configuración</h4>
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

          <div className="mt-10 border-t border-ink/10 pt-6">
            <h3 className="font-serif text-base font-semibold text-ink">Fotocasa</h3>
            <p className="mb-4 mt-1 max-w-3xl text-xs text-ink/55">
              Fotocasa no se recorre de una vez: su buscador no deja paginar hasta el final, así que
              &quot;todo Madrid&quot; nunca llega a cubrirse entero. Se va zona por zona, y así cada
              búsqueda sí se agota al 100%.
            </p>
            <FotocasaZonesPanel />
          </div>
        </div>
      )}
    </div>
  );
}
