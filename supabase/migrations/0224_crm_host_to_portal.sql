-- ============================================================================
-- 0224 · Dominio único: https://crm.bcousinoprop.com/ → https://portal.bcousinoprop.com/
--
-- Por qué (2026-10-22): crm.bcousinoprop.com dejó de tener registro DNS
-- público, Caddy no pudo renovar su certificado y caducó el 2026-10-21 20:44
-- UTC. Desde entonces /_next/image devuelve 500 para toda foto guardada con
-- ese dominio (miniaturas rotas en el CRM, catálogo y SmartLinks). El dominio
-- funcional es portal.bcousinoprop.com, que sirve el mismo Storage
-- (/storage/v1/...) con certificado válido.
--
-- Qué hace: recorre TODAS las columnas text / varchar / jsonb / text[] de las
-- tablas del esquema public y reescribe el prefijo solo en las filas que lo
-- contienen. Genérico a propósito: las URLs de fotos viven en muchas tablas
-- (property_photos, properties.cover_photo_url, jsonb de fotos de
-- captaciones, catálogos, avatares, vídeos…).
--
-- Idempotente: una segunda pasada no encuentra filas.
--
-- Triggers (revisados en producción el 2026-10-22): de las tablas afectadas
-- solo properties e idealista_listings tienen triggers de UPDATE, y ninguno
-- reacciona a columnas de URL (historial de precio/estado/publicación,
-- fechas de publicación de Idealista). La excepción es properties_updated_at:
-- se desactiva durante la reescritura para que ~1.600 propiedades no
-- aparezcan como «modificadas hoy» por un cambio de dominio.
--
-- Volumen en producción (2026-10-22): ~44.700 filas, casi todas en
-- property_photos.url (40.634) y properties.cover_photo_url (1.617).
-- ============================================================================

-- Todo en una transacción: si algo falla, el trigger no queda desactivado.
BEGIN;

ALTER TABLE public.properties DISABLE TRIGGER properties_updated_at;

DO $$
DECLARE
  c record;
  n bigint;
  old_host constant text := 'https://crm.bcousinoprop.com/';
  new_host constant text := 'https://portal.bcousinoprop.com/';
BEGIN
  FOR c IN
    SELECT col.table_name, col.column_name, col.data_type, col.udt_name
      FROM information_schema.columns col
      JOIN information_schema.tables t
        ON t.table_schema = col.table_schema AND t.table_name = col.table_name
     WHERE col.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND (col.data_type IN ('text', 'character varying', 'jsonb')
            OR (col.data_type = 'ARRAY' AND col.udt_name IN ('_text', '_varchar')))
       AND col.is_generated = 'NEVER'
  LOOP
    IF c.data_type = 'jsonb' THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I::text, $1, $2)::jsonb WHERE strpos(%I::text, $1) > 0',
        c.table_name, c.column_name, c.column_name, c.column_name)
        USING old_host, new_host;
    ELSIF c.data_type = 'ARRAY' THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I::text, $1, $2)::%s WHERE strpos(%I::text, $1) > 0',
        c.table_name, c.column_name, c.column_name,
        CASE c.udt_name WHEN '_varchar' THEN 'varchar[]' ELSE 'text[]' END,
        c.column_name)
        USING old_host, new_host;
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I, $1, $2) WHERE strpos(%I, $1) > 0',
        c.table_name, c.column_name, c.column_name, c.column_name)
        USING old_host, new_host;
    END IF;

    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE '0224: %.% → % filas', c.table_name, c.column_name, n;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.properties ENABLE TRIGGER properties_updated_at;

COMMIT;
