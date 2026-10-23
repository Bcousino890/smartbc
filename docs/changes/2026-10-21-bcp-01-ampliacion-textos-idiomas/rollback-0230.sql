-- ============================================================================
-- Reversión de 0230 (traducciones reutilizadas en todo el equipo).
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (result-traduccion-compartida.md).
--
-- Quita la función, los índices y las dos columnas de procedencia. Lo ya
-- copiado se queda como estaba (traducciones del dueño, publicadas o en
-- borrador): no se despublica nada. Con el código anterior, cada catálogo
-- vuelve a traducir por su cuenta. Una sola transacción.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_tr_reuse(uuid, uuid, uuid, text, jsonb);
DROP INDEX IF EXISTS idx_catalog_tr_sources_reuse;
DROP INDEX IF EXISTS idx_catalog_tr_sources_area_sig;
DROP INDEX IF EXISTS idx_catalog_tr_features_reuse;
ALTER TABLE catalog_tr_texts    DROP COLUMN IF EXISTS reused_from;
ALTER TABLE catalog_tr_features DROP COLUMN IF EXISTS reused_from_owner;

COMMIT;
