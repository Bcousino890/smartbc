-- ============================================================================
-- Reversión de 0243_encargos_multiples.sql. La ejecuta una persona con psql
-- (nunca un agente). Solo es válida con UNA fila por cliente: si algún cliente
-- tiene varios encargos, aborta sin cambiar nada (borra o fusiona antes los
-- sobrantes a mano). Pérdida: la tabla `encargo_matches` entera y las columnas
-- id, label, status, is_primary, position, end_client_label,
-- max_price_by_bedrooms y baseline_at de client_preferences.
--   psql … -v ON_ERROR_STOP=1 -f docs/changes/2026-11-06-encargos-matching/rollback-0243.sql
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;

DO $$
DECLARE
  dup int;
BEGIN
  SELECT count(*) INTO dup FROM (
    SELECT client_id FROM public.client_preferences GROUP BY client_id HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'Rollback 0243 abortado: % cliente(s) con más de un encargo. Deja una sola fila por client_id y reintenta.', dup;
  END IF;
END $$;

DROP TABLE IF EXISTS public.encargo_matches;
DROP INDEX IF EXISTS public.client_preferences_one_primary;
DROP INDEX IF EXISTS public.client_preferences_client_id_idx;
ALTER TABLE public.client_preferences DROP CONSTRAINT IF EXISTS client_preferences_status_check;

DO $$
DECLARE
  pk_cols text;
BEGIN
  SELECT (SELECT string_agg(a.attname, ',' ORDER BY a.attname)
            FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey))
    INTO pk_cols
    FROM pg_constraint c
   WHERE c.conrelid = 'public.client_preferences'::regclass AND c.contype = 'p';

  IF pk_cols IS DISTINCT FROM 'client_id' THEN
    ALTER TABLE public.client_preferences DROP CONSTRAINT IF EXISTS client_preferences_pkey;
    ALTER TABLE public.client_preferences ADD CONSTRAINT client_preferences_pkey PRIMARY KEY (client_id);
  END IF;
END $$;

ALTER TABLE public.client_preferences
  DROP COLUMN IF EXISTS id,
  DROP COLUMN IF EXISTS label,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS is_primary,
  DROP COLUMN IF EXISTS position,
  DROP COLUMN IF EXISTS end_client_label,
  DROP COLUMN IF EXISTS max_price_by_bedrooms,
  DROP COLUMN IF EXISTS baseline_at;

COMMIT;
