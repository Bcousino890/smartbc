// El elemento de un aviso (`?destacar=`) en los bloques de matching de la ficha.
// Los bloques enseñan las ~12 que mejor encajan; un elemento nuevo puede quedar
// más abajo, o haber dejado de encajar (vendido, otro precio…). El servidor lo
// evalúa SUELTO y aquí se decide qué ve el agente: arriba del todo y marcado
// (`pinned`) si encaja, o un motivo explícito si no. Módulo PURO
// (`npm run test:encargos-ui-state`).

export const UNAVAILABLE_REASON = "ya no está disponible";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?incluir=` de las rutas de sugerencias: un uuid o nada (cualquier otra cosa se ignora). */
export function parseIncludeParam(v: string | null | undefined): string | null {
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}

/** Cómo quedó el elemento evaluado suelto contra el encargo. */
export type HighlightLookup<T> =
  | { kind: "fits"; item: T }
  | { kind: "excluded"; reason: string }
  | { kind: "unavailable" };

export type HighlightResult = { found: true } | { found: false; reason: string };

export type Pinned<T> = T & { pinned?: true };

/**
 * La lista que se enseña con el elemento del aviso: si encaja, PRIMERO y con
 * `pinned: true` (sin repetirlo si ya estaba entre las que se ven); si no, la
 * lista tal cual y el motivo.
 */
export function pinHighlight<T extends { id: string }>(
  shown: T[],
  lookup: HighlightLookup<T>,
): { items: Pinned<T>[]; highlight: HighlightResult } {
  if (lookup.kind === "fits") {
    const id = lookup.item.id;
    return {
      items: [{ ...lookup.item, pinned: true as const }, ...shown.filter((x) => x.id !== id)],
      highlight: { found: true },
    };
  }
  return {
    items: shown,
    highlight: { found: false, reason: lookup.kind === "excluded" ? lookup.reason : UNAVAILABLE_REASON },
  };
}

/** El texto que enseña el bloque cuando el elemento del aviso ya no encaja. */
export function highlightMissMessage(reason: string): string {
  return `El elemento del aviso ya no encaja con este encargo: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
}

/**
 * Parámetros de las rutas de sugerencias de la ficha
 * (`/api/admin/clientes/[clientId]/suggested-{properties,particulares}`):
 * `encargo` e `incluir` solo si son uuid (si no, se ignoran: principal y sin
 * elemento del aviso, como siempre) y `limit` entero positivo con tope.
 * Las consultas filtran además por `client_id`: un id ajeno no devuelve nada.
 */
export function parseSuggestionQuery(
  sp: Pick<URLSearchParams, "get">,
  opts: { maxLimit?: number } = {},
): { encargoId?: string; includeId?: string; limit?: number } {
  const out: { encargoId?: string; includeId?: string; limit?: number } = {};
  const encargoId = parseIncludeParam(sp.get("encargo"));
  if (encargoId) out.encargoId = encargoId;
  const includeId = parseIncludeParam(sp.get("incluir"));
  if (includeId) out.includeId = includeId;
  if (opts.maxLimit) {
    const raw = Number(sp.get("limit"));
    if (Number.isInteger(raw) && raw > 0) out.limit = Math.min(raw, opts.maxLimit);
  }
  return out;
}
