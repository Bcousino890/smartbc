-- SOLO PRUEBAS LOCALES. Tras rollback-0238.sql.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regprocedure('lead_retention_sweep(integer, integer)') IS NULL,
  'reversión 0238: sin barrido');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'idealista_leads' AND column_name = 'expired_at'),
  'reversión 0238: sin columna de caducidad');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'lead_inbox_facts' AND column_name IN ('listing_cover_url', 'listing_ad_code', 'expired_at'))
  AND EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'lead_inbox_facts' AND column_name = 'routing_status'),
  'reversión 0238: la vista vuelve a 0237');
SELECT test_util.ok((SELECT count(*) FROM listings_for_code('555001')) = 0
  AND to_regprocedure('route_lead(uuid)') IS NOT NULL,
  'reversión 0238: listings_for_code vuelve a 0237 y el reparto sigue');
SELECT 'test-rollback-0238.sql: OK' AS resultado;
