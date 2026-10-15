import type { CatalogOperation } from "./operation-price";

// ============================================================================
// Huella pública compuesta (BCP-01 K1, plan §3.3). La huella del SQL es el md5
// de la instantánea, que NO lleva los criterios: en un catálogo manual, cambiar
// la operación no la cambiaría y los lectores abiertos seguirían con las
// etiquetas viejas. La huella pública es la del SQL más la operación, salvo en
// «venta y alquiler», que conserva la del SQL exacta. Pura; la usan las tres
// lecturas (estado público, vigilante y medición) y el almacén sintético.
// ============================================================================

export function composeFingerprint(sqlFingerprint: string, operation: CatalogOperation): string {
  return operation === "any" ? sqlFingerprint : `${sqlFingerprint}:${operation}`;
}
