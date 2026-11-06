import type { ItemMatch } from "./sources";

/** Clave de deduplicación de un hallazgo: `"{source}:{canonicalId}"` (igual que (source, canonical_id) en BD). */
export function matchKey(m: ItemMatch): string {
  return `${m.item.source}:${m.item.canonicalId}`;
}

/**
 * Qué se inserta de lo encontrado: excluye lo ya visto (`alreadySeen`, con claves `"{source}:{canonicalId}"`)
 * y los duplicados dentro del mismo lote (se queda el primero, que llega ya ordenado por puntuación).
 * `kind` no cambia la selección; se recibe para que el contrato del plan sea el mismo en ambos pases.
 */
export function planEncargoRun(input: {
  found: ItemMatch[];
  alreadySeen: Set<string>;
  kind: "initial" | "new";
}): { toInsert: ItemMatch[] } {
  const seen = new Set(input.alreadySeen);
  const toInsert: ItemMatch[] = [];
  for (const m of input.found) {
    const k = matchKey(m);
    if (seen.has(k)) continue;
    seen.add(k);
    toInsert.push(m);
  }
  return { toInsert };
}
