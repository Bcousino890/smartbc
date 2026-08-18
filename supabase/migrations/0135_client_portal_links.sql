-- ============================================================================
-- SmartBC · Enlaces de portales en la ficha del cliente
-- ============================================================================
-- El paso que faltaba ANTES de la selección: el piso que se ve con el cliente
-- en Idealista (o en la web de otra inmobiliaria) todavía no es una ficha
-- nuestra, así que no cabe en `client_property_selections`, que exige un
-- `property_id` real. Aquí vive esa fase intermedia:
--
--   se selecciona en el portal → se llama → o se descarta o se crea la ficha
--   → y ya sí entra en la selección y en el itinerario.
--
-- Dos tablas:
--   client_portal_links        · el anuncio externo (url + datos capturados)
--   client_portal_link_notes   · el registro de llamadas, en orden
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

-- ── 1 · client_portal_links ─────────────────────────────────────────────────
-- `url_key` es la URL normalizada (sin querystring de tracking, sin barra
-- final, sin www) y es lo que deduplica: la extensión puede reenviar la misma
-- página de resultados dos veces sin crear duplicados, y el mismo anuncio
-- copiado desde el móvil y desde el escritorio cae en la misma fila.
--
-- `property_id` es ON DELETE SET NULL, no CASCADE: si algún día se borra la
-- ficha importada, el enlace y su historial de llamadas siguen ahí.
CREATE TABLE IF NOT EXISTS client_portal_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  url               text        NOT NULL,
  url_key           text        NOT NULL,
  portal            text        NOT NULL DEFAULT 'other',
  external_ref      text,

  -- Datos capturados del anuncio. Todos opcionales: un enlace pegado a mano
  -- puede no traer nada más que la URL, y eso ya es útil para llamar.
  title             text,
  price             numeric(12,2),
  price_label       text,
  operation         text,
  zone              text,
  bedrooms          smallint,
  bathrooms         smallint,
  square_meters     integer,
  image_url         text,

  -- A quién se llama. Sale del propio anuncio (o lo escribe el agente).
  contact_name      text,
  contact_phone     text,

  status            text        NOT NULL DEFAULT 'pending',
  -- 🔒 INTERNO. Nunca sale al cliente: esta tabla no tiene superficie pública.
  notes             text,
  -- "este lo podemos ver mañana a las 12" — lo que luego alimenta el itinerario.
  proposed_visit_at timestamptz,

  assigned_to       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  added_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  last_called_at    timestamptz,

  property_id       uuid        REFERENCES properties(id) ON DELETE SET NULL,
  country           text        NOT NULL DEFAULT 'es',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cpl_unique_client_url UNIQUE (client_id, url_key),
  CONSTRAINT cpl_status_valid CHECK (status IN
    ('pending','no_answer','callback','to_visit','discarded','converted')),
  CONSTRAINT cpl_country_valid   CHECK (country IN ('es','cl')),
  CONSTRAINT cpl_operation_valid CHECK (operation IS NULL OR operation IN ('rent','sale')),
  CONSTRAINT cpl_url_scheme      CHECK (url ~* '^https?://'),
  CONSTRAINT cpl_url_len         CHECK (char_length(url) <= 2000),
  CONSTRAINT cpl_url_key_len     CHECK (char_length(url_key) BETWEEN 1 AND 2000),
  CONSTRAINT cpl_notes_len       CHECK (notes IS NULL OR char_length(notes) <= 4000),

  -- 'converted' no es un estado que se elija en un desplegable: significa
  -- "esto ya es una ficha nuestra", y sin ficha vinculada sería mentira.
  -- Por eso la UI no lo ofrece y solo lo escribe vincularPropiedad().
  CONSTRAINT cpl_converted_requires_property CHECK (
    status <> 'converted' OR property_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_cpl_client_created
  ON client_portal_links(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpl_status
  ON client_portal_links(client_id, status);
CREATE INDEX IF NOT EXISTS idx_cpl_assigned
  ON client_portal_links(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpl_property
  ON client_portal_links(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpl_country
  ON client_portal_links(country);

DROP TRIGGER IF EXISTS cpl_updated_at ON client_portal_links;
CREATE TRIGGER cpl_updated_at BEFORE UPDATE ON client_portal_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2 · client_portal_link_notes ────────────────────────────────────────────
-- El registro de llamadas: "no acepta contratos de más de 11 meses",
-- "este lo podemos ver mañana". Es un HILO, no un campo: quien llama después
-- necesita leer lo que dijo el anterior, no pisarlo.
--
-- `status_after` guarda en qué estado quedó el enlace tras esa nota, para que
-- el hilo se lea solo ("llamé → no contesta → volví a llamar → para visitar").
CREATE TABLE IF NOT EXISTS client_portal_link_notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id      uuid        NOT NULL REFERENCES client_portal_links(id) ON DELETE CASCADE,
  author_id    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  kind         text        NOT NULL DEFAULT 'call',
  body         text        NOT NULL,
  status_after text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cpln_kind_valid CHECK (kind IN ('call','note','status')),
  CONSTRAINT cpln_body_len   CHECK (char_length(body) BETWEEN 1 AND 2000),
  CONSTRAINT cpln_status_valid CHECK (status_after IS NULL OR status_after IN
    ('pending','no_answer','callback','to_visit','discarded','converted'))
);

CREATE INDEX IF NOT EXISTS idx_cpln_link
  ON client_portal_link_notes(link_id, created_at DESC);

-- ── 3 · RLS ─────────────────────────────────────────────────────────────────
-- Mismo criterio que Viewing Collections (ver 0127): RLS gruesa "¿es staff?"
-- y el scope own/team/all resuelto en TypeScript, para no tener dos fuentes de
-- verdad de la misma regla. Estas tablas NO tienen superficie pública: el
-- cliente nunca ve enlaces de la competencia ni notas internas.
ALTER TABLE client_portal_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_link_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpl_staff_select ON client_portal_links;
CREATE POLICY cpl_staff_select ON client_portal_links
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS cpl_staff_write ON client_portal_links;
CREATE POLICY cpl_staff_write ON client_portal_links
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS cpln_staff_select ON client_portal_link_notes;
CREATE POLICY cpln_staff_select ON client_portal_link_notes
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS cpln_staff_write ON client_portal_link_notes;
CREATE POLICY cpln_staff_write ON client_portal_link_notes
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());
