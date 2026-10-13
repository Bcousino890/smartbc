-- ============================================================================
-- Reversión de 0193_catalog_public.sql (BCP-01 fase 2).
--
-- Borra SOLO las funciones de 0193. No borra tablas ni datos: los enlaces ya
-- creados quedan en catalog_shares (tabla de 0192), pero sin estas funciones
-- ningún lector puede abrirlos.
--
-- La ejecuta una PERSONA (Fabricio) solo si hace falta deshacer la fase 2 en
-- una base real; ningún agente la ejecuta contra datos reales. Después, quitar
-- la fila 0193_catalog_public.sql de schema_migrations si se quiere volver a
-- aplicar más adelante.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_share_revoke(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_share_renew(uuid, uuid, integer);
DROP FUNCTION IF EXISTS catalog_share_create(uuid, uuid, integer);
DROP FUNCTION IF EXISTS catalog_public_fingerprint(uuid, uuid);
DROP FUNCTION IF EXISTS get_catalog_states(text[]);
DROP FUNCTION IF EXISTS get_public_catalog(text);
DROP FUNCTION IF EXISTS catalog_internal_snapshot(uuid);

COMMIT;
