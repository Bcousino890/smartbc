// Resumen del historial de precio a partir de `particulares_changes`. Puro, para
// probarlo sin React y compartirlo entre el bloque de precio (barra lateral) y
// la pestaña «Histórico».

import type { ParticularChangeRow } from "../particulares-types";
import { type PriceVariation, priceVariation } from "./format";

export type PricePoint = { date: string; price: number };

export type PriceHistory = {
  /** Primer precio conocido (el del alta, o el «antes» del primer cambio). */
  initial: number | null;
  /** Nº de bajadas y subidas registradas. */
  drops: number;
  rises: number;
  /** Variación entre el primer precio y el actual (null si no ha cambiado). */
  total: PriceVariation | null;
  /** Alta → cambios en orden cronológico → precio actual. */
  series: PricePoint[];
  /** ¿Hay ≥2 precios distintos? Solo entonces merece gráfico. */
  hasChanges: boolean;
};

const asPrice = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function summarizePriceHistory(
  changes: ParticularChangeRow[] | null | undefined,
  currentPrice: number | null | undefined,
  nowIso: string = new Date().toISOString(),
): PriceHistory {
  const asc = [...(changes ?? [])].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at));
  const series: PricePoint[] = [];
  let initial: number | null = null;
  let drops = 0;
  let rises = 0;

  for (const c of asc) {
    if (c.change_type === "price_down") drops++;
    if (c.change_type === "price_up") rises++;
    if (!["new_listing", "price_up", "price_down"].includes(c.change_type)) continue;
    const price = asPrice(c.new_value?.price);
    if (initial == null) {
      // El alta da el precio inicial; si falta, el «antes» del primer cambio.
      initial = c.change_type === "new_listing" ? price : asPrice(c.old_value?.price) ?? price;
      const before = asPrice(c.old_value?.price);
      if (c.change_type !== "new_listing" && before != null) series.push({ date: c.changed_at, price: before });
    }
    if (price != null) series.push({ date: c.changed_at, price });
  }
  if (typeof currentPrice === "number") series.push({ date: nowIso, price: currentPrice });

  const hasChanges = new Set(series.map((p) => p.price)).size >= 2;
  return {
    initial,
    drops,
    rises,
    total: priceVariation(currentPrice, initial),
    series,
    hasChanges,
  };
}
