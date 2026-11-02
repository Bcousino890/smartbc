-- ============================================================================
-- SOLO ENTORNO DE PRUEBAS. Recorrido de validación de Solicitudes · reparto.
-- NUNCA en producción. Exige: psql -v entorno=pruebas -f siembra.sql
--
-- Crea dos anuncios «inspo» SINTÉTICOS (sin ficha propia; son los únicos que
-- pueden compartir referencia en el esquema real). Todo lo sintético lleva el
-- prefijo QA-0237 / códigos 99023700x para encontrarlo y limpiarlo.
-- Requiere la migración 0237 aplicada en ese entorno.
-- ============================================================================
\set ON_ERROR_STOP 1
\if :{?entorno}
\else
  \echo 'Falta -v entorno=pruebas. No se ejecuta nada.'
  \quit
\endif
SELECT (:'entorno' = 'pruebas') AS es_pruebas \gset
\if :es_pruebas
\else
  \echo 'entorno distinto de «pruebas». No se ejecuta nada.'
  \quit
\endif
SELECT 'Postgres ' || current_setting('server_version') AS servidor;
SELECT to_regprocedure('route_lead(uuid)') IS NOT NULL AS migracion_0237_aplicada;

INSERT INTO idealista_listings (property_id, is_inspo, reference_code, idealista_property_id, inspo_title, address_street, address_city, operation)
SELECT NULL, true, v.ref, v.code, v.title, v.street, 'Madrid', v.op
  FROM (VALUES
    ('QA-0237-A', '990237001', 'QA · Ático en Castelló', 'Calle Sintética A', 'rent'),
    ('QA-0237-B', '990237002', 'QA · Piso en Goya',      'Calle Sintética B', 'sale')
  ) AS v(ref, code, title, street, op)
 WHERE NOT EXISTS (SELECT 1 FROM idealista_listings x WHERE x.idealista_property_id = v.code);

SELECT reference_code, idealista_property_id, inspo_title FROM idealista_listings
 WHERE reference_code LIKE 'QA-0237-%' ORDER BY reference_code;
