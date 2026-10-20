-- Prueba de la migración 0216 (user_scope_overrides) en una base DESECHABLE.
--
--   docker run -d --name tmp-pg-0216 --memory 512m -e POSTGRES_PASSWORD=x supabase/postgres:15.8.1.085
--   docker cp supabase/migrations/0216_user_scope_overrides.sql tmp-pg-0216:/tmp/0216.sql
--   docker cp scripts/sql-tests/0216_user_scope_overrides.test.sql tmp-pg-0216:/tmp/t.sql
--   docker exec tmp-pg-0216 psql -U supabase_admin -h localhost -d postgres -f /tmp/t.sql
--   docker rm -f tmp-pg-0216
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

CREATE TABLE IF NOT EXISTS profiles (id uuid PRIMARY KEY, email text, role text DEFAULT 'client');
GRANT ALL ON profiles TO anon, authenticated, service_role;
INSERT INTO profiles (id, email, role) VALUES ('11111111-1111-1111-1111-111111111111', 'a@x.com', 'advisor');

\set anon 'SET LOCAL ROLE anon; SET LOCAL request.jwt.claims = ''{"role":"anon"}''; SET LOCAL request.jwt.claim.role = ''anon'';'
\set cliente 'SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = ''{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}''; SET LOCAL request.jwt.claim.role = ''authenticated''; SET LOCAL request.jwt.claim.sub = ''11111111-1111-1111-1111-111111111111'';'
\set servidor 'SET LOCAL ROLE service_role; SET LOCAL request.jwt.claims = ''{"role":"service_role"}''; SET LOCAL request.jwt.claim.role = ''service_role'';'


-- Ayudantes: cada comprobación se registra en t_res y devuelve 'OK: …' / 'FALLO: …'.
CREATE TABLE t_res (ok boolean, msg text);
GRANT ALL ON t_res TO PUBLIC;
CREATE FUNCTION chk(cond boolean, msg text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO t_res VALUES (coalesce(cond, false), msg);
  RETURN CASE WHEN coalesce(cond, false) THEN 'OK: ' ELSE 'FALLO: ' END || msg;
END $f$;
GRANT EXECUTE ON FUNCTION chk(boolean, text) TO PUBLIC;
-- Ejecuta `sql` en una subtransacción; OK solo si falla con el SQLSTATE esperado.
-- Si el comando prospera se lanza un marcador (P0001) que revierte lo insertado.
CREATE FUNCTION expect_err(sql text, esperado text, msg text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE sql;
    RAISE EXCEPTION 'prospero' USING ERRCODE = 'P0001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = esperado THEN
      RETURN chk(true, msg || ' [' || SQLSTATE || ']');
    ELSIF SQLERRM = 'prospero' THEN
      RETURN chk(false, msg || ' (el comando NO falló)');
    ELSE
      RETURN chk(false, msg || ' (error inesperado ' || SQLSTATE || ': ' || SQLERRM || ')');
    END IF;
  END;
END $f$;
GRANT EXECUTE ON FUNCTION expect_err(text, text, text) TO PUBLIC;

\echo '=== Se aplica dos veces (idempotente) ==='
\i /tmp/0216.sql
\i /tmp/0216.sql
SELECT chk(to_regclass('public.user_scope_overrides') IS NOT NULL, 'tras dos aplicaciones la tabla existe');
SELECT chk((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_scope_overrides'::regclass), 'RLS activada');
SELECT chk((SELECT count(*) FROM pg_policies WHERE tablename = 'user_scope_overrides') = 0, 'sin políticas');
SELECT chk(NOT has_table_privilege('anon', 'user_scope_overrides', 'SELECT,INSERT,UPDATE,DELETE')
       AND NOT has_table_privilege('authenticated', 'user_scope_overrides', 'SELECT,INSERT,UPDATE,DELETE'),
       'anon/authenticated sin privilegios de tabla');

\echo '=== anon y authenticated no leen ni escriben (insufficient_privilege 42501) ==='
BEGIN; :anon
SELECT expect_err('SELECT * FROM user_scope_overrides', '42501', 'anon no lee');
SELECT expect_err('INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES (''11111111-1111-1111-1111-111111111111'', ''properties'', ''view'', ''own'')', '42501', 'anon no inserta');
COMMIT;
BEGIN; :cliente
SELECT expect_err('SELECT * FROM user_scope_overrides', '42501', 'authenticated no lee');
SELECT expect_err('INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES (''11111111-1111-1111-1111-111111111111'', ''properties'', ''view'', ''own'')', '42501', 'authenticated no inserta');
SELECT expect_err('UPDATE user_scope_overrides SET scope = ''all''', '42501', 'authenticated no actualiza');
SELECT expect_err('DELETE FROM user_scope_overrides', '42501', 'authenticated no borra');
COMMIT;

\echo '=== service_role inserta y lee ==='
BEGIN; :servidor
INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'own');
SELECT chk((SELECT count(*) FROM user_scope_overrides) = 1, 'la service role inserta y lee su fila');
COMMIT;

\echo '=== Unicidad (unique_violation 23505) ==='
BEGIN; :servidor
SELECT expect_err('INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES (''11111111-1111-1111-1111-111111111111'', ''properties'', ''view'', ''all'')', '23505', 'fila global duplicada choca');
INSERT INTO user_scope_overrides (user_id, resource, kind, scope, country) VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'all', 'cl');
SELECT chk((SELECT count(*) FROM user_scope_overrides WHERE resource = 'properties' AND kind = 'view') = 2, 'global y de país coexisten');
SELECT expect_err('INSERT INTO user_scope_overrides (user_id, resource, kind, scope, country) VALUES (''11111111-1111-1111-1111-111111111111'', ''properties'', ''view'', ''own'', ''cl'')', '23505', 'fila de país duplicada choca');
SELECT chk((SELECT count(*) FROM user_scope_overrides) = 2, 'los intentos fallidos no dejaron filas');
COMMIT;

\echo '=== CHECK (check_violation 23514) ==='
BEGIN; :servidor
SELECT expect_err('INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES (''11111111-1111-1111-1111-111111111111'', ''leads'', ''x'', ''own'')', '23514', 'kind inválido falla');
SELECT expect_err('INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES (''11111111-1111-1111-1111-111111111111'', ''leads'', ''view'', ''x'')', '23514', 'scope inválido falla');
SELECT expect_err('INSERT INTO user_scope_overrides (user_id, resource, kind, scope, country) VALUES (''11111111-1111-1111-1111-111111111111'', ''leads'', ''view'', ''own'', ''fr'')', '23514', 'country inválido falla');
COMMIT;

\echo '=== Borrar el perfil borra sus filas (ON DELETE CASCADE) ==='
DELETE FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT chk((SELECT count(*) FROM user_scope_overrides) = 0, 'filas borradas en cascada');

\echo '=== Resumen ==='
SELECT 'comprobaciones: ' || count(*) || ', FALLO: ' || count(*) FILTER (WHERE NOT ok) || ' (debe ser 0)' FROM t_res;
