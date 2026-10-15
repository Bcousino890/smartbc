-- Etiquetas (tags) personalizables para propiedades.
--
-- Catálogo propio por país (nombre + color) y asignación N:M a propiedades.
-- Sin superficie pública: el cliente nunca ve estas etiquetas. RLS gruesa
-- "¿es staff?" como el resto de tablas internas (ver 0135); los permisos
-- finos (properties.view/edit/delete) los aplican las rutas de
-- app/api/admin/property-tags.

CREATE TABLE IF NOT EXISTS property_tags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country     text        NOT NULL DEFAULT 'es',
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#B8913E',
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_tags_country_valid CHECK (country IN ('es','cl')),
  CONSTRAINT property_tags_name_len      CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT property_tags_color_hex      CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Un nombre por país, sin distinguir mayúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_tags_country_name
  ON property_tags (country, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS property_tag_links (
  property_id uuid        NOT NULL REFERENCES properties(id)    ON DELETE CASCADE,
  tag_id      uuid        NOT NULL REFERENCES property_tags(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_property_tag_links_tag ON property_tag_links (tag_id);

ALTER TABLE property_tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_tag_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_tags_staff_select ON property_tags;
CREATE POLICY property_tags_staff_select ON property_tags
  FOR SELECT USING (is_staff());
DROP POLICY IF EXISTS property_tags_staff_write ON property_tags;
CREATE POLICY property_tags_staff_write ON property_tags
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS property_tag_links_staff_select ON property_tag_links;
CREATE POLICY property_tag_links_staff_select ON property_tag_links
  FOR SELECT USING (is_staff());
DROP POLICY IF EXISTS property_tag_links_staff_write ON property_tag_links;
CREATE POLICY property_tag_links_staff_write ON property_tag_links
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- ── Seed OPCIONAL (descomentar si se quiere precargar el set inicial) ───────
-- También se puede añadir desde el gestor de etiquetas ("Añadir sugeridas").
-- INSERT INTO property_tags (country, name, color) VALUES
--   ('es', 'Exclusiva',       '#B8913E'),
--   ('es', 'Oportunidad',     '#2E7D5B'),
--   ('es', 'Reformado',       '#2F6FA3'),
--   ('es', 'Bajada de precio','#C2410C'),
--   ('es', 'Off-market',      '#1F1B16'),
--   ('es', 'Inversión',       '#7C3AED')
-- ON CONFLICT DO NOTHING;
