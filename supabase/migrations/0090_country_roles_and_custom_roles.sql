-- Rol por país y roles personalizados (Fase 3 avanzada del plan de permisos
-- multi-país). Aditivo e idempotente, sin tocar el enum `user_role` para no
-- introducir un ALTER TYPE ADD VALUE en el VPS (operación no transaccional
-- con implicaciones de bloqueo); ambas features se apoyan en tablas nuevas.

-- ─── Rol por país ───────────────────────────────────────────────────────────
-- Permite que un usuario con acceso a varios países (profiles.countries)
-- tenga un rol distinto en cada uno (ej. agent_senior en Chile, agent_junior
-- en España) sin tener que subir/bajar su rol global. Si no existe fila para
-- (user_id, country), se sigue usando profiles.role como hasta ahora.
CREATE TABLE IF NOT EXISTS profiles_country_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  country text NOT NULL CHECK (country IN ('es', 'cl')),
  role user_role NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, country)
);

CREATE INDEX IF NOT EXISTS idx_profiles_country_roles_user
ON profiles_country_roles(user_id);

COMMENT ON TABLE profiles_country_roles IS
'Rol efectivo de un usuario para un país concreto, cuando difiere de profiles.role. Sin fila = usa profiles.role.';

-- ─── Roles personalizados ───────────────────────────────────────────────────
-- Matrices de permisos definibles desde la UI sin tocar código. `matrix` es
-- una PermissionMatrix serializada (lib/permissions.ts): un objeto por cada
-- PermissionResource con sus 5 PermissionAction en booleano.
CREATE TABLE IF NOT EXISTS custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  matrix jsonb NOT NULL,
  based_on text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE custom_roles IS
'Matrices de permisos personalizadas, asignables a perfiles vía profiles.custom_role_id.';
COMMENT ON COLUMN custom_roles.based_on IS
'Rol base del que se clonó al crearlo (solo informativo, para mostrar en la UI).';

-- `custom_role_id`, cuando no es NULL, hace que la matriz de permisos del
-- usuario venga de custom_roles.matrix en vez de PERMISSIONS_BY_ROLE[role].
-- `role` se conserva intacto: sigue gobernando el acceso staff/país
-- (isStaffRole, middleware) y sirve de plantilla de partida en la UI.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES custom_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_custom_role_id
ON profiles(custom_role_id)
WHERE custom_role_id IS NOT NULL;
