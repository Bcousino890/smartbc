-- ============================================================================
-- SmartBC · Viewing Collections & Itineraries — núcleo
-- ============================================================================
-- Cinco tablas nuevas. NO modifica property_shares, visit_requests ni
-- properties: el módulo solo apunta hacia ellas con FK nullable.
--
--   client_property_selections  · la curación del agente (sin fecha)
--   viewing_itineraries         · la jornada de visitas
--   viewing_stops               · la parada (orden + hora + confirmación)
--   viewing_collection_shares   · el enlace público con token
--   viewing_collection_opens    · aperturas registradas en servidor
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
--
-- Verificado contra el esquema vivo el 2026-08-15:
--   · pgcrypto instalada (gen_random_uuid / gen_random_bytes)
--   · is_staff(), is_admin(), set_updated_at() existen en public
--   · user_role incluye owner, agent_* y captadora
--   · sin PostGIS
-- ============================================================================

-- ── 1 · client_property_selections ──────────────────────────────────────────
-- Responde a "¿qué propiedades ha elegido el equipo para este cliente?".
-- Es independiente de cualquier fecha: una propiedad puede estar seleccionada
-- sin pertenecer todavía a ningún itinerario.
--
-- property_id es ON DELETE RESTRICT, no CASCADE: el historial comercial (qué
-- se le enseñó a quién) no debe desaparecer por un efecto colateral.
CREATE TABLE IF NOT EXISTS client_property_selections (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  property_id  uuid        NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  status       text        NOT NULL DEFAULT 'selected',
  source       text        NOT NULL DEFAULT 'manual',
  added_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  agent_notes  text,
  country      text        NOT NULL DEFAULT 'es',
  added_at     timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Hace que "añadir a la selección" sea idempotente: pulsar dos veces no
  -- duplica, actualiza.
  CONSTRAINT cps_unique_client_property UNIQUE (client_id, property_id),
  CONSTRAINT cps_status_valid  CHECK (status IN ('selected','interested','discarded')),
  CONSTRAINT cps_source_valid  CHECK (source IN ('suggestion','favorite','search','manual')),
  CONSTRAINT cps_country_valid CHECK (country IN ('es','cl'))
);

CREATE INDEX IF NOT EXISTS idx_cps_client_status
  ON client_property_selections(client_id, status);
CREATE INDEX IF NOT EXISTS idx_cps_property
  ON client_property_selections(property_id);
CREATE INDEX IF NOT EXISTS idx_cps_country
  ON client_property_selections(country);

DROP TRIGGER IF EXISTS cps_updated_at ON client_property_selections;
CREATE TRIGGER cps_updated_at BEFORE UPDATE ON client_property_selections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2 · viewing_itineraries ─────────────────────────────────────────────────
-- Una jornada concreta de visitas. scheduled_date es NULLABLE a propósito: el
-- agente debe poder guardar un borrador antes de saber el día.
CREATE TABLE IF NOT EXISTS viewing_itineraries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          text,
  scheduled_date date,
  window_start   time,
  window_end     time,
  timezone       text        NOT NULL DEFAULT 'Europe/Madrid',
  country        text        NOT NULL DEFAULT 'es',
  status         text        NOT NULL DEFAULT 'draft',
  created_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vi_status_valid  CHECK (status IN
    ('draft','published','completed','cancelled','archived')),
  CONSTRAINT vi_country_valid CHECK (country IN ('es','cl')),
  -- El título lo ve el cliente en la colección pública.
  CONSTRAINT vi_title_len     CHECK (title IS NULL OR char_length(title) <= 80),
  CONSTRAINT vi_window_order  CHECK (
    window_start IS NULL OR window_end IS NULL OR window_end > window_start
  )
);

