import type { EncargoSource } from "./model";

/** Enlace a la pestaña de matching de un encargo (España), con una ficha destacada opcional. */
export function encargoLink(
  country: "es",
  clientId: string,
  encargoId: string,
  highlight?: { source: EncargoSource; id: string },
): string {
  const hl = highlight ? `&destacar=${highlight.source}:${highlight.id}` : "";
  return `/${country}/admin/clientes/${clientId}?encargo=${encargoId}${hl}#matching`;
}
