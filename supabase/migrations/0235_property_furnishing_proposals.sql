-- ============================================================================
-- 0235 · Propuesta de mobiliario (amueblamiento virtual) por propiedad.
-- Expediente: docs/changes/2026-10-29-propuesta-amueblada/.
--
--   · property_furnishing_proposals: una fila por propiedad. Estado
--     (borrador / publicada) y textos opcionales del visor; NULL = texto por
--     defecto del código.
--   · property_furnishing_images: una fila por imagen del visor, con su id
--     estable. `after_*` es la propuesta (o la vista limpia del inmueble);
--     `before_*` es la fotografía actual de la MISMA toma. El vínculo entre las
--     dos es la propia fila, nunca el nombre del archivo.
--     `compare` habilita «Comparar» y «Vista doble»; exige `before_*`.
--
-- Archivos en el bucket público `properties-photos`, ruta
-- {property_id}/propuesta/… (como planos y vídeos).
-- El público lo lee el servidor con service role y SOLO si la propuesta está
-- publicada; staff lee y escribe con su sesión (mismo modelo que
-- property_photos). anon no tiene acceso directo.
--
-- Idempotente. Transacción propia. Reversión:
-- docs/changes/2026-10-29-propuesta-amueblada/rollback-0235.sql
-- (borra las filas; los archivos del bucket se quedan).
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS property_furnishing_proposals (
  property_id  uuid        PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  headline     text,
  subtitle     text,
  disclaimer   text,
  published_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS property_furnishing_images (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  position      integer     NOT NULL DEFAULT 0,
  label         text        NOT NULL CHECK (length(btrim(label)) > 0),
  room          text        NOT NULL CHECK (length(btrim(room)) > 0),
  compare       boolean     NOT NULL DEFAULT true,
  after_path    text        NOT NULL UNIQUE,
  after_url     text        NOT NULL CHECK (after_url ~ '^https?://'),
  after_width   integer     NOT NULL CHECK (after_width > 0),
  after_height  integer     NOT NULL CHECK (after_height > 0),
  before_path   text        UNIQUE,
  before_url    text        CHECK (before_url IS NULL OR before_url ~ '^https?://'),
  before_width  integer     CHECK (before_width IS NULL OR before_width > 0),
  before_height integer     CHECK (before_height IS NULL OR before_height > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT property_furnishing_images_before_complete CHECK (
    (before_path IS NULL AND before_url IS NULL)
    OR (before_path IS NOT NULL AND before_url IS NOT NULL)
  ),
  CONSTRAINT property_furnishing_images_compare_needs_before CHECK (
    NOT compare OR before_path IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_property_furnishing_images_property
  ON property_furnishing_images(property_id, position);

ALTER TABLE property_furnishing_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_furnishing_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON property_furnishing_proposals FROM anon;
REVOKE ALL ON property_furnishing_images FROM anon;

DROP POLICY IF EXISTS "property_furnishing_proposals_staff_select" ON property_furnishing_proposals;
CREATE POLICY "property_furnishing_proposals_staff_select"
  ON property_furnishing_proposals FOR SELECT USING (is_staff());
DROP POLICY IF EXISTS "property_furnishing_proposals_staff_write" ON property_furnishing_proposals;
CREATE POLICY "property_furnishing_proposals_staff_write"
  ON property_furnishing_proposals FOR ALL USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "property_furnishing_images_staff_select" ON property_furnishing_images;
CREATE POLICY "property_furnishing_images_staff_select"
  ON property_furnishing_images FOR SELECT USING (is_staff());
DROP POLICY IF EXISTS "property_furnishing_images_staff_write" ON property_furnishing_images;
CREATE POLICY "property_furnishing_images_staff_write"
  ON property_furnishing_images FOR ALL USING (is_staff()) WITH CHECK (is_staff());

COMMIT;
