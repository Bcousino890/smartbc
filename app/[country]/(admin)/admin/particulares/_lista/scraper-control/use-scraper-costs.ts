"use client";

import { useCallback, useEffect, useState } from "react";
import type { CostsPayload } from "@/lib/scrapers/cost-model";

const ENDPOINT = "/api/admin/particulares/scraper-control?costs=1";

/**
 * Gasto real medido por el crawler (últimos 7 días completos). Se lee al abrir el diálogo y se
 * refresca cada 5 minutos: son muchas filas y el crawler solo las recalcula cada hora, así que no
 * va en el sondeo de 30 s del estado.
 */
export function useScraperCosts(open: boolean) {
  const [costs, setCosts] = useState<CostsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "No tienes permiso para ver el gasto de créditos." : "No se pudo leer el gasto de créditos.");
      setCosts(((await res.json()) as { costs: CostsPayload }).costs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el gasto de créditos.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => void load(), 300_000);
    return () => clearInterval(t);
  }, [open, load]);

  return { costs, costsError: error, reloadCosts: load };
}
