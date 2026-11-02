-- SOLO PRUEBAS LOCALES (Postgres desechable de run-local.sh). Lo ejecuta ../simular-en-local.sh.
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.c(p_conv text) RETURNS idealista_leads LANGUAGE sql AS $$
  SELECT * FROM idealista_leads WHERE conversation_id = p_conv $$;
SELECT reconcile_unresolved_code_leads(50);
SELECT test_util.ok((pg_temp.c('990237006')).property_link_method IN ('ref','code')
  AND (pg_temp.c('990237006')).routing_reason = 'arrived_before_rule'
  AND (pg_temp.c('990237006')).assigned_to IS NULL,
  'C4b · regla posterior a la consulta: exacta pero «anterior a la regla», sin reparto');
