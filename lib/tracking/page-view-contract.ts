// Contrato del endpoint público de page-views — parte pura y testeable.
//
// Las superficies públicas NO conocen el UUID de la propiedad: el DTO público
// pone deliberadamente `id = slug` para no serializar identificadores
// internos en el HTML. El navegador manda por tanto el SLUG (o, en clientes
// con el bundle anterior cacheado, un slug dentro del campo propertyId), y la
// traducción a UUID ocurre en el servidor con service role — el mismo patrón
// que ya siguen collectionToken y shortlistToken.
//
// Este módulo decide QUÉ es lo que ha llegado; la resolución contra BD vive
// en la ruta. Así el contrato completo se cubre con tests sin red.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PropertyRef =
  | { kind: "uuid"; id: string }
  | { kind: "slug"; slug: string }
  | { kind: "none" };

/**
 * Clasifica la referencia de propiedad del body.
 * Prioridad: `propertySlug` explícito → `propertyId` con forma de UUID →
 * `propertyId` SIN forma de UUID se trata como slug (compatibilidad con el
 * tracker anterior, que mandaba `property.id` público = slug: es exactamente
 * el tráfico que llevaba tiempo perdiéndose con un 500).
 */
export function classifyPropertyRef(body: {
  propertyId?: string | null;
  property_id?: string | null;
  propertySlug?: string | null;
}): PropertyRef {
  const slug = (body.propertySlug ?? "").trim();
  if (slug) return { kind: "slug", slug };

  const id = (body.propertyId ?? body.property_id ?? "").trim();
  if (!id) return { kind: "none" };
  if (UUID_RE.test(id)) return { kind: "uuid", id };
  return { kind: "slug", slug: id };
}

/**
 * Decide el `property_id` final del evento a partir de la referencia y del
 * resultado de resolver el slug contra BD.
 *
 *  · uuid                  → se usa tal cual;
 *  · slug resuelto         → el UUID resuelto;
 *  · slug NO resuelto      → `skip`: NO se inserta el evento (un slug
 *                            inexistente no debe generar filas basura) y se
 *                            responde 200 igualmente — el tracking jamás
 *                            rompe la página;
 *  · sin referencia        → null (páginas sin propiedad: colecciones, home).
 */
export function resolvePageViewProperty(
  ref: PropertyRef,
  resolvedFromSlug: string | null,
): { propertyId: string | null; skip: boolean } {
  if (ref.kind === "uuid") return { propertyId: ref.id, skip: false };
  if (ref.kind === "slug") {
    return resolvedFromSlug
      ? { propertyId: resolvedFromSlug, skip: false }
      : { propertyId: null, skip: true };
  }
  return { propertyId: null, skip: false };
}
