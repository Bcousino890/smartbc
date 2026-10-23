-- ============================================================================
-- SOLO PRUEBAS LOCALES (traducciones reutilizadas en el equipo, 0230). Tras
-- rollback-0230.sql: sin función, índices ni columnas de procedencia, y lo
-- ya publicado sigue publicado. Sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regprocedure('catalog_tr_reuse(uuid, uuid, uuid, text, jsonb)') IS NULL, 'reversión: catalog_tr_reuse ya no existe');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalog_tr_texts' AND column_name = 'reused_from')
                    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalog_tr_features' AND column_name = 'reused_from_owner'),
  'reversión: sin columnas de procedencia');
SELECT test_util.ok(to_regclass('idx_catalog_tr_sources_reuse') IS NULL AND to_regclass('idx_catalog_tr_features_reuse') IS NULL, 'reversión: sin índices');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_copies WHERE lang = 'en') >= 3, 'lo publicado (también lo reutilizado) sigue publicado');
\echo 'test-rollback-0230.sql: reversión en verde'
