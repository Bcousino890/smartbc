-- ============================================================================
-- Comprobación ANTES DE ENCENDER la sincronización Idealista API → CRM.
-- SOLO LECTURA. La ejecuta el operador autorizado (Fabricio) en producción,
-- después del merge y del despliegue, y antes de poner
-- app_settings.idealista_crm_sync = {"enabled": true}:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < scripts/sql/idealista-crm-sync-activation.sql
-- No imprime valores sensibles (de idealista_config solo modo y país).
-- Si alguna fila sale «false», NO se enciende.
-- Aparte: confirmar que el build en marcha es el del merge (ver result.md).
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN TRANSACTION READ ONLY;

WITH chk(comprobacion, esperado, encontrado) AS (
  SELECT 'migraciones 0232 y 0233 registradas', '2',
         (SELECT count(*)::text FROM schema_migrations WHERE version IN ('0232_idealista_reference_boundary.sql', '0233_idealista_crm_sync.sql'))
  UNION ALL
  SELECT 'objetos de 0233', 'sí',
         CASE WHEN to_regclass('public.idealista_crm_sync') IS NOT NULL
               AND to_regprocedure('public.apply_idealista_crm_sync(uuid, text, bigint, jsonb, jsonb, uuid)') IS NOT NULL
              THEN 'sí' ELSE 'no' END
  UNION ALL
  SELECT 'catalog_candidates con el predicado de 0232 (md5 de prosrc)', '01e71e7d6e251918be0d6a759b82ad98',
         coalesce((SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.catalog_candidates(jsonb, boolean, text)')), 'FALTA')
  UNION ALL
  SELECT 'política properties_auth_select', '((archived_at IS NULL) AND (NOT reference_only))',
         coalesce((SELECT regexp_replace(qual, '\s+', ' ', 'g') FROM pg_policies WHERE schemaname = 'public' AND policyname = 'properties_auth_select'), 'FALTA')
  UNION ALL
  SELECT 'políticas en properties/property_photos (lista completa)',
         'properties_auth_select,properties_staff_select,properties_staff_write,property_photos_select,property_photos_staff_write',
         (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('properties', 'property_photos'))
  UNION ALL
  SELECT 'una sola «RESERVADO» en es', '1',
         (SELECT count(*)::text FROM property_tags WHERE country = 'es' AND lower(btrim(name)) = 'reservado')
  UNION ALL
  SELECT 'agencia técnica bc-idealista-referencias', '1', (SELECT count(*)::text FROM agencies WHERE slug = 'bc-idealista-referencias')
  UNION ALL
  SELECT 'interruptor', 'apagado',
         CASE WHEN coalesce((SELECT (value->>'enabled')::boolean FROM app_settings WHERE key = 'idealista_crm_sync'), false) THEN 'ENCENDIDO' ELSE 'apagado' END
  UNION ALL
  SELECT 'país de la API de Idealista', 'Spain', coalesce((SELECT api_country FROM idealista_config ORDER BY created_at LIMIT 1), 'sin configurar')
  UNION ALL
  SELECT 'aún no hay fichas de referencia', '0', (SELECT count(*)::text FROM properties WHERE reference_only)
)
SELECT comprobacion, esperado, encontrado,
       regexp_replace(esperado, '\s+', ' ', 'g') = regexp_replace(encontrado, '\s+', ' ', 'g') AS ok
  FROM chk;

-- Informativo (no bloquea): entorno de la API y alcance de D10 (no se rellenan).
SELECT 'entorno de la API' AS info,
       CASE WHEN (SELECT sandbox_mode FROM idealista_config ORDER BY created_at LIMIT 1) THEN 'sandbox (no tocará el CRM, D19)' ELSE 'producción' END AS valor
UNION ALL
SELECT 'fichas ya publicadas por API antes de encender (no se rellenan, D10)',
       (SELECT count(*)::text FROM idealista_listings WHERE api_property_id IS NOT NULL);

ROLLBACK;
