-- ============================================================================
-- Reversión de 0192_catalogs_core.sql (BCP-01 fase 1).
--
-- Borra SOLO los objetos que creó 0192 y sus datos (catálogos, sus
-- elementos, sus enlaces y la lista de dueños de la HOME). No toca
-- propiedades, perfiles ni ninguna otra tabla.
--
-- Irreversible para los datos de catálogos: si ya hay catálogos que se
-- quieran conservar, exportarlos antes.
--
-- La ejecuta una PERSONA (Fabricio) solo si hace falta deshacer la fase 1
-- en una base real. Ningún agente la ejecuta contra datos reales. Además hay
-- que quitar la fila de 0192_catalogs_core.sql de schema_migrations si se
-- quiere que el runner la vuelva a aplicar más adelante.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_set_status(uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_reorder(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS catalog_remove_item(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_add_property(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_update_meta(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS catalog_create(uuid, text, text);
DROP FUNCTION IF EXISTS catalog_require_owner(uuid, uuid);

DROP TABLE IF EXISTS catalog_shares;
DROP TABLE IF EXISTS catalog_items;
DROP TABLE IF EXISTS catalogs;
DROP TABLE IF EXISTS home_owners;

COMMIT;
