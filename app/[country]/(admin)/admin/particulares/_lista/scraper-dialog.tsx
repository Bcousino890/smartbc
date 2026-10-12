"use client";

import { Modal } from "@/components/ui/modal";
import { BTN_SECONDARY, Notice } from "./scraper-control/shared";
import { StatusSection } from "./scraper-control/status-section";
import { BudgetSection, KeysSection, SwitchesSection } from "./scraper-control/settings-sections";
import { ZonesSection } from "./scraper-control/zones-section";
import { useScraperControl } from "./scraper-control/use-scraper-control";

/**
 * Configuración de scrapers (Idealista y Fotocasa) en un diálogo. Manda de
 * verdad sobre el crawler: lo que se guarda aquí va a las tablas
 * `scraper_settings` / `scraper_zones`, que el crawler lee en cada ronda.
 * Contrato: /opt/idealista-dev/CONTRATO-CONTROL.md
 */
export function ScraperDialog({ open, onClose }: { open: boolean; onClose: () => void; config?: unknown }) {
  const { data, loading, error, reload, save, patchLocal } = useScraperControl(open);

  return (
    <Modal open={open} onClose={onClose} title="Configuración de scrapers" subtitle="Qué se escanea y cuánto" size="3xl">
      {loading && !data ? (
        <p role="status" className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-ink/70">
          Cargando el estado de los scrapers…
        </p>
      ) : error && !data ? (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <button type="button" onClick={reload} className={BTN_SECONDARY}>
            Reintentar
          </button>
        </div>
      ) : data ? (
        <div className="space-y-5">
          {!data.tablesReady && (
            <Notice tone="warn">
              La configuración de control todavía no está instalada en el servidor (se instala sola con la próxima versión). Mientras tanto no se puede cambiar nada desde aquí.
            </Notice>
          )}
          {!data.canEdit && <Notice tone="info">Tu usuario solo puede mirar esta configuración, no cambiarla.</Notice>}
          {error && <Notice tone="warn">{error} Se muestra lo último que se pudo leer.</Notice>}
          <StatusSection data={data} />
          <SwitchesSection data={data} save={save} />
          <ZonesSection data={data} save={save} patchLocal={patchLocal} reload={reload} />
          <BudgetSection data={data} save={save} />
          <KeysSection data={data} save={save} />
        </div>
      ) : null}
    </Modal>
  );
}
