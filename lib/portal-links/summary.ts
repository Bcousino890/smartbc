// ============================================================================
// Resumen de los enlaces de portales de un cliente.
//
// Lo comparten la ficha (tarjeta de Resumen) y la lista de clientes (columna
// "Anuncios"): las dos tienen que contar lo mismo con las mismas reglas, o la
// lista diría "3 por llamar" y la ficha "2".
//
// PURO: `now` entra por parámetro. Se calcula en el servidor y se pasa ya
// hecho, para que "nuevo" no dependa del reloj del navegador (y no haya
// diferencias de hidratación justo en el borde de las 48 h).
// ============================================================================

import { isPendingCall, type PortalLinkStatus } from "./types";

/** Cuánto tiempo un anuncio recién llegado se marca como "nuevo". */
export const FRESH_LINK_MS = 48 * 60 * 60 * 1000;

export type PortalLinkSummary = {
  total: number;
  /** pending + no_answer + callback: lo que alguien tiene que llamar. */
  toCall: number;
  /** Subconjunto de `toCall`: hay una persona esperando que la llamemos. */
  callbacks: number;
  toVisit: number;
  converted: number;
  discarded: number;
  /** Llegados en las últimas 48 h (extensión o pegados a mano). */
  fresh: number;
  /** El más reciente que llegó, o null si no hay ninguno. */
  lastAddedAt: string | null;
  /**
   * El instante contra el que se midió "nuevo". Viaja con el resumen para que
   * quien lo pinte marque las mismas filas sin volver a mirar el reloj.
   */
  computedAt: string | null;
};

export const EMPTY_PORTAL_LINK_SUMMARY: PortalLinkSummary = {
  total: 0,
  toCall: 0,
  callbacks: 0,
  toVisit: 0,
  converted: 0,
  discarded: 0,
  fresh: 0,
  lastAddedAt: null,
  computedAt: null,
};

/** ¿Llegó hace menos de 48 h y sigue vivo? Misma regla que cuenta `fresh`. */
export function isFreshLink(
  link: { status: PortalLinkStatus; created_at: string },
  now: Date,
): boolean {
  if (link.status === "discarded") return false;
  const ts = new Date(link.created_at).getTime();
  return !Number.isNaN(ts) && now.getTime() - ts < FRESH_LINK_MS;
}

export function summarizePortalLinks(
  links: ReadonlyArray<{ status: PortalLinkStatus; created_at: string }>,
  now: Date = new Date(),
): PortalLinkSummary {
  const out: PortalLinkSummary = {
    ...EMPTY_PORTAL_LINK_SUMMARY,
    computedAt: now.toISOString(),
  };
  let lastTs = -Infinity;

  for (const l of links) {
    out.total++;
    if (isPendingCall(l.status)) out.toCall++;
    if (l.status === "callback") out.callbacks++;
    if (l.status === "to_visit") out.toVisit++;
    if (l.status === "converted") out.converted++;
    if (l.status === "discarded") out.discarded++;

    // Un anuncio descartado no es "nuevo" aunque llegara ayer: ya se miró.
    if (isFreshLink(l, now)) out.fresh++;
    const ts = new Date(l.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts > lastTs) {
      lastTs = ts;
      out.lastAddedAt = l.created_at;
    }
  }

  return out;
}

/**
 * Agrupa por cliente. Para la lista, que lee los enlaces de todos los clientes
 * de una sola vez en vez de una consulta por fila.
 */
export function summarizePortalLinksByClient(
  links: ReadonlyArray<{ client_id: string; status: PortalLinkStatus; created_at: string }>,
  now: Date = new Date(),
): Record<string, PortalLinkSummary> {
  const byClient = new Map<string, Array<{ status: PortalLinkStatus; created_at: string }>>();
  for (const l of links) {
    const list = byClient.get(l.client_id);
    if (list) list.push(l);
    else byClient.set(l.client_id, [l]);
  }
  const out: Record<string, PortalLinkSummary> = {};
  for (const [clientId, list] of byClient) {
    out[clientId] = summarizePortalLinks(list, now);
  }
  return out;
}
