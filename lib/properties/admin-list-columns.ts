// Columnas de `properties` que pide la lista del admin (CRM-03, PR-A). Son
// exactamente las que lee `propertyRowToAdminProperty` (lib/db/adapters.ts),
// más `id` para cruzar las etiquetas. `description`, `features` y
// `features_manual` hacen falta para deducir la planta (`resolveFloor`).
// Si el adaptador empieza a leer otra columna, hay que añadirla aquí: lo vigila
// scripts/test-admin-properties-columns.mts (paridad con la fila completa).
//
// `currency`, `property_reference` y `floor_override` no están en
// database.types.ts, pero sí en las migraciones 0020, 0047 y 0146. Con `*` una
// columna ausente no se notaba; con la lista explícita PostgREST respondería
// 400, por eso el merge espera a validar el esquema real.
export const ADMIN_LIST_COLUMNS = [
  "id",
  "slug",
  "external_id",
  "bc_reference",
  "property_reference",
  "title",
  "description",
  "features",
  "features_manual",
  "floor_override",
  "zone",
  "subzone",
  "operation",
  "operations",
  "stay",
  "status",
  "bedrooms",
  "bathrooms",
  "square_meters",
  "price",
  "currency",
  "created_at",
  "cover_photo_url",
] as const;

/** `select` de la lista: columnas explícitas + agencia + fotos (para contar y portada). */
export const ADMIN_LIST_SELECT = `${ADMIN_LIST_COLUMNS.join(", ")}, agencies(name, slug), property_photos(url, is_cover, position)`;
