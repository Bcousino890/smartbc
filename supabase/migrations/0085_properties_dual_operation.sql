-- Permite marcar una propiedad como Venta Y Alquiler a la vez.
--
-- `operation` (enum rent|sale, NOT NULL) se mantiene como la operación
-- "principal" para no romper el resto del código (~80 archivos leen
-- properties.operation === "sale"/"rent"): sigue siendo venta cuando la
-- propiedad está en venta (con o sin alquiler también), y alquiler cuando
-- solo está en alquiler — igual que se comportaba antes de este cambio.
--
-- `operations` (text[]) es la fuente de verdad nueva para saber si una
-- propiedad tiene ambas operaciones activas ({sale,rent}) o solo una.
-- `rent_price` guarda el precio de alquiler cuando la propiedad también
-- está en venta (en ese caso `price` queda como el precio de venta).
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS operations text[] NOT NULL DEFAULT '{}';

UPDATE properties
SET operations = ARRAY[operation::text]
WHERE operations = '{}';

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS rent_price numeric;

CREATE INDEX IF NOT EXISTS idx_properties_operations ON properties USING gin (operations);
