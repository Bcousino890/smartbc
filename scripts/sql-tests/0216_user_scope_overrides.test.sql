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

\echo '=== Se aplica dos veces (idempotente) ==='
\i /tmp/0216.sql
\i /tmp/0216.sql
SELECT 'OK: dos aplicaciones sin error fatal, tabla existe' WHERE to_regclass('public.user_scope_overrides') IS NOT NULL;
SELECT CASE WHEN relrowsecurity THEN 'OK: RLS activada' ELSE 'FALLO: RLS desactivada' END FROM pg_class WHERE oid = 'public.user_scope_overrides'::regclass;
SELECT CASE WHEN count(*) = 0 THEN 'OK: sin políticas' ELSE 'FALLO: hay políticas' END FROM pg_policies WHERE tablename = 'user_scope_overrides';

\echo '=== anon y authenticated no leen ni escriben (esperado: permission denied) ==='
BEGIN; :anon
SELECT * FROM user_scope_overrides;
ROLLBACK;
BEGIN; :anon
INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'own');
ROLLBACK;
BEGIN; :cliente
SELECT * FROM user_scope_overrides;
ROLLBACK;
BEGIN; :cliente
INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'own');
ROLLBACK;
BEGIN; :cliente
UPDATE user_scope_overrides SET scope = 'all';
ROLLBACK;
BEGIN; :cliente
DELETE FROM user_scope_overrides;
ROLLBACK;
SELECT CASE WHEN NOT has_table_privilege('anon', 'user_scope_overrides', 'SELECT,INSERT,UPDATE,DELETE')
             AND NOT has_table_privilege('authenticated', 'user_scope_overrides', 'SELECT,INSERT,UPDATE,DELETE')
            THEN 'OK: anon/authenticated sin privilegios' ELSE 'FALLO: privilegios residuales' END;

\echo '=== service_role inserta ==='
BEGIN; :servidor
WITH i AS (INSERT INTO user_scope_overrides (user_id, resource, kind, scope)
           VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'own') RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: la service role inserta' ELSE 'FALLO: la service role no inserta' END FROM i;
COMMIT;

\echo '=== Unicidad: global duplicada choca (esperado: duplicate key) ==='
BEGIN; :servidor
INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'all');
ROLLBACK;
SELECT CASE WHEN count(*) = 1 THEN 'OK: sigue habiendo una sola fila global' ELSE 'FALLO: ' || count(*) END
  FROM user_scope_overrides WHERE resource = 'properties' AND kind = 'view' AND country IS NULL;

\echo '=== Una global y una de país coexisten; país duplicado choca ==='
BEGIN; :servidor
INSERT INTO user_scope_overrides (user_id, resource, kind, scope, country) VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'all', 'cl');
COMMIT;
SELECT CASE WHEN count(*) = 2 THEN 'OK: global y de país coexisten' ELSE 'FALLO: ' || count(*) END
  FROM user_scope_overrides WHERE resource = 'properties' AND kind = 'view';
BEGIN; :servidor
INSERT INTO user_scope_overrides (user_id, resource, kind, scope, country) VALUES ('11111111-1111-1111-1111-111111111111', 'properties', 'view', 'own', 'cl');
ROLLBACK;

\echo '=== CHECK: kind, scope y country inválidos fallan (esperado: violates check constraint) ==='
BEGIN; :servidor
INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES ('11111111-1111-1111-1111-111111111111', 'leads', 'x', 'own');
ROLLBACK;
BEGIN; :servidor
INSERT INTO user_scope_overrides (user_id, resource, kind, scope) VALUES ('11111111-1111-1111-1111-111111111111', 'leads', 'view', 'x');
ROLLBACK;
BEGIN; :servidor
INSERT INTO user_scope_overrides (user_id, resource, kind, scope, country) VALUES ('11111111-1111-1111-1111-111111111111', 'leads', 'view', 'own', 'fr');
ROLLBACK;
SELECT CASE WHEN count(*) = 0 THEN 'OK: ninguna fila inválida se coló' ELSE 'FALLO: ' || count(*) END
  FROM user_scope_overrides WHERE resource = 'leads';

\echo '=== Borrar el perfil borra sus filas (ON DELETE CASCADE) ==='
DELETE FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT CASE WHEN count(*) = 0 THEN 'OK: filas borradas en cascada' ELSE 'FALLO: quedan ' || count(*) END FROM user_scope_overrides;
