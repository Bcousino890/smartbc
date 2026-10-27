/**
 * Utilidades PURAS de los paneles del mapa de captaciones (embudo, ficha y lista).
 * Sin React ni Next: se prueban directamente con node.
 */
import { formatThousandsEs } from "./pin-label";
import type { Funnel, MapPin } from "./pins";

export type ListFilter = "match" | "all" | "new";

/** Superficie en km² con coma decimal española; "Sin zona" cuando no hay zona dibujada. */
export function formatAreaKm2(km2: number | null): string {
  if (km2 === null || !Number.isFinite(km2)) return "Sin zona";
  return `${km2.toFixed(1).replace(".", ",")} km²`;
}

/** "1.619 €" (punto de miles incluso con 4 cifras: Intl es-ES lo omitiría). */
export function formatEuro(n: number): string {
  // Sin cifra válida se enseña un guion, nunca "— €" ni "NaN €".
  if (!Number.isFinite(n)) return "—";
  return `${formatThousandsEs(n)} €`;
}

/** Precio de la ficha: alquiler "1.700 €/mes", venta "285.000 €". */
export function formatListingPrice(price: number, operation: "rent" | "sale"): string {
  return operation === "rent" ? `${formatEuro(price)}/mes` : formatEuro(price);
}

/** "2 hab. · 65 m² · Calle X"; omite lo que no se conoce. */
export function formatPinMeta(p: {
  bedrooms: number | null;
  squareMeters: number | null;
  address: string | null;
  title: string;
}): string {
  const parts: string[] = [];
  if (p.bedrooms !== null) parts.push(`${p.bedrooms} hab.`);
  if (p.squareMeters !== null) parts.push(`${Math.round(p.squareMeters)} m²`);
  parts.push(p.address ?? p.title);
  return parts.join(" · ");
}

export type FunnelRow = { key: "inZone" | "priceOk" | "matches"; label: string; value: number; pct: number };

/**
 * Filas del embudo. Las barras son proporcionales a «en zona» (que es el 100 %);
 * sin cliente solo tiene sentido «En la zona» (no hay precio/encaje que medir).
 */
export function funnelRows(funnel: Funnel, hasClient: boolean): FunnelRow[] {
  // Un recuento no finito (dato corrupto) cuenta como 0: una barra con
  // width:NaN% desaparece sin avisar y la cifra diría "NaN".
  const safe = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const base = safe(funnel.inZone);
  const pct = (v: number) => (base > 0 ? Math.min(100, Math.round((safe(v) / base) * 100)) : 0);
  const rows: FunnelRow[] = [{ key: "inZone", label: "En la zona", value: base, pct: base > 0 ? 100 : 0 }];
  if (hasClient) {
    rows.push({ key: "priceOk", label: "Precio y tipo", value: safe(funnel.priceOk), pct: pct(funnel.priceOk) });
    rows.push({ key: "matches", label: "Encajan 80 %+", value: safe(funnel.matches), pct: pct(funnel.matches) });
  }
  return rows;
}

/** Filtra por pestaña y ordena: por encaje desc si hay puntuaciones; si no, el orden recibido (recencia). */
export function filterAndSortPins(pins: MapPin[], scores: Map<string, number>, filter: ListFilter): MapPin[] {
  const filtered = pins.filter((p) => {
    if (filter === "all") return true;
    if (filter === "new") return p.isNew;
    return (scores.get(p.id) ?? -1) >= 80;
  });
  if (scores.size === 0) return filtered;
  // sort estable: a igual encaje (o sin él) se conserva el orden de entrada
  return filtered
    .map((p, i) => ({ p, i, s: scores.get(p.id) ?? -1 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}
