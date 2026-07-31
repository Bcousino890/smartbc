-- ============================================================================
-- SmartBC · API pública de integraciones (v1)
-- ============================================================================
-- Hasta ahora ningún sistema externo podía ESCRIBIR en SmartBC: cada
-- integración se resolvió con su propio secreto (CRON_SECRET, HMAC de la
-- extensión de Idealista, token compartido de Zinto, OAuth de MercadoLibre en
-- app_settings). No había tabla de credenciales, ni log de peticiones, ni
-- idempotencia.
--
-- Esta migración crea la base de la API pública `/api/v1`, pensada para que los
-- proveedores EMPUJEN captaciones de Chile con la ficha completa y para que las
-- actualizaciones posteriores se apliquen solas:
--
--   api_clients      · cada sistema externo que nos provee información
--   api_keys         · credenciales rotables (solo se guarda el hash SHA-256)
--   api_requests     · log de auditoría de cada llamada (lo que ve el panel)
--   api_idempotency  · respuestas cacheadas por Idempotency-Key
--
-- Y añade a `captaciones` (y a sus tablas satélite) las columnas de trazabilidad
-- que permiten el upsert: (api_client_id, external_id) es la clave de
-- deduplicación, el mismo patrón que properties_agency_external_id_key usa en
-- la sindicación.
--
-- ⚠️ OJO con dos campos parecidos que NO son lo mismo:
--     captaciones.external_reference → código del PORTAL/CORREDORA (ej. EB-VX1848),
--                                      lo rellena el scraper (ver 0073).
--     captaciones.external_id        → identificador del PROVEEDOR de la API.
--   Ambos se conservan por separado.
--
-- Idempotente: se puede reejecutar sin efectos (post-deploy.sh relanza todas
-- las migraciones en cada invocación).
-- ============================================================================

