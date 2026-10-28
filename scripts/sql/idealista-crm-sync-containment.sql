-- ============================================================================
-- Contención de las fichas de referencia (Idealista API → CRM). Lo ejecuta el
-- operador autorizado (Fabricio) ANTES de revertir el código de esta tarea con
-- fichas ya creadas: el código anterior no filtra reference_only en la búsqueda
-- de /s ni en el correo de oferta, y ninguna política alcanza esas consultas de
-- service role. Archivar (archived_at) las saca de ahí y deja sus SmartLinks
-- sin servicio mientras dure. NO cambia status ni borra nada.
--
--   Ensayo (no cambia nada):  psql -v ON_ERROR_STOP=1 -v dry=1 -f idealista-crm-sync-containment.sql
--   Aplicar:                  psql -v ON_ERROR_STOP=1 -f idealista-crm-sync-containment.sql
--   Deshacer:                 psql -v ON_ERROR_STOP=1 -v undo=1 -f idealista-crm-sync-containment.sql
--   (deshacer también admite -v dry=1)
-- Solo toca filas con reference_only; deshacer solo las de su propio motivo.
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\if :{?undo}
UPDATE properties SET archived_at = NULL, archived_auto_at = NULL, archived_reason = NULL, updated_at = now()
 WHERE reference_only AND archived_reason = 'idealista_crm_containment';
\else
UPDATE properties SET archived_at = now(), archived_auto_at = now(), archived_reason = 'idealista_crm_containment', updated_at = now()
 WHERE reference_only AND archived_at IS NULL;
\endif
SELECT count(*) FILTER (WHERE archived_at IS NULL)                              AS referencias_visibles,
       count(*) FILTER (WHERE archived_reason = 'idealista_crm_containment')   AS en_contencion,
       count(*) FILTER (WHERE archived_reason = 'idealista_api_withdrawn')     AS archivadas_por_baja
  FROM properties WHERE reference_only;
\if :{?dry}
ROLLBACK;
\echo 'ensayo: no se ha cambiado nada'
\else
COMMIT;
\endif
