-- SOLO ENTORNO DE PRUEBAS. psql -v entorno=pruebas -f limpieza.sql
-- Borra lo sintético del recorrido. La auditoría (assignment_events) es
-- append-only por diseño y NO se borra: queda como rastro del ensayo.
-- El cliente sintético creado desde la ficha se borra desde Clientes.
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
BEGIN;
DELETE FROM zinto_owner_sync
 WHERE subject_id IN (SELECT id FROM idealista_leads WHERE conversation_id LIKE '99023700%');
DELETE FROM idealista_leads WHERE conversation_id LIKE '99023700%';
DELETE FROM idealista_listings WHERE reference_code LIKE 'QA-0237-%';   -- sus reglas caen en cascada
COMMIT;