-- ── api_clients ─────────────────────────────────────────────────────────────
-- default_created_by resuelve que captaciones.created_by es NOT NULL REFERENCES
-- auth.users(id) (ver 0048): el admin elige qué usuario del staff "firma" lo que
-- entra por API, así no hay que relajar la FK ni tocar las políticas RLS de 0065.
CREATE TABLE IF NOT EXISTS api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  country TEXT NOT NULL DEFAULT 'cl' CHECK (country IN ('es', 'cl')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  contact_email TEXT,

  -- Quién "firma" las captaciones que entran por esta integración
  default_created_by UUID NOT NULL REFERENCES auth.users(id),
  -- Pipeline y responsable por defecto (si no, se usa el pipeline default del país)
  default_pipeline_id UUID REFERENCES captacion_pipelines(id) ON DELETE SET NULL,
  default_assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Comportamiento del motor de upsert
  auto_distribute BOOLEAN NOT NULL DEFAULT TRUE,
  overwrite_manual_fields BOOLEAN NOT NULL DEFAULT FALSE,
  match_by_source_url BOOLEAN NOT NULL DEFAULT TRUE,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_api_clients_slug ON api_clients (slug);
CREATE INDEX IF NOT EXISTS idx_api_clients_active ON api_clients (active, country);

-- ── api_keys ────────────────────────────────────────────────────────────────
-- Nunca se guarda la clave en claro. key_prefix es la parte pública (permite
-- localizar la fila con un índice) y key_hash el SHA-256 de la clave completa,
-- que se compara con timingSafeEqual.
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  label TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  last_four TEXT,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['captaciones:read', 'captaciones:write', 'catalogos:read'],
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys (client_id, revoked_at);

-- ── api_requests ────────────────────────────────────────────────────────────
-- Log de auditoría. Se escribe best-effort (nunca bloquea la respuesta) y es lo
-- que se muestra en el detalle del cliente en /admin/integraciones.
CREATE TABLE IF NOT EXISTS api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id UUID REFERENCES api_clients(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  request_id TEXT,
  method TEXT,
  path TEXT,
  status_code INTEGER,
  error_code TEXT,
  error_message TEXT,
  ip TEXT,
  user_agent TEXT,
  idempotency_key TEXT,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER,
  items_total INTEGER NOT NULL DEFAULT 0,
  items_created INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  items_unchanged INTEGER NOT NULL DEFAULT 0,
  items_failed INTEGER NOT NULL DEFAULT 0,
  request_body JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_requests_client_created
  ON api_requests (api_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_requests_created
  ON api_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_requests_errors
  ON api_requests (api_client_id, created_at DESC) WHERE status_code >= 400;

-- ── api_idempotency ─────────────────────────────────────────────────────────
-- El UNIQUE es el check atómico: si el INSERT devuelve 23505, la petición ya se
-- procesó y se reproduce la respuesta guardada (mismo truco que
-- zinto_webhook_deliveries en 0099).
CREATE TABLE IF NOT EXISTS api_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id UUID NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response_body JSONB,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_api_idempotency_key
  ON api_idempotency (api_client_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_created
  ON api_idempotency (created_at DESC);

-- ── Trazabilidad en captaciones ─────────────────────────────────────────────
ALTER TABLE captaciones
  ADD COLUMN IF NOT EXISTS api_client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_payload JSONB,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';

-- Clave de deduplicación del upsert: un proveedor no puede mandar dos veces el
-- mismo external_id, y dos proveedores distintos sí pueden usar el mismo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_captaciones_api_external
  ON captaciones (api_client_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_captaciones_origin
  ON captaciones (origin) WHERE origin <> 'manual';
CREATE INDEX IF NOT EXISTS idx_captaciones_source_url
  ON captaciones (source_url);

COMMENT ON COLUMN captaciones.api_client_id IS 'Cliente de la API pública que creó/actualiza esta captación';
COMMENT ON COLUMN captaciones.external_id IS 'Identificador de la captación en el sistema del PROVEEDOR (clave de upsert). No confundir con external_reference, que es el código de la corredora/portal.';
COMMENT ON COLUMN captaciones.external_source IS 'Slug del cliente API de origen (denormalizado para consultas rápidas)';
COMMENT ON COLUMN captaciones.external_payload IS 'Último payload crudo recibido por API (auditoría y reprocesado)';
COMMENT ON COLUMN captaciones.external_synced_at IS 'Última vez que el proveedor envió datos de esta captación';
COMMENT ON COLUMN captaciones.origin IS 'manual | scrape | api';

-- Sub-recursos: external_id propio para poder actualizar un contacto o una foto
-- concreta sin borrar y recrear toda la colección.
ALTER TABLE captacion_contacts ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE captacion_photos   ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE captacion_photos   ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE captacion_listings ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE captacion_logs     ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_captacion_contacts_external
  ON captacion_contacts (captacion_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_captacion_photos_external
  ON captacion_photos (captacion_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_captacion_photos_source_url
  ON captacion_photos (captacion_id, source_url) WHERE source_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_captacion_listings_external
  ON captacion_listings (captacion_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_captacion_logs_external
  ON captacion_logs (captacion_id, external_id) WHERE external_id IS NOT NULL;

COMMENT ON COLUMN captacion_photos.source_url IS 'URL de origen antes de re-alojar en el bucket; evita volver a descargar la misma foto en cada actualización';

-- captacion_logs.created_by es NOT NULL REFERENCES auth.users(id): los intentos
-- registrados por API los firma el usuario por defecto del cliente, igual que
-- las captaciones.

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- La app accede a estas tablas con el service role (bypassa RLS), así que esto
-- es defensa en profundidad. Solo admin/owner deben poder verlas nunca.
ALTER TABLE api_clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_clients_admin_all" ON api_clients;
CREATE POLICY "api_clients_admin_all" ON api_clients
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "api_keys_admin_all" ON api_keys;
CREATE POLICY "api_keys_admin_all" ON api_keys
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "api_requests_admin_all" ON api_requests;
CREATE POLICY "api_requests_admin_all" ON api_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "api_idempotency_admin_all" ON api_idempotency;
CREATE POLICY "api_idempotency_admin_all" ON api_idempotency
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Triggers de updated_at ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS api_clients_updated_at ON api_clients;
CREATE TRIGGER api_clients_updated_at
  BEFORE UPDATE ON api_clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE api_clients IS 'Sistemas externos autorizados a escribir en SmartBC vía /api/v1';
COMMENT ON TABLE api_keys IS 'Credenciales rotables por cliente API (solo hash SHA-256, nunca en claro)';
COMMENT ON TABLE api_requests IS 'Log de auditoría de la API pública';
COMMENT ON TABLE api_idempotency IS 'Respuestas cacheadas por Idempotency-Key para reintentos seguros';

-- Fuerza a PostgREST a recargar la caché de esquema para que vea las tablas y
-- columnas nuevas (si no: PGRST205 y 500 en todas las rutas).
NOTIFY pgrst, 'reload schema';
