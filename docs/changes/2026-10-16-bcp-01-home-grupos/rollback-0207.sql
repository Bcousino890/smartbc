-- ============================================================================
-- Reversión de 0207 (HOME · grupos de catálogos).
--
-- ⚠️ SE PIERDE TODA LA ORGANIZACIÓN: los grupos, los subgrupos y las
-- asignaciones de catálogos. Antes de ejecutarla, si se quiere conservar,
-- copiarla (desde psql dentro del contenedor supabase-db):
--   \copy (SELECT * FROM catalog_groups)        TO 'catalog_groups.csv'        CSV HEADER
--   \copy (SELECT * FROM catalog_group_members) TO 'catalog_group_members.csv' CSV HEADER
--
-- No toca los catálogos (catalogs, catalog_items), sus criterios, sus ajustes
-- ni lo que ve el cliente: la HOME vuelve a la estantería sin grupos. El código
-- de la HOME con grupos funciona también sin estas tablas (sin grupos).
-- La ejecuta una persona, nunca un agente contra datos reales.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_create_in_group(uuid, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS catalog_group_set_member(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS catalog_group_delete(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_group_preview_delete(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_group_move(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_group_reorder(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS catalog_group_rename(uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_group_create(uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_group_name_taken(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS catalog_group_renumber(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_group_owned(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_group_lock_owner(uuid);
DROP FUNCTION IF EXISTS catalog_group_name(text);

DROP TABLE IF EXISTS catalog_group_members;
DROP TABLE IF EXISTS catalog_groups;

DROP FUNCTION IF EXISTS catalog_group_members_check_owner();
DROP FUNCTION IF EXISTS catalog_groups_check_tree();

COMMIT;
