-- SOLO PRUEBAS LOCALES (Postgres desechable de run-local.sh). Lo ejecuta ../simular-en-local.sh.
\set ON_ERROR_STOP 1
-- Columnas reales de idealista_listings que no tiene el stub (0017/0019).
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS address_street text;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS address_city text;
INSERT INTO auth.users (id, email) VALUES
 ('a1000000-0000-0000-0000-000000000001','admin-qa@test'),('a1000000-0000-0000-0000-000000000002','qa1@test'),
 ('a1000000-0000-0000-0000-000000000003','qa2@test'),('a1000000-0000-0000-0000-000000000004','cliente-qa@test'),
 ('a1000000-0000-0000-0000-000000000005','cliente-uno@test');
INSERT INTO profiles (id, role, full_name, email, phone, country) VALUES
 ('a1000000-0000-0000-0000-000000000001','admin','Admin QA','admin-qa@test',NULL,'es'),
 ('a1000000-0000-0000-0000-000000000002','advisor','Asesor QA 1','qa1@test',NULL,'es'),
 ('a1000000-0000-0000-0000-000000000003','advisor','Asesor QA 2','qa2@test',NULL,'es'),
 ('a1000000-0000-0000-0000-000000000004','client','QA Cliente Dos','cliente-qa@test','+34 600 990 002','es'),
 ('a1000000-0000-0000-0000-000000000005','client','QA Persona Uno','cliente-uno@test','+34 600 990 001','es');
