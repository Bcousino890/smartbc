"use client";

import { createContext, useContext, useMemo } from "react";
import { rollupZoneCosts, type CostsPayload, type ZoneCost } from "@/lib/scrapers/cost-model";
import type { ScraperPortal, ScraperZone } from "@/lib/scrapers/control-types";

/**
 * Coste real de cada zona (medido + proyección) para quien lo pinte: lista de zonas y mapa.
 * `status`:
 *   'sin-libro'  el crawler aún no ha publicado gasto medido (nada que enseñar salvo la cota baja de solo listado)
 *   'medido'     la zona (o sus subzonas) tiene gasto medido
 *   'sin-gasto'  hay gasto medido en el portal pero ninguno atribuido a esta zona
 */
export type ZoneCostInfo = { status: "sin-libro" | "medido" | "sin-gasto"; cost: ZoneCost | null; provisional: boolean; days: number };

type Ctx = { of: (z: ScraperZone) => ZoneCostInfo };
const NONE: Ctx = { of: () => ({ status: "sin-libro", cost: null, provisional: false, days: 0 }) };
const ZoneCostContext = createContext<Ctx>(NONE);

export const useZoneCost = (z: ScraperZone): ZoneCostInfo => useContext(ZoneCostContext).of(z);

export function ZoneCostProvider({ portal, zones, costs, children }: { portal: ScraperPortal; zones: ScraperZone[]; costs: CostsPayload | null; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => {
    const pc = costs?.hasData ? costs.portals[portal] : null;
    const map = rollupZoneCosts(zones, pc, costs?.projectionDays ?? 0);
    const provisional = !!costs?.provisional;
    const days = costs?.projectionDays ?? 0;   // días CUBIERTOS por el libro (un medio día cuenta medio)
    return {
      of: (z) => {
        if (!costs?.hasData || !pc) return { status: "sin-libro", cost: null, provisional, days };
        const c = map.get(z.zone_key);
        return c && c.total > 0 ? { status: "medido", cost: c, provisional, days } : { status: "sin-gasto", cost: null, provisional, days };
      },
    };
  }, [portal, zones, costs]);
  return <ZoneCostContext.Provider value={value}>{children}</ZoneCostContext.Provider>;
}
