-- ============================================================================
-- SOLO ENTORNO DE PRUEBAS (pasos 4 y 4b del recorrido). NUNCA en producción.
--   psql -v entorno=pruebas -v ref=QA-0237-A -v codigo=990237009 -f republicar-anuncio.sql
--
-- Simula una REPUBLICACIÓN como la hace el CRM hoy: el MISMO anuncio recibe
-- un código nuevo de Idealista (se reescribe idealista_property_id). El
-- historial (idealista_listing_codes, 0237) conserva el código anterior.
-- Solo toca anuncios sintéticos QA-0237-*.
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
SELECT (:'ref' LIKE 'QA-0237-%') AS es_sintetico \gset
\if :es_sintetico
\else
  \echo 'Solo se republican anuncios sintéticos QA-0237-*. No se ejecuta nada.'
  \quit
\endif
UPDATE idealista_listings SET idealista_property_id = :'codigo'
 WHERE reference_code = :'ref' AND is_inspo;
SELECT h.idealista_property_id AS codigo, h.valid_from AS desde, h.valid_to AS hasta
  FROM idealista_listing_codes h JOIN idealista_listings x ON x.id = h.listing_id
 WHERE x.reference_code = :'ref' ORDER BY h.valid_from;
