-- Prueba de la migración 0210 en una base DESECHABLE (nunca en producción).
--
-- Recrea el estado ANTERIOR de las políticas (tal como las dejaron las
-- migraciones 0021, 0029, 0030, 0045 y 0090), reproduce los ataques, aplica la
-- migración y comprueba que quedan cerrados y que lo legítimo sigue pudiendo.
--
--   docker run -d --name tmp-pg --memory 512m -e POSTGRES_PASSWORD=x supabase/postgres:15.8.1.085
--   docker cp supabase/migrations/0210_endurecer_cuentas.sql tmp-pg:/tmp/0210.sql
--   docker cp scripts/sql-tests/0210_endurecer_cuentas.test.sql tmp-pg:/tmp/t.sql
--   docker exec tmp-pg psql -U supabase_admin -h localhost -d postgres -f /tmp/t.sql
--   docker rm -f tmp-pg
--
-- Cada bloque imprime «OK …» o «FALLO …»; no hay ningún FALLO si todo va bien.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

-- La imagen ya trae auth.users; solo falta auth.jwt() si GoTrue aún no ha migrado.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$f$;
CREATE TABLE profiles (
  id uuid PRIMARY KEY, email text, role text DEFAULT 'client', full_name text, phone text,
  country text DEFAULT 'es', countries text[], multi_country boolean DEFAULT false,
  custom_role_id uuid, assigned_advisor_id uuid
);
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  token text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE profiles_country_roles (user_id uuid, country text, role text);
CREATE TABLE custom_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text, matrix jsonb);
CREATE TABLE user_permission_overrides (user_id uuid, resource text, action text, allowed boolean, country text);
CREATE TABLE permission_audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_user_id uuid, event_type text);

-- Privilegios por defecto de Supabase en `public`.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- Estado ANTERIOR de las políticas.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY password_reset_tokens_self_select ON password_reset_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY password_reset_tokens_admin_all ON password_reset_tokens FOR ALL USING (true);
CREATE POLICY password_reset_tokens_service_insert ON password_reset_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY password_reset_tokens_service_update ON password_reset_tokens FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY password_reset_tokens_service_select ON password_reset_tokens FOR SELECT USING (true);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id OR auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id OR auth.jwt() ->> 'role' = 'service_role');

