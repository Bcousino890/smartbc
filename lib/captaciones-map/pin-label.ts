/**
 * Etiquetas de precio de los pines del mapa de captaciones.
 * Módulo PURO (se prueba con node). No usamos Intl: con "es-ES" omite el
 * separador de miles en números de 4 cifras ("1350"), y el diseño aprobado
 * muestra "1.350€" también en esos casos.
 */

/** Miles con punto, siempre (también 1.350), sin depender de la locale del runtime. */
export function formatThousandsEs(n: number): string {
  // NaN/Infinity (un precio corrupto) no deben pintar "NaN" en la interfaz.
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Alquiler "1.350€"; venta abreviada "915k€" (por encima de 1 M: "1.2M€"). */
export function formatPinPrice(price: number, operation: "rent" | "sale"): string {
  if (operation === "rent") return `${formatThousandsEs(price)}€`;
  if (price >= 1_000_000) {
    const m = Math.round(price / 100_000) / 10;
    return `${String(m).replace(/\.0$/, "")}M€`;
  }
  return `${Math.round(price / 1000)}k€`;
}

/** Texto accesible/`title` del pin: precio · dormitorios · calle. */
export function pinAriaLabel(p: {
  price: number;
  operation: "rent" | "sale";
  bedrooms: number | null;
  address: string | null;
  title: string;
}): string {
  const parts = [formatPinPrice(p.price, p.operation)];
  if (p.bedrooms !== null) parts.push(`${p.bedrooms} dorm.`);
  parts.push(p.address ?? p.title);
  return parts.join(" · ");
}
