"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./controls";
import { BTN_SECONDARY, Notice } from "./scraper-control/shared";
import { StatusSection } from "./scraper-control/status-section";
import { BudgetSection, KeysSection, SwitchesSection } from "./scraper-control/settings-sections";
import { StatsSection } from "./scraper-control/stats-section";
import { ZonesSection } from "./scraper-control/zones-section";
import { useScraperControl } from "./scraper-control/use-scraper-control";

type Tab = "config" | "stats";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "config", label: "Configuración" },
  { id: "stats", label: "Estadísticas" },
];

/**
 * Configuración de scrapers (Idealista y Fotocasa) en un diálogo. Manda de
 * verdad sobre el crawler: lo que se guarda aquí va a las tablas
 * `scraper_settings` / `scraper_zones`, que el crawler lee en cada ronda.
 * La pestaña «Estadísticas» lee `scraper_stats_daily`, que rellena el crawler.
 * Contrato: /opt/idealista-dev/CONTRATO-CONTROL.md
 */
export function ScraperDialog({ open, onClose }: { open: boolean; onClose: () => void; config?: unknown }) {
  const { data, loading, error, reload, save, patchLocal } = useScraperControl(open);
  const [tab, setTab] = useState<Tab>("config");
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + TABS.length) % TABS.length;
    setTab(TABS[n].id);
    refs.current[n]?.focus();
  };

  return (
    <Modal open={open} onClose={onClose} title="Configuración de scrapers" subtitle="Qué se escanea y cuánto" size="3xl">
      <div role="tablist" aria-label="Secciones" className="mb-4 inline-flex h-11 rounded-xl border border-ink/10 bg-white p-0.5">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`scr-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`scr-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn("rounded-[10px] px-5 text-sm transition", tab === t.id ? "bg-ink font-semibold text-cream-50" : "font-medium text-ink/70 hover:bg-ink/[0.04]", FOCUS_RING)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stats" ? (
        <div role="tabpanel" id="scr-panel-stats" aria-labelledby="scr-tab-stats">
          <StatsSection />
        </div>
      ) : (
        <div role="tabpanel" id="scr-panel-config" aria-labelledby="scr-tab-config">
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
        </div>
      )}
    </Modal>
  );
}
