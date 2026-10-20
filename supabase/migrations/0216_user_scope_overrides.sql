-- ─────────────────────────────────────────────────────────────────────────────
-- 0216 — Alcance por sección (Ver / Editar) por persona
--
-- Excepciones del alcance de datos de cada persona: para un recurso (sección) y
-- un tipo (`view` = Ver, `edit` = Editar) fijan si ve/edita TODO ('all') o solo
-- lo SUYO ('own'). `country` NULL = aplica a todos sus países; 'es'/'cl' =
-- solo ese país (gana sobre la global, como en `user_permission_overrides`).
--
-- Acceso: SOLO la service role (la aplicación). RLS activada SIN políticas y
-- sin permisos para anon/authenticated, igual que en 0210.
--
-- Migración ADITIVA e IDEMPOTENTE: se puede re-ejecutar sin romper datos.
-- SQL estándar de PostgreSQL (psql dentro del contenedor `supabase-db`).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_scope_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource   text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('view', 'edit')),
  scope      text NOT NULL CHECK (scope IN ('all', 'own')),
  country    text CHECK (country IS NULL OR country IN ('es', 'cl')),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Unicidad con dimensión de país (mismo patrón que 0088).
CREATE UNIQUE INDEX IF NOT EXISTS uq_uso_global
  ON user_scope_overrides (user_id, resource, kind)
  WHERE country IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_uso_country
  ON user_scope_overrides (user_id, resource, kind, country)
  WHERE country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uso_user_id
  ON user_scope_overrides (user_id);

-- Solo la service role (ignora RLS): sin políticas y sin permisos de tabla.
ALTER TABLE user_scope_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_scope_overrides FROM anon, authenticated;
