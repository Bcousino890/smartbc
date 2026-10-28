// Fichas de referencia de Idealista (0232): la base rechaza asociarlas a
// catálogos, selecciones, listas de clientes, enlaces de portal, colecciones,
// colaboraciones o favoritos con el error `reference_only_property`. Esto lo
// traduce para el personal. La restricción la sigue imponiendo la base.
// Puro: se prueba en scripts/test-idealista-crm-sync.mts.

export const REFERENCE_ONLY_ERROR = "reference_only_property";

export const REFERENCE_ONLY_MESSAGE =
  "Es una ficha de referencia de un anuncio de Idealista: solo se comparte por su SmartLink. " +
  "No se puede añadir a catálogos, selecciones, listas, colecciones ni enlaces de colaboración.";

export function isReferenceOnlyError(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes(REFERENCE_ONLY_ERROR);
}

/** El mensaje para el personal si es ese rechazo; si no, el original tal cual. */
export function staffDbMessage(message: string): string {
  return isReferenceOnlyError(message) ? REFERENCE_ONLY_MESSAGE : message;
}
