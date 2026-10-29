-- Reversión de 0235 (propuesta de mobiliario). Borra las dos tablas y, con
-- ellas, las parejas y los textos guardados: NO se pueden reconstruir con SQL.
-- Los archivos del bucket properties-photos ({property_id}/propuesta/…) NO se
-- borran; quedan huérfanos y se pueden limpiar aparte.
-- El código de esta rama tolera que las tablas no existan (la ficha y el
-- enlace compartido se ven como antes, sin propuesta).
BEGIN;
DROP TABLE IF EXISTS property_furnishing_images;
DROP TABLE IF EXISTS property_furnishing_proposals;
COMMIT;
