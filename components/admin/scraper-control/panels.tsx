"use client";

import { Notice, BTN_SECONDARY } from "./shared";
import { StatusSection } from "./status-section";
import { BudgetSection, KeysSection, SwitchesSection } from "./settings-sections";
import { CostSection } from "./cost-section";
import { StatsSection } from "./stats-section";
import { ZonesSection } from "./zones-section";
import { useScraperControl } from "./use-scraper-control";
import { useScraperCosts } from "./use-scraper-costs";

/**
 * Paneles de la página unificada /admin/sindicacion. Son los MISMOS componentes
 * que antes vivían en el diálogo «Configuración de scrapers» de Particulares
 * (misma API, mismas tablas `scraper_settings` / `scraper_zones`); solo cambia
 * dónde se montan. Contrato: /opt/idealista-dev/CONTRATO-CONTROL.md
 */

function Loader({ children }: { children: (ctl: ReturnType<typeof useScraperControl>) => React.ReactNode }) {
  const ctl = useScraperControl(true);
  const { data, loading, error, reload } = ctl;
  if (loading && !data) {
    return (
      <p role="status" className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-ink/70">
        Cargando el estado de los scrapers…
      </p>
    );
  }
  if (error && !data) {
    return (
      <div className="space-y-3">
        <Notice tone="error">{error}</Notice>
        <button type="button" onClick={reload} className={BTN_SECONDARY}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="space-y-5">
      {!data.tablesReady && (
        <Notice tone="warn">
          La configuración de control todavía no está instalada en el servidor (se instala sola con la próxima versión). Mientras tanto no se puede cambiar nada desde aquí.
        </Notice>
      )}
      {!data.canEdit && <Notice tone="info">Tu usuario solo puede mirar esta configuración, no cambiarla.</Notice>}
      {error && <Notice tone="warn">{error} Se muestra lo último que se pudo leer.</Notice>}
      {children(ctl)}
    </div>
  );
}

/** Pestaña «Portales inmobiliarios»: interruptores, coste, zonas (con mapa), presupuesto y claves de Crawio. */
export function PortalesPanel() {
  const { costs, costsError } = useScraperCosts(true);
  return (
    <Loader>
      {({ data, save, patchLocal, reload }) =>
        data ? (
          <>
            <SwitchesSection data={data} save={save} />
            <CostSection data={data} costs={costs} error={costsError} />
            <ZonesSection data={data} save={save} patchLocal={patchLocal} reload={reload} costs={costs} />
            <BudgetSection data={data} save={save} />
            <KeysSection data={data} save={save} />
          </>
        ) : null
      }
    </Loader>
  );
}

/** Pestaña «Salud y actividad»: semáforo por portal, créditos del periodo, tareas y estadísticas diarias. */
export function SaludPanel() {
  return (
    <div className="space-y-5">
      <Loader>{({ data }) => (data ? <StatusSection data={data} /> : null)}</Loader>
      <StatsSection />
    </div>
  );
}
