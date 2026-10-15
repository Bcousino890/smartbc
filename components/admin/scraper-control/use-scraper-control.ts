"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScraperControlPayload, ScraperControlUpdate } from "@/lib/scrapers/control-types";

const ENDPOINT = "/api/admin/particulares/scraper-control";

/**
 * Estado del diálogo «Configuración de scrapers»: lee la API al abrirse, se
 * refresca solo cada 30 s (el semáforo depende de la edad del latido) y guarda
 * cambios sueltos. Mientras hay un guardado en curso no se pisa el estado local
 * con una lectura vieja.
 */
export function useScraperControl(open: boolean) {
  const [data, setData] = useState<ScraperControlPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "No tienes permiso para ver esta configuración." : "No se pudo leer el estado de los scrapers.");
      const json = (await res.json()) as ScraperControlPayload;
      if (saving.current === 0) setData(json);
      setError(null);
    } catch (e) {
      if (!silent || !data) setError(e instanceof Error ? e.message : "No se pudo leer el estado de los scrapers.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [open, load]);

  /** Guarda un cambio. Devuelve null si fue bien o el mensaje de error en español. */
  const save = useCallback(async (update: ScraperControlUpdate): Promise<string | null> => {
    saving.current += 1;
    try {
      const res = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return typeof json.error === "string" ? json.error : "No se pudo guardar.";
      saving.current -= 1;
      setData(json as ScraperControlPayload);
      saving.current += 1;
      return null;
    } catch {
      return "No se pudo guardar: comprueba la conexión.";
    } finally {
      saving.current -= 1;
    }
  }, []);

  /** Cambio local inmediato (la interfaz responde al instante; si falla se recarga). */
  const patchLocal = useCallback((fn: (d: ScraperControlPayload) => ScraperControlPayload) => {
    setData((d) => (d ? fn(d) : d));
  }, []);

  return { data, loading, error, reload: () => load(), save, patchLocal };
}
