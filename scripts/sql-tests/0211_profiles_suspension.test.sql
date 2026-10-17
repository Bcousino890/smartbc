-- Prueba de la migración 0211 (suspensión de cuentas) en una base DESECHABLE.
--
--   docker run -d --name tmp-pg --memory 512m -e POSTGRES_PASSWORD=x supabase/postgres:15.8.1.085
--   docker cp supabase/migrations/0211_profiles_suspension.sql tmp-pg:/tmp/0211.sql
--   docker cp scripts/sql-tests/0211_profiles_suspension.test.sql tmp-pg:/tmp/t.sql
--   docker exec tmp-pg psql -U supabase_admin -h localhost -d postgres -f /tmp/t.sql
--   docker rm -f tmp-pg
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

CREATE TABLE IF NOT EXISTS profiles (id uuid PRIMARY KEY, email text, role text DEFAULT 'client', phone text);
GRANT ALL ON profiles TO anon, authenticated, service_role;
INSERT INTO profiles (id, email, role) VALUES ('11111111-1111-1111-1111-111111111111', 'a@x.com', 'advisor');

-- Tablas de sesión de GoTrue (la imagen no las trae hasta que GoTrue migra).
CREATE TABLE IF NOT EXISTS auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid);
INSERT INTO auth.sessions (user_id) VALUES ('11111111-1111-1111-1111-111111111111'), ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO auth.refresh_tokens (user_id) VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

\set anon 'SET LOCAL ROLE anon; SET LOCAL request.jwt.claims = ''{"role":"anon"}''; SET LOCAL request.jwt.claim.role = ''anon'';'
\set cliente 'SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = ''{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}''; SET LOCAL request.jwt.claim.role = ''authenticated''; SET LOCAL request.jwt.claim.sub = ''11111111-1111-1111-1111-111111111111'';'
\set servidor 'SET LOCAL ROLE service_role; SET LOCAL request.jwt.claims = ''{"role":"service_role"}''; SET LOCAL request.jwt.claim.role = ''service_role'';'

\echo '=== Se aplica dos veces (idempotente) ==='
\i /tmp/0211.sql
\i /tmp/0211.sql

\echo '=== Disparador: solo el servidor cambia suspended_at ==='
BEGIN; :cliente
UPDATE profiles SET suspended_at = now() WHERE id = '11111111-1111-1111-1111-111111111111';
ROLLBACK;
BEGIN; :servidor
WITH u AS (UPDATE profiles SET suspended_at = now() WHERE id = '11111111-1111-1111-1111-111111111111' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: la service role suspende' ELSE 'FALLO: la service role no puede suspender' END FROM u;
COMMIT;
BEGIN; :cliente
UPDATE profiles SET suspended_at = NULL WHERE id = '11111111-1111-1111-1111-111111111111';
ROLLBACK;
BEGIN; :cliente
WITH u AS (UPDATE profiles SET phone = '+34600000000' WHERE id = '11111111-1111-1111-1111-111111111111' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: una cuenta suspendida sigue pudiendo editar otros campos propios (no es el sitio de cortar eso)' ELSE 'FALLO' END FROM u;
ROLLBACK;
BEGIN; :servidor
UPDATE profiles SET suspended_at = NULL WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT 'OK: la service role reactiva';
COMMIT;

\echo '=== revoke_user_sessions ==='
BEGIN; :cliente
SELECT public.revoke_user_sessions('11111111-1111-1111-1111-111111111111');
ROLLBACK;
BEGIN; :anon
SELECT public.revoke_user_sessions('11111111-1111-1111-1111-111111111111');
ROLLBACK;
BEGIN; :servidor
SELECT 'revocadas (esperado 3 = 2 sesiones + 1 refresh token): ' || public.revoke_user_sessions('11111111-1111-1111-1111-111111111111');
COMMIT;
-- La service role no lee auth.sessions directamente; se comprueba como superusuario.
SELECT 'sesiones que quedan del usuario (esperado 0): ' || count(*) FROM auth.sessions WHERE user_id = '11111111-1111-1111-1111-111111111111';
SELECT 'sesiones de OTRO usuario intactas (esperado 1): ' || count(*) FROM auth.sessions WHERE user_id = '22222222-2222-2222-2222-222222222222';
SELECT 'refresh tokens de OTRO usuario intactos (esperado 1): ' || count(*) FROM auth.refresh_tokens WHERE user_id = '22222222-2222-2222-2222-222222222222';
\echo '=== tolera GoTrue sin esas tablas ==='
DROP TABLE auth.refresh_tokens;
DROP TABLE auth.sessions;
BEGIN; :servidor
SELECT 'sin tablas, devuelve: ' || public.revoke_user_sessions('11111111-1111-1111-1111-111111111111');
COMMIT;
