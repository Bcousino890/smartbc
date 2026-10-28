"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientContext, getParticularesFlowStates, type ClientContext, type FlowState } from "./client-flow-actions";

/** Encargo, enlaces y book del cliente elegido (se vuelve a pedir con `refresh`). */
export function useClientContext(clientId: string) {
  const [context, setContext] = useState<ClientContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!clientId) {
      setContext(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getClientContext(clientId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setContext(res.context);
          setError(null);
        } else {
          setContext(null);
          setError(res.error);
        }
      })
      .catch(() => !cancelled && setError("No se pudo cargar el cliente."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clientId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { context, loading, error, refresh };
}

const POLL_MS = 6000;
const MAX_POLLS = 25;

/**
 * Dónde está cada anuncio visible respecto a la ficha del cliente (en su lista,
 * ficha creada, en su book). Mientras alguno siga «pending» (la ficha se crea en
 * segundo plano) se vuelve a mirar cada pocos segundos, con tope.
 */
export function useFlowStates(clientId: string, ids: string[]) {
  const [states, setStates] = useState<Record<string, FlowState>>({});
  const [tick, setTick] = useState(0);
  const polls = useRef(0);
  const key = ids.join(",");

  useEffect(() => {
    polls.current = 0;
  }, [clientId, key]);

  useEffect(() => {
    if (!clientId || ids.length === 0) {
      setStates({});
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    getParticularesFlowStates(clientId, ids.slice(0, 300))
      .then((res) => {
        if (cancelled || !res.ok) return;
        setStates(res.states);
        if (Object.values(res.states).includes("pending") && polls.current < MAX_POLLS) {
          polls.current += 1;
          timer = setTimeout(() => setTick((t) => t + 1), POLL_MS);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `key` resume la lista de ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, key, tick]);

  /** Vuelve a mirar ya (tras captar). */
  const refresh = useCallback(() => {
    polls.current = 0;
    setTick((t) => t + 1);
  }, []);
  return { states, refresh };
}
