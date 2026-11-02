-- SOLO PRUEBAS LOCALES (Postgres desechable de run-local.sh). Lo ejecuta ../simular-en-local.sh.
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.ingesta(p_conv text, p_name text, p_phone text, p_ref text, p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO idealista_leads (conversation_id, name, phone, property_ref, idealista_code) VALUES (p_conv, p_name, p_phone, p_ref, p_code)
  ON CONFLICT (conversation_id) DO UPDATE SET updated_at = now() RETURNING id INTO v;
  PERFORM route_leads(ARRAY[v]); PERFORM reconcile_unresolved_code_leads(50);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.c(p_conv text) RETURNS idealista_leads LANGUAGE sql AS $$
  SELECT * FROM idealista_leads WHERE conversation_id = p_conv $$;
-- 4 · tras republicar A (990237001 → 990237009) y un lote (L5)
SELECT pg_temp.ingesta('990237005','QA Persona Cinco','+34 600 990 005',NULL,NULL);
SELECT test_util.ok((pg_temp.c('990237004')).assigned_to='a1000000-0000-0000-0000-000000000002'
  AND (pg_temp.c('990237004')).matched_listing_id=(SELECT id FROM idealista_listings WHERE reference_code='QA-0237-A'),
  'C4 · tras republicar y un lote: anuncio A exacto y QA 1 (regla previa)');
SELECT pg_temp.ingesta('990237001','QA Persona Uno','+34 600 990 001','QA-0237-A','990237001');
SELECT test_util.ok((pg_temp.c('990237001')).property_link_method IN ('ref','code')
  AND (pg_temp.c('990237001')).matched_listing_id=(SELECT id FROM idealista_listings WHERE reference_code='QA-0237-A'),
  'C4 · el código anterior (990237001) sigue resolviendo al anuncio A');
-- 4b · regla para C DESPUÉS de la consulta, republicar C y lote
SELECT routing_set_rules('a1000000-0000-0000-0000-000000000001','es','a1000000-0000-0000-0000-000000000003',
  jsonb_build_array(jsonb_build_object('listing_id',(SELECT id FROM idealista_listings WHERE reference_code='QA-0237-C'),'expected_version',0)));
