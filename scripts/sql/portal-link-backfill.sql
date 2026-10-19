-- ============================================================================
-- Vigilancia de enlaces (0215): marcar lo que archivó el cron antiguo `check-bajas`.
--
-- El cron antiguo (`/opt/smartbc-check-bajas.sh`) corre a los :15 de las 00 y las 12 h (UTC) y archivaba con
-- archived_at = now() y status = 'archived', SIN marca. Para que esas propiedades vuelvan solas si su anuncio
-- reaparece, se marcan como `archived_reason = 'portal_down'`. Lo archivado a otras horas (a mano) NO se marca y
-- el vigilante no lo toca nunca.
--
-- Criterio (comprobado a mano el 2026-10-19 sobre las 19 archivadas con anuncio «vivo» según el crawler: las 16 que
-- caen en esa ventana las archivó el cron y las 3 que no, BC-0893, BC-0991 y BC-1499, parecen a mano):
--   · enlace de Idealista, archivada, sin marca todavía,
--   · archived_at entre las 00:15 y las 00:25 o entre las 12:15 y las 12:25 UTC.
--
-- Uso (solo con el visto bueno de la primera pasada; reversible con la sentencia de abajo):
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v dry=1 < scripts/sql/portal-link-backfill.sql   # ensayo: cuenta y deshace
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1           < scripts/sql/portal-link-backfill.sql   # aplica
--
-- Deshacer (solo lo marcado por este script y no tocado después):
--   UPDATE properties SET archived_reason = NULL, archived_auto_at = NULL
--    WHERE archived_reason = 'portal_down' AND archived_auto_at = archived_at;
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;

WITH marcadas AS (
  UPDATE public.properties
     SET archived_reason  = 'portal_down',
         archived_auto_at = archived_at
   WHERE source_url ILIKE '%idealista.com%'
     AND (archived_at IS NOT NULL OR status = 'archived')
     AND archived_reason IS NULL
     AND archived_at IS NOT NULL
     AND extract(hour   FROM archived_at AT TIME ZONE 'UTC') IN (0, 12)
     AND extract(minute FROM archived_at AT TIME ZONE 'UTC') BETWEEN 15 AND 25
  RETURNING id
)
SELECT count(*) AS marcadas FROM marcadas;

SELECT count(*) FILTER (WHERE archived_reason = 'portal_down') AS con_marca,
       count(*) FILTER (WHERE archived_reason IS NULL)         AS archivadas_a_mano
  FROM public.properties
 WHERE source_url ILIKE '%idealista.com%' AND archived_at IS NOT NULL;

\if :{?dry}
  \echo 'ENSAYO (dry=1): se deshace todo.'
  ROLLBACK;
\else
  COMMIT;
\endif