INSERT INTO auth.users (id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO profiles (id, email, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner@x.com', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'cliente@x.com', 'client');

-- Atajos para simular sesiones. PostgREST informa del JWT de las dos maneras
-- (JSON en request.jwt.claims y un valor por claim); auth.uid() de esta imagen
-- solo lee request.jwt.claim.sub, así que se fijan las dos.
\set anon 'SET LOCAL ROLE anon; SET LOCAL request.jwt.claims = ''{"role":"anon"}''; SET LOCAL request.jwt.claim.role = ''anon'';'
\set cliente 'SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = ''{"role":"authenticated","sub":"bbbbbbbb-0000-0000-0000-000000000002"}''; SET LOCAL request.jwt.claim.role = ''authenticated''; SET LOCAL request.jwt.claim.sub = ''bbbbbbbb-0000-0000-0000-000000000002'';'
\set servidor 'SET LOCAL ROLE service_role; SET LOCAL request.jwt.claims = ''{"role":"service_role"}''; SET LOCAL request.jwt.claim.role = ''service_role'';'

\echo '=== ANTES de la migración: los ataques FUNCIONAN (esto demuestra el agujero) ==='
BEGIN; :anon
WITH i AS (INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'tokenFalso', now() + interval '1 day') RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'VULNERABLE: anon inserta un token a nombre del Propietario' ELSE 'no vulnerable' END FROM i;
ROLLBACK;
BEGIN; :cliente
WITH u AS (UPDATE profiles SET role = 'owner' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'VULNERABLE: un cliente se pone role=owner' ELSE 'no vulnerable' END FROM u;
ROLLBACK;
BEGIN; :anon
WITH i AS (INSERT INTO user_permission_overrides VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'usuarios', 'edit', true, NULL) RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'VULNERABLE: anon escribe excepciones de permisos' ELSE 'no vulnerable' END FROM i;
ROLLBACK;

\echo '=== Se aplica la migración (dos veces: debe ser idempotente) ==='
\i /tmp/0210.sql
\i /tmp/0210.sql

\echo '=== DESPUÉS: los ataques quedan cerrados ==='
\set ON_ERROR_STOP off
BEGIN; :anon
INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'tokenFalso', now() + interval '1 day');
ROLLBACK;
BEGIN; :cliente
SELECT 'FALLO: un cliente lee tokens' WHERE EXISTS (SELECT 1 FROM password_reset_tokens);
ROLLBACK;
BEGIN; :cliente
UPDATE profiles SET role = 'owner' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
ROLLBACK;
BEGIN; :cliente
UPDATE profiles SET countries = ARRAY['es','cl'] WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
ROLLBACK;
BEGIN; :cliente
UPDATE profiles SET assigned_advisor_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
ROLLBACK;
BEGIN; :cliente
UPDATE profiles SET email = 'otro@x.com' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
ROLLBACK;
BEGIN; :cliente
DELETE FROM profiles WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
ROLLBACK;
BEGIN; :anon
INSERT INTO user_permission_overrides VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'usuarios', 'edit', true, NULL);
ROLLBACK;
BEGIN; :cliente
SELECT 'FALLO: un cliente lee excepciones de permisos' WHERE EXISTS (SELECT 1 FROM user_permission_overrides);
ROLLBACK;
BEGIN; :cliente
INSERT INTO profiles_country_roles VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'es', 'owner');
ROLLBACK;
BEGIN; :cliente
INSERT INTO profiles (id, email, role) VALUES (gen_random_uuid(), 'nuevo@x.com', 'owner');
ROLLBACK;

\echo '=== DESPUÉS: lo legítimo sigue funcionando ==='
BEGIN; :cliente
WITH u AS (UPDATE profiles SET full_name = 'Ana', phone = '+34600000000' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: el cliente edita su nombre y teléfono' ELSE 'FALLO: el cliente no puede editar su nombre y teléfono' END FROM u;
ROLLBACK;
BEGIN; :cliente
WITH u AS (UPDATE profiles SET role = 'client' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: reenviar el mismo rol no es un cambio' ELSE 'FALLO: reenviar el mismo rol da error' END FROM u;
ROLLBACK;
BEGIN; :servidor
WITH u AS (UPDATE profiles SET role = 'admin', countries = ARRAY['es','cl'], assigned_advisor_id = NULL, email = 'nuevo@x.com' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: la service role cambia columnas de poder' ELSE 'FALLO: la service role no puede' END FROM u;
ROLLBACK;
BEGIN; :servidor
WITH i AS (INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'tokenReal', now() + interval '1 day') RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: la service role crea tokens' ELSE 'FALLO: la service role no crea tokens' END FROM i;
ROLLBACK;
BEGIN; :servidor
WITH i AS (INSERT INTO user_permission_overrides VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'usuarios', 'edit', true, NULL) RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'OK: la service role escribe excepciones' ELSE 'FALLO: la service role no escribe excepciones' END FROM i;
ROLLBACK;
-- Sin claims (psql, GoTrue, handle_new_user): sin restricción
BEGIN;
INSERT INTO profiles (id, email, role) VALUES (gen_random_uuid(), 'staff@x.com', 'advisor');
SELECT 'OK: sin claims (alta por disparador o psql) puede crear cualquier rol';
ROLLBACK;
-- Un perfil nuevo propio como cliente sí
BEGIN; :cliente
INSERT INTO profiles (id, email) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'x@x.com') ON CONFLICT DO NOTHING;
SELECT 'OK: alta propia como cliente permitida (o ya existe)';
ROLLBACK;
