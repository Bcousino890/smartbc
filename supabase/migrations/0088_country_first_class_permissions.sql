-- ─────────────────────────────────────────────────────────────────────────────
-- 0088 — País como primera clase + permisos por país
--
-- Fase 1: elevamos el país a "primera clase" en el modelo de datos.
--   - `profiles.countries`: conjunto de países a los que el usuario tiene acceso.
--     `profiles.country` sigue siendo el país por defecto/landing.
--   - `user_permission_overrides.country`: dimensión opcional de país para las
--     excepciones de permiso (NULL = aplica a todos los países).
--
-- Migración ADITIVA e IDEMPOTENTE: se puede re-ejecutar sin romper datos.
-- NO usa tipos/funciones específicas de Supabase Cloud (solo SQL estándar de
-- PostgreSQL, aplicable con psql dentro del contenedor `supabase-db` del VPS).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1) profiles.countries ────────────────────────────────────────────────────
-- Conjunto de países con acceso para el usuario. Por defecto vacío; se rellena
-- en el backfill de más abajo. `country` (migración 0038) se mantiene como país
-- por defecto/landing del perfil.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}'::text[];


-- ── 2) Backfill idempotente de profiles.countries ────────────────────────────
-- Rellenamos `countries` a partir de los datos existentes:
--   - usuarios multi-país (multi_country = true)  → ambos mercados ['es','cl']
--   - resto                                        → solo su país [country]
-- Solo tocamos filas aún sin poblar (countries = '{}') para poder re-ejecutar
-- la migración sin sobrescribir cambios posteriores.
UPDATE profiles
SET countries = CASE
    WHEN COALESCE(multi_country, false) THEN ARRAY['es', 'cl']::text[]
    ELSE ARRAY[COALESCE(country, 'es')]::text[]
  END
WHERE countries = '{}'::text[];


-- ── 3) Índice GIN sobre profiles.countries ───────────────────────────────────
-- Acelera consultas del tipo `countries @> ARRAY['cl']` / `'cl' = ANY(countries)`.
CREATE INDEX IF NOT EXISTS idx_profiles_countries
  ON profiles USING gin(countries);


-- ── 4) user_permission_overrides.country ─────────────────────────────────────
-- Dimensión de país para las excepciones de permiso.
--   NULL       = override global (aplica a todos los países del usuario)
--   'es'/'cl'  = override específico de ese país (sobrescribe al global)
ALTER TABLE user_permission_overrides
  ADD COLUMN IF NOT EXISTS country text;

-- CHECK opcional para restringir los valores válidos. Se añade sólo si no existe
-- todavía (idempotente). Permite NULL; sólo valida cuando hay valor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_permission_overrides'::regclass
      AND conname = 'user_permission_overrides_country_check'
  ) THEN
    ALTER TABLE user_permission_overrides
      ADD CONSTRAINT user_permission_overrides_country_check
      CHECK (country IS NULL OR country IN ('es', 'cl'));
  END IF;
END $$;


-- ── 5) Unicidad con dimensión de país ────────────────────────────────────────
-- El UNIQUE(user_id, resource, action) original impide tener una fila global
-- (country NULL) y otra por país para el mismo recurso/acción. Lo eliminamos y
-- lo sustituimos por dos índices únicos parciales:
--   - uq_upo_global : una sola fila global por (user_id, resource, action)
--   - uq_upo_country: una sola fila por país (user_id, resource, action, country)
-- Todo con guardas IF EXISTS / IF NOT EXISTS para ser idempotente.
ALTER TABLE user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_user_id_resource_action_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_upo_global
  ON user_permission_overrides(user_id, resource, action)
  WHERE country IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_upo_country
  ON user_permission_overrides(user_id, resource, action, country)
  WHERE country IS NOT NULL;
