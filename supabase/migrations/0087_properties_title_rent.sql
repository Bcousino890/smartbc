-- Título específico para la variante de alquiler cuando una propiedad está
-- marcada como Venta Y Alquiler a la vez (ver 0085_properties_dual_operation).
--
-- `title` sigue siendo el título "principal" (el de venta cuando la propiedad
-- está en venta, con o sin alquiler también) — igual que sigue haciendo el
-- resto del código que lee `properties.title` sin distinguir operación.
-- `title_rent` es opcional: si está vacío, la vista de alquiler cae a `title`.
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS title_rent text;
