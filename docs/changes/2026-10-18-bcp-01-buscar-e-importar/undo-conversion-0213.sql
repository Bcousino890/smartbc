-- ============================================================================
-- Deshacer UNA conversión de automático a selección fija (BCP-01 P4, 0213).
-- Vuelve el catálogo a AUTOMÁTICO con sus criterios y ajustes (que nunca se
-- tocaron) y repone la lista manual que había guardada antes de convertir
-- (mismas claves y posiciones), así que el lector vuelve a ver exactamente lo
-- de antes de la conversión (la lista automática en vivo).
--
-- ⚠️ Lo que se haya añadido, quitado u ordenado A MANO después de convertir se
-- pierde (la lista manual vuelve a la de antes). Las conversiones posteriores
-- de ese catálogo, si las hubo, se deshacen primero (la más reciente).
-- Uso (psql dentro del contenedor supabase-db, lo ejecuta una persona):
--   \set catalog '<uuid del catálogo>'
--   \i undo-conversion-0213.sql
-- ============================================================================
BEGIN;
WITH c AS (
  SELECT * FROM catalog_conversions
   WHERE catalog_id = :'catalog' AND undone_at IS NULL
   ORDER BY converted_at DESC LIMIT 1 FOR UPDATE
), del AS (
  DELETE FROM catalog_items WHERE catalog_id = (SELECT catalog_id FROM c) RETURNING 1
), ins AS (
  INSERT INTO catalog_items (catalog_id, property_id, public_key, position, added_at)
  SELECT c.catalog_id, (x->>'property_id')::uuid, x->>'public_key', (x->>'position')::integer,
         coalesce((x->>'added_at')::timestamptz, now())
    FROM c, jsonb_array_elements(c.previous_items) x
   WHERE EXISTS (SELECT 1 FROM properties p WHERE p.id = (x->>'property_id')::uuid)
     AND (SELECT count(*) FROM del) >= 0
  RETURNING 1
)
UPDATE catalogs SET mode = 'auto', criteria = (SELECT criteria FROM c), version = version + 1, updated_at = now()
 WHERE id = (SELECT catalog_id FROM c) AND (SELECT count(*) FROM ins) >= 0;
UPDATE catalog_conversions SET undone_at = now()
 WHERE id = (SELECT id FROM catalog_conversions WHERE catalog_id = :'catalog' AND undone_at IS NULL ORDER BY converted_at DESC LIMIT 1);
COMMIT;
