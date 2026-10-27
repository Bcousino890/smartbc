"use client";

import { useEffect, useState } from "react";
import { getZoneCatalog } from "@/app/(admin)/admin/clientes/actions";
import { MADRID_ZONES, MADRID_ZONES_WITH_SUBZONES } from "@/lib/mock-properties";
import type { ZoneCatalog } from "@/lib/clients/zone-catalog";

/**
 * Las ubicaciones del CRM, una sola fuente: las zonas y barrios reales de
 * propiedades, captaciones y particulares (lib/clients/zone-catalog.ts).
 * Mientras carga, o si falla, la lista base de Madrid.
 */
export function useZoneCatalog(country: "es" | "cl"): ZoneCatalog {
  const base: ZoneCatalog =
    country === "es"
      ? {
          zones: [...MADRID_ZONES],
          subzones: MADRID_ZONES_WITH_SUBZONES,
          groups: MADRID_ZONES.map((name) => ({
            name,
            total: 0,
            isMadrid: true,
            subs: (MADRID_ZONES_WITH_SUBZONES[name] ?? []).map((sb) => ({ name: sb, total: 0 })),
          })),
        }
      : { zones: [], subzones: {}, groups: [] };
  const [catalog, setCatalog] = useState<ZoneCatalog | null>(null);
  useEffect(() => {
    let alive = true;
    getZoneCatalog(country)
      .then((c) => alive && c && c.zones.length > 0 && setCatalog(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [country]);
  return catalog ?? base;
}
