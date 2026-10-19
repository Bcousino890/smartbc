-- ============================================================================
-- SOLO PRUEBAS LOCALES (vigilancia de enlaces de portal, migración 0215).
--
-- Se ejecuta en una base TEMPORAL (nunca en producción) que ya tiene el esquema
-- de `properties` y la 0215 aplicada. Datos 100 % sintéticos.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/0215_portal_link_watch.sql   (dos veces: idempotente)
--   psql -v ON_ERROR_STOP=1 -f scripts/sql/test-portal-link-watch.sql
--
-- Cada comprobación imprime «ok - …»; la primera que falla lanza una excepción y para.
-- ============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

CREATE SCHEMA IF NOT EXISTS lw_t;

CREATE OR REPLACE FUNCTION lw_t.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALLO: %', msg; END IF;
  RAISE NOTICE 'ok - %', msg;
END $$;

-- Una propiedad sintética con enlace de Idealista.
CREATE OR REPLACE FUNCTION lw_t.mk(p_slug text, p_status property_status DEFAULT 'available',
                                   p_archived boolean DEFAULT false, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO properties (slug, title, operation, price, zone, source_url, status, archived_at, archived_reason, archived_auto_at)
  VALUES (p_slug, p_slug, 'sale', 100000, 'Test', 'https://www.idealista.com/inmueble/' || abs(hashtext(p_slug)) || '/',
          p_status, CASE WHEN p_archived THEN now() - interval '3 days' END, p_reason,
          CASE WHEN p_reason IS NOT NULL THEN now() - interval '3 days' END)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION lw_t.row_of(p_id uuid) RETURNS properties LANGUAGE sql AS $$ SELECT * FROM properties WHERE id = p_id $$;

DO $$
DECLARE
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid; h uuid; z uuid;
  r properties; res text; hist int;
BEGIN
  -- ---------------------------------------------------------------- 0. columnas y restricciones
  PERFORM lw_t.ok((SELECT count(*) FROM information_schema.columns
                    WHERE table_name = 'properties' AND column_name IN
                      ('archived_reason','archived_auto_at','portal_link_state','portal_link_checked_at',
                       'portal_link_first_gone_at','portal_link_gone_at')) = 6, 'las 6 columnas nuevas existen');
  z := lw_t.mk('t-chk1');
  BEGIN
    UPDATE properties SET archived_reason = 'otra_cosa' WHERE id = z;
    PERFORM lw_t.ok(false, 'archived_reason inválido debería rechazarse');
  EXCEPTION WHEN check_violation THEN PERFORM lw_t.ok(true, 'archived_reason solo admite portal_down'); END;
  BEGIN
    UPDATE properties SET portal_link_state = 'raro' WHERE id = z;
    PERFORM lw_t.ok(false, 'portal_link_state inválido debería rechazarse');
  EXCEPTION WHEN check_violation THEN PERFORM lw_t.ok(true, 'portal_link_state solo admite live/gone_pending/gone'); END;

  -- ---------------------------------------------------------------- 1. camino feliz: viva → baja (2 veces) → archivada → vuelve
  a := lw_t.mk('t-a');
  res := apply_portal_link_verdict(a, 'live');
  r := lw_t.row_of(a);
  PERFORM lw_t.ok(res = 'live' AND r.portal_link_state = 'live' AND r.portal_link_checked_at IS NOT NULL AND r.archived_at IS NULL,
                  'viva: queda en live y sin archivar');

  res := apply_portal_link_verdict(a, 'gone', '2026-10-01 12:00+00');
  r := lw_t.row_of(a);
  PERFORM lw_t.ok(res = 'pending' AND r.portal_link_state = 'gone_pending' AND r.archived_at IS NULL AND r.status = 'available'
                  AND r.portal_link_first_gone_at IS NOT NULL AND r.portal_link_gone_at = '2026-10-01 12:00+00',
                  'primera baja: pending, sigue activa, guarda la fecha de baja del portal');

  res := apply_portal_link_verdict(a, 'gone');
  r := lw_t.row_of(a);
  PERFORM lw_t.ok(res = 'pending' AND r.archived_at IS NULL, 'segunda baja inmediata (<6 h): sigue pending, NO archiva');

  UPDATE properties SET portal_link_first_gone_at = now() - interval '7 hours' WHERE id = a;
  res := apply_portal_link_verdict(a, 'gone');
  r := lw_t.row_of(a);
  PERFORM lw_t.ok(res = 'archived' AND r.archived_at IS NOT NULL AND r.status = 'archived' AND r.archived_reason = 'portal_down'
                  AND r.archived_auto_at IS NOT NULL AND r.portal_link_state = 'gone',
                  'segunda baja tras >6 h: archivada y marcada portal_down');
  SELECT count(*) INTO hist FROM property_history WHERE property_id = a AND kind = 'status' AND new_value = 'archived';
  PERFORM lw_t.ok(hist = 1, 'el cambio de estado queda en property_history');

  res := apply_portal_link_verdict(a, 'gone');
  PERFORM lw_t.ok(res = 'already_archived' AND (lw_t.row_of(a)).archived_reason = 'portal_down', 'otra baja sobre una ya archivada: no cambia nada');

  res := apply_portal_link_verdict(a, 'live');
  r := lw_t.row_of(a);
  PERFORM lw_t.ok(res = 'restored' AND r.archived_at IS NULL AND r.status = 'available' AND r.archived_reason IS NULL
                  AND r.archived_auto_at IS NULL AND r.portal_link_state = 'live' AND r.portal_link_first_gone_at IS NULL,
                  'el anuncio reaparece: se desarchiva y se limpia la marca');

  -- ---------------------------------------------------------------- 2. lo archivado A MANO no se toca nunca
  b := lw_t.mk('t-b-manual', 'archived', true, NULL);
  res := apply_portal_link_verdict(b, 'live');
  r := lw_t.row_of(b);
  PERFORM lw_t.ok(res = 'live' AND r.archived_at IS NOT NULL AND r.status = 'archived' AND r.archived_reason IS NULL,
                  'archivada a mano + anuncio vivo: sigue archivada');
  res := apply_portal_link_verdict(b, 'gone');
  r := lw_t.row_of(b);
  PERFORM lw_t.ok(res = 'already_archived' AND r.archived_reason IS NULL AND r.status = 'archived',
                  'archivada a mano + anuncio caído: sigue siendo «a mano» (no se reetiqueta)');

  -- ---------------------------------------------------------------- 3. reservada / vendida: solo se anota
  c := lw_t.mk('t-c-reservada', 'reserved');
  UPDATE properties SET portal_link_first_gone_at = now() - interval '9 hours' WHERE id = c;
  res := apply_portal_link_verdict(c, 'gone');
  r := lw_t.row_of(c);
  PERFORM lw_t.ok(res = 'skipped_status' AND r.status = 'reserved' AND r.archived_at IS NULL AND r.portal_link_state = 'gone',
                  'reservada: no se archiva aunque el anuncio haya caído');
  d := lw_t.mk('t-d-vendida', 'sold');
  res := apply_portal_link_verdict(d, 'gone', NULL, true);
  r := lw_t.row_of(d);
  PERFORM lw_t.ok(res = 'skipped_status' AND r.status = 'sold' AND r.archived_at IS NULL, 'vendida: no se archiva (ni con p_prior_gone)');

  -- ---------------------------------------------------------------- 4. p_prior_gone: la primera pasada da por hecha la primera baja
  e := lw_t.mk('t-e-prior');
  res := apply_portal_link_verdict(e, 'gone', NULL, true);
  r := lw_t.row_of(e);
  PERFORM lw_t.ok(res = 'archived' AND r.archived_reason = 'portal_down', 'p_prior_gone = true: archiva con un solo veredicto');

  -- ---------------------------------------------------------------- 5. un «vivo» corta la racha de bajas
  f := lw_t.mk('t-f-racha');
  PERFORM apply_portal_link_verdict(f, 'gone');
  UPDATE properties SET portal_link_first_gone_at = now() - interval '8 hours' WHERE id = f;
  PERFORM apply_portal_link_verdict(f, 'live');
  r := lw_t.row_of(f);
  PERFORM lw_t.ok(r.portal_link_first_gone_at IS NULL AND r.portal_link_state = 'live', 'un veredicto vivo borra la baja pendiente');
  res := apply_portal_link_verdict(f, 'gone');
  PERFORM lw_t.ok(res = 'pending' AND (lw_t.row_of(f)).archived_at IS NULL, 'tras volver a verse viva, una nueva baja vuelve a empezar (pending)');

  -- ---------------------------------------------------------------- 6. marca huérfana (reimportación que la desarchivó)
  g := lw_t.mk('t-g-huerfana');
  UPDATE properties SET archived_reason = 'portal_down', archived_auto_at = now() WHERE id = g;   -- activa pero con marca
  res := apply_portal_link_verdict(g, 'live');
  r := lw_t.row_of(g);
  PERFORM lw_t.ok(res = 'live' AND r.archived_reason IS NULL, 'una marca portal_down sin archivo se limpia');

  -- ---------------------------------------------------------------- 7. reimportación manual de lo archivado por el vigilante
  -- insert.ts, al reimportar, desarchiva, borra la marca y reinicia el veredicto (no lo da por vivo: el HTML puede ser de Wayback).
  h := lw_t.mk('t-h-reactivada');
  PERFORM apply_portal_link_verdict(h, 'gone', NULL, true);
  PERFORM lw_t.ok((lw_t.row_of(h)).status = 'archived', 'preparación: archivada por el vigilante');
  UPDATE properties SET archived_at = NULL, status = 'available', archived_reason = NULL, archived_auto_at = NULL,
         portal_link_state = NULL, portal_link_checked_at = NULL, portal_link_first_gone_at = NULL, portal_link_gone_at = NULL
   WHERE id = h;
  res := apply_portal_link_verdict(h, 'gone');
  PERFORM lw_t.ok(res = 'pending' AND (lw_t.row_of(h)).archived_at IS NULL,
                  'tras reimportar a mano, una nueva baja vuelve a empezar (pending), no archiva de golpe');

  -- ---------------------------------------------------------------- 8. id inexistente y veredicto inválido
  PERFORM lw_t.ok(apply_portal_link_verdict(gen_random_uuid(), 'live') = 'not_found', 'id inexistente: not_found');
  BEGIN
    PERFORM apply_portal_link_verdict(a, 'quizas');
    PERFORM lw_t.ok(false, 'un veredicto inválido debería lanzar excepción');
  EXCEPTION WHEN raise_exception THEN PERFORM lw_t.ok(true, 'veredicto inválido: excepción'); END;
END $$;

-- ---------------------------------------------------------------- 9. permisos: solo service_role
DO $$
DECLARE v uuid := lw_t.mk('t-perm'); ok_anon boolean := false; ok_auth boolean := false; ok_srv boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM apply_portal_link_verdict(v, 'live'); ok_anon := true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM apply_portal_link_verdict(v, 'live'); ok_auth := true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  BEGIN PERFORM apply_portal_link_verdict(v, 'live'); ok_srv := true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM lw_t.ok(NOT ok_anon, 'anon NO puede ejecutar la función');
  PERFORM lw_t.ok(NOT ok_auth, 'authenticated NO puede ejecutar la función');
  PERFORM lw_t.ok(ok_srv, 'service_role SÍ puede ejecutarla');
END $$;

-- ---------------------------------------------------------------- limpieza
DELETE FROM property_history WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 't-%');
DELETE FROM properties WHERE slug LIKE 't-%';
DROP SCHEMA lw_t CASCADE;
\echo 'TODAS LAS COMPROBACIONES OK'