CREATE INDEX IF NOT EXISTS idx_vi_client_date
  ON viewing_itineraries(client_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_vi_active
  ON viewing_itineraries(status) WHERE status IN ('draft','published');
CREATE INDEX IF NOT EXISTS idx_vi_country
  ON viewing_itineraries(country);

DROP TRIGGER IF EXISTS vi_updated_at ON viewing_itineraries;
CREATE TRIGGER vi_updated_at BEFORE UPDATE ON viewing_itineraries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3 · viewing_stops ───────────────────────────────────────────────────────
-- NO hay property_id: la propiedad se deriva por selection_id. Con dos rutas
-- hacia la propiedad podrían divergir; con una, no. Además hace estructural
-- el invariante "un itinerario usa un subconjunto de la selección".
--
-- position: enteros espaciados de 100 en 100, SIN constraint UNIQUE. Reordenar
-- con drag & drop escribe UNA sola fila (el punto medio entre vecinos) en vez
-- de renumerar el itinerario entero.
CREATE TABLE IF NOT EXISTS viewing_stops (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id        uuid        NOT NULL REFERENCES viewing_itineraries(id)        ON DELETE CASCADE,
  selection_id        uuid        NOT NULL REFERENCES client_property_selections(id) ON DELETE RESTRICT,
  position            integer     NOT NULL,
  scheduled_at        timestamptz,
  duration_minutes    integer     DEFAULT 30,
  confirmation_status text        NOT NULL DEFAULT 'pending',
  address_visibility  text        NOT NULL DEFAULT 'area_only',
  hidden_from_client  boolean     NOT NULL DEFAULT false,
  visit_request_id    uuid        REFERENCES visit_requests(id)  ON DELETE SET NULL,
  property_share_id   uuid        REFERENCES property_shares(id) ON DELETE SET NULL,
  agent_notes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vs_unique_itinerary_selection UNIQUE (itinerary_id, selection_id),
  CONSTRAINT vs_confirmation_valid CHECK (confirmation_status IN
    ('pending','proposed','confirmed','declined','cancelled','completed')),
  CONSTRAINT vs_address_vis_valid  CHECK (address_visibility IN ('area_only','exact')),
  CONSTRAINT vs_duration_sane      CHECK (
    duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 480)
  ),
  CONSTRAINT vs_position_positive  CHECK (position > 0),

  -- La dirección exacta exige visita confirmada o completada.
  -- ⚠️ Efecto buscado: cancelar una parada que tenga 'exact' FALLA salvo que
  -- el mismo UPDATE devuelva address_visibility a 'area_only'. Es decir,
  -- cancelar revierte la exposición de la dirección automáticamente. Las
  -- actions deben escribir ambas columnas juntas (ver updateStopConfirmation).
  CONSTRAINT vs_exact_address_requires_confirmation CHECK (
    address_visibility = 'area_only'
    OR confirmation_status IN ('confirmed','completed')
  ),

  -- Ocultar una parada al cliente solo tiene sentido si se ha caído.
  CONSTRAINT vs_hidden_requires_cancelled CHECK (
    hidden_from_client = false
    OR confirmation_status IN ('cancelled','declined')
  )
);

CREATE INDEX IF NOT EXISTS idx_vs_itinerary_position
  ON viewing_stops(itinerary_id, position);
CREATE INDEX IF NOT EXISTS idx_vs_selection
  ON viewing_stops(selection_id);
CREATE INDEX IF NOT EXISTS idx_vs_visit_request
  ON viewing_stops(visit_request_id) WHERE visit_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vs_property_share
  ON viewing_stops(property_share_id) WHERE property_share_id IS NOT NULL;

DROP TRIGGER IF EXISTS vs_updated_at ON viewing_stops;
CREATE TRIGGER vs_updated_at BEFORE UPDATE ON viewing_stops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4 · viewing_collection_shares ───────────────────────────────────────────
-- Hermana deliberada de property_shares: mismo mecanismo de token, misma RLS.
-- Dos diferencias:
--   · expires_at es NOT NULL (en property_shares es nullable y nunca se usa).
--     Una colección expone la estrategia comercial completa con un cliente;
--     eso no puede vivir en un enlace eterno.
--   · itinerary_id es ON DELETE RESTRICT, no CASCADE: publicar crea un share,
--     y con un share el borrado físico del itinerario queda bloqueado. Así la
--     política de "el historial comercial no se borra" es estructural en vez
--     de una regla que alguien tiene que recordar.
CREATE TABLE IF NOT EXISTS viewing_collection_shares (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid        NOT NULL REFERENCES viewing_itineraries(id) ON DELETE RESTRICT,
  token        text        NOT NULL UNIQUE,
  label        text,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vcs_token_len   CHECK (char_length(token) >= 24),
  CONSTRAINT vcs_expiry_sane CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vcs_token
  ON viewing_collection_shares(token);
CREATE INDEX IF NOT EXISTS idx_vcs_itinerary
  ON viewing_collection_shares(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_vcs_active
  ON viewing_collection_shares(itinerary_id, expires_at) WHERE revoked_at IS NULL;

-- ── 5 · viewing_collection_opens ────────────────────────────────────────────
-- Aperturas registradas en SERVIDOR: no las bloquea un ad-blocker, a
-- diferencia de page_views. Miden cosas distintas y por eso conviven.
-- ip y user_agent son datos SENSIBLES: solo staff, nunca superficie pública.
CREATE TABLE IF NOT EXISTS viewing_collection_opens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id   uuid        NOT NULL REFERENCES viewing_collection_shares(id) ON DELETE CASCADE,
  opened_at  timestamptz NOT NULL DEFAULT now(),
  ip         text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_vco_share
  ON viewing_collection_opens(share_id, opened_at DESC);
