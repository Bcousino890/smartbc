-- SOLO ENTORNO DE PRUEBAS (paso 4 del recorrido). psql -v entorno=pruebas -f …
-- Incorpora al catálogo el anuncio cuyo código (990237009) llegó antes que él.
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
INSERT INTO idealista_listings (property_id, is_inspo, reference_code, idealista_property_id, inspo_title, address_street, address_city, operation)
SELECT NULL, true, 'QA-0237-A', '990237009', 'QA · Ático en Castelló (republicado)', 'Calle Sintética A', 'Madrid', 'rent'
 WHERE NOT EXISTS (SELECT 1 FROM idealista_listings WHERE idealista_property_id = '990237009');
SELECT id, reference_code, idealista_property_id FROM idealista_listings WHERE idealista_property_id = '990237009';
