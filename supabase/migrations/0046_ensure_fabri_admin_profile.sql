-- Crea (o asciende) el perfil admin de fabri@bcousinoprop.com.
-- Contexto: la cuenta existe en auth.users (el login autentica), pero le falta
-- la fila en `profiles`, así que el login da "La cuenta no tiene perfil asociado".
-- El backfill de 0044 no llegó a aplicarse (sus deploys fallaban en el build, y
-- además 0044 incluye un COMMENT sobre una función que puede no existir y aborta
-- la migración). Esta es independiente, idempotente y sin dependencias: lee el id
-- desde auth.users por email y hace upsert del perfil con rol admin.
INSERT INTO profiles (id, email, role, full_name, country, created_at, updated_at)
SELECT
  u.id,
  u.email,
  'admin'::user_role,
  'Fabri Rodríguez',
  'es',
  now(),
  now()
FROM auth.users u
WHERE u.email = 'fabri@bcousinoprop.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin'::user_role,
  updated_at = now();
