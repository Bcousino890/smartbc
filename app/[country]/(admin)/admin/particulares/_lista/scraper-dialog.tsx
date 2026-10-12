"use client";

import { Modal } from "@/components/ui/modal";
import type { IdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import { ScraperStatusPanel } from "../scraper/scraper-status-panel";
import { ScraperConfigForm } from "../scraper/scraper-config-form";
import { FotocasaZonesPanel } from "../fotocasa-zones-section";

/** Configuración de scrapers (Idealista y Fotocasa) en un diálogo, fuera de la lista. */
export function ScraperDialog({ open, onClose, config }: { open: boolean; onClose: () => void; config: IdealistaScraperConfig }) {
  return (
    <Modal open={open} onClose={onClose} title="Configuración de scrapers" subtitle="Qué se recorre y cada cuánto" size="3xl">
      <h3 className="text-base font-bold text-ink">Idealista</h3>
      <div className="mt-3 space-y-8">
        <section>
          <h4 className="mb-3 text-sm font-bold text-ink/80">Estado</h4>
          <ScraperStatusPanel />
        </section>
        <section>
          <h4 className="text-sm font-bold text-ink/80">Configuración</h4>
          <ScraperConfigForm initial={config} />
        </section>
      </div>
      <div className="mt-10 border-t border-ink/10 pt-6">
        <h3 className="text-base font-bold text-ink">Fotocasa</h3>
        <p className="mb-4 mt-1 max-w-3xl text-xs text-ink/65">
          Fotocasa no se recorre de una vez: su buscador no deja paginar hasta el final. Se va zona por zona, y así cada búsqueda se agota al 100 %.
        </p>
        <FotocasaZonesPanel />
      </div>
    </Modal>
  );
}
