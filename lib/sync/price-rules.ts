// Reglas de precio del motor de sindicación. Sin `server-only` a propósito:
// son puras y se prueban desde scripts de Node sin base de datos.

/**
 * Un precio 0 del scraper significa "la agencia no lo publica" (p.ej. Rentals
 * HD, que no pone precios en su web), no "vale 0 €". En el CRM se muestra como
 * "Precio a consultar" y el equipo lo rellena a mano cuando lo pide.
 */
export function scraperPriceIsUnknown(price: number): boolean {
  return !(Number(price) > 0);
}

/**
 * ¿Debe el sync tocar el precio? Solo si el scraper trae uno real y es
 * distinto del guardado. Con precio desconocido se conserva el que haya,
 * incluido el que el equipo haya escrito a mano.
 */
export function syncPriceChanged(existingPrice: number | string | null, normalizedPrice: number): boolean {
  if (scraperPriceIsUnknown(normalizedPrice)) return false;
  return Number(existingPrice ?? 0) !== normalizedPrice;
}
