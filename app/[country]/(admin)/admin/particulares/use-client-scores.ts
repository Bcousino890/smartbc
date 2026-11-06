"use client";

import { useEffect, useMemo, useState } from "react";
import type { PickedClient } from "@/components/admin/captaciones-map/client-picker";
import { buildScoreMap } from "@/lib/captaciones-map/scores";
import type { SuggestedParticular } from "@/lib/db/queries/suggested-particulares";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable"; reason: string }
  | { status: "ok"; summary: string | null; suggestions: SuggestedParticular[] };

/**
 * Puntuación de encaje de los anuncios con el encargo del cliente elegido, para
 * la cuadrícula y la lista (el Mapa tiene su propio cruce, más completo). Usa el
 * mismo endpoint que el mapa, así que las cifras coinciden entre vistas.
 *
 * `enabled=false` (vista Mapa, o un encargo en pausa/cerrado, que no hace matching) no pide nada.
 */
export function useClientScores(client: PickedClient | null, enabled: boolean, encargoId = "") {
  const [state, setState] = useState<State>({ status: "idle" });
  const clientId = client?.id ?? null;

  useEffect(() => {
    if (!clientId || !enabled) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    // `encargo`: el elegido en la barra (sin él, el principal). El endpoint filtra por cliente Y encargo.
    const enc = encargoId ? `&encargo=${encodeURIComponent(encargoId)}` : "";
    fetch(`/api/admin/clientes/${encodeURIComponent(clientId)}/suggested-particulares?limit=1000${enc}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as {
          suggestions?: SuggestedParticular[];
          reason?: string;
          brief?: { summary?: string | null };
        };
        if (j.reason) setState({ status: "unavailable", reason: j.reason });
        else setState({ status: "ok", summary: j.brief?.summary ?? null, suggestions: j.suggestions ?? [] });
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [clientId, enabled, encargoId]);

  const scores = useMemo(
    () => (state.status === "ok" ? buildScoreMap(state.suggestions) : new Map<string, number>()),
    [state],
  );

  const subtitle =
    state.status === "loading"
      ? "Cargando encargo…"
      : state.status === "ok"
        ? (state.summary ?? "Encargo sin resumen")
        : state.status === "unavailable"
          ? state.reason === "no_preferences"
            ? "Este cliente aún no tiene encargo"
            : state.reason === "insufficient_brief"
              ? "Completa el encargo para puntuar"
              : "Cliente de fuera de España"
          : state.status === "error"
            ? "No se pudo cargar el encargo"
            : undefined;

  return { scores, hasScores: state.status === "ok", loading: state.status === "loading", subtitle };
}
