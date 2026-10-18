-- SOLO PRUEBAS LOCALES (BCP-01 P2). Tras rollback-0212.sql: las funciones
-- nuevas no existen y catalog_add_property vuelve a no tener máximo.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regprocedure('catalog_search(uuid, uuid, jsonb, integer, integer)') IS NULL, 'reversión: sin catalog_search');
SELECT test_util.ok(to_regprocedure('catalog_set_operation(uuid, uuid, text)') IS NULL, 'reversión: sin catalog_set_operation');
SELECT test_util.ok(to_regprocedure('catalog_search_normalize(jsonb)') IS NULL, 'reversión: sin catalog_search_normalize');
SELECT test_util.ok(position('catalog_full' IN pg_get_functiondef('catalog_add_property(uuid, uuid, uuid)'::regprocedure)) = 0,
  'reversión: catalog_add_property sin máximo (0195)');
SELECT test_util.ok(NOT has_function_privilege('authenticated', 'catalog_add_property(uuid, uuid, uuid)', 'EXECUTE'),
  'reversión: catalog_add_property sigue cerrada a authenticated');
-- Lo que se guardó con 0212 se conserva.
SELECT test_util.ok((SELECT count(*) FROM catalog_items) > 0, 'reversión: las listas se conservan');
SELECT 'test-rollback-0212.sql: OK' AS resultado;
