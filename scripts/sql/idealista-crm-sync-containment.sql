-- ============================================================================
-- Contención de las fichas de referencia (Idealista API → CRM). Lo ejecuta el
-- operador autorizado (Fabricio) ANTES de revertir el código de esta tarea con
-- fichas ya creadas: el código anterior no filtra reference_only en la búsqueda
-- de /s ni en el correo de oferta, y ninguna política alcanza esas consultas de
-- service role. Archivar (archived_at) las saca de ahí y deja sus SmartLinks
-- sin servicio mientras dure. NO cambia status ni borra nada.
--
--   Informe (solo lectura):  psql -v ON_ERROR_STOP=1 -v report=1 -f idealista-crm-sync-containment.sql
--   Ensayo (no cambia nada): psql -v ON_ERROR_STOP=1 -v dry=1 -f idealista-crm-sync-containment.sql
--   Aplicar:                 psql -v ON_ERROR_STOP=1 -f idealista-crm-sync-containment.sql
--
-- NO HAY «DESHACER EN BLOQUE». Liberar una ficha contenida solo se hace con el
-- código compatible YA en marcha (comprobado como dice result.md) y con la
-- sincronización encendida, ficha a ficha, desde el panel de Idealista
-- («Liberar contención», que llama a idealista_crm_release_containment): se
-- desarchiva solo si el último estado del anuncio es «publicado», es cierto y
-- ya está aplicado. Las retiradas o inciertas siguen archivadas hasta resolverse.
-- ============================================================================
\set ON_ERROR_STOP 1
\if :{?undo}
DO $$ BEGIN
  RAISE EXCEPTION 'containment_bulk_undo_removed'
    USING DETAIL = 'El deshacer en bloque ya no existe: libera ficha a ficha desde el panel, con el código compatible en marcha y la sincronización encendida.';
END $$;
\endif
\if :{?report}
BEGIN TRANSACTION READ ONLY;
SELECT p.bc_reference, p.slug, s.listing_id, s.environment, s.status AS estado_sync,
       idealista_crm_target(s.listing_id, s.environment)->>'state' AS ultimo_estado_anuncio,
       CASE idealista_crm_target(s.listing_id, s.environment)->>'state'
         WHEN 'published' THEN 'se podrá liberar (tras aplicar si hace falta)'
         WHEN 'withdrawn' THEN 'sigue archivada: baja confirmada'
         ELSE 'sigue archivada hasta resolver (comprobar en Idealista / Reconciliar)' END AS que_pasara
  FROM properties p
  JOIN idealista_crm_sync s ON s.property_id = p.id
 WHERE p.reference_only AND p.archived_reason = 'idealista_crm_containment'
 ORDER BY p.bc_reference;
ROLLBACK;
\else
BEGIN;
UPDATE properties SET archived_at = now(), archived_auto_at = now(), archived_reason = 'idealista_crm_containment', updated_at = now()
 WHERE reference_only AND archived_at IS NULL;
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
\endif
