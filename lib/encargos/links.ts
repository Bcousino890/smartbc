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

/**
 * Editar UN encargo desde fuera de la ficha (Captaciones). `base` = `/{país}/admin/clientes/{id}`.
 * Sin encargo (o el principal: "" / null) → el diálogo de siempre (`?encargo=editar`); otro encargo → la ficha
 * abre el diálogo de ESE encargo (`?editar=<id>`, sección Encargos del Resumen), con su matching elegido.
 */
export function encargoEditHref(base: string, encargoId: string | null | undefined): string {
  if (!encargoId) return `${base}?encargo=editar`;
  return `${base}?tab=overview&encargo=${encodeURIComponent(encargoId)}&editar=${encodeURIComponent(encargoId)}`;
}
