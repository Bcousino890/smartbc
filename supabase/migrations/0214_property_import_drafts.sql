-- ============================================================================
-- 0214 · BCP-01 P5: borradores de importación (enlace o PDF → borrador privado
-- → confirmación humana → ficha) y alertas a clientes apagadas por defecto.
-- Expediente: docs/changes/2026-10-18-bcp-01-buscar-e-importar/ (I-10 a I-16).
--
-- · properties.new_listing_alerts_suppressed (boolean, false por defecto): la
--   importación la pone a true salvo que se marque «Avisar por correo» al
--   confirmar. El cron de alertas (getSuggestedProperties con createdAfter) se
--   salta esas fichas. Ningún otro camino de alta cambia (valor por defecto).
-- · property_import_drafts: el borrador. NO es una fila de properties: no sale
--   en Propiedades, catálogos, alertas ni en la web. Solo service_role (RLS
--   activada sin políticas); el servidor filtra siempre por created_by.
-- · Funciones (solo service_role, SECURITY INVOKER):
--     import_draft_create_property — bloquea el borrador e inserta la ficha
--       UNA vez (doble clic, reintento o dos pestañas → la misma ficha);
--     import_draft_use_existing / import_draft_update_existing — duplicados:
--       usar la existente (no escribe en ella) o actualizar campos concretos
--       con comprobación de updated_at (sin tocar estado, fotos ni created_at);
--     import_draft_add_photo / import_draft_attach_photo — fotos del borrador y
--       de la ficha, idempotentes;
--     import_draft_set_step — estado de cada paso (fotos, catálogo, cliente).
-- · Bucket privado property-import-drafts (fotos de los PDF antes de confirmar).
--
-- Idempotente. Reversión: docs/changes/2026-10-18-bcp-01-buscar-e-importar/rollback-0214.sql
-- (se pierden los borradores pendientes y la marca de supresión). El build
-- anterior no lee nada de esto; la columna nueva tiene valor por defecto.
-- ============================================================================

BEGIN;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS new_listing_alerts_suppressed boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN properties.new_listing_alerts_suppressed IS
  'BCP-01 P5: true = el cron de alertas de propiedades nuevas no la anuncia (importaciones sin «Avisar por correo»).';

CREATE TABLE IF NOT EXISTS property_import_drafts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  country              text        NOT NULL DEFAULT 'es',
  source_kind          text        NOT NULL,
  -- Enlace: la URL del anuncio. PDF: el nombre del archivo.
  source_url           text,
  source_name          text,
  -- PDF: sha-256 del archivo. Junto con source_part identifica la vivienda.
  source_hash          text,
  source_part          integer,
  -- Clave de idempotencia del navegador al crear el borrador.
  request_key          text        NOT NULL,
  -- Lo extraído (servidor en enlaces; navegador en PDF, con su prueba por campo).
  extracted            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Lo que la persona revisa y corrige.
  fields               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Fotos del borrador en orden: [{id, kind: remote|upload, …, selected, cover}].
  photos               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  agency_id            uuid        REFERENCES agencies(id) ON DELETE SET NULL,
  notify_clients       boolean     NOT NULL DEFAULT false,
  catalog_id           uuid        REFERENCES catalogs(id) ON DELETE SET NULL,
  portal_link_id       uuid,
  state                text        NOT NULL DEFAULT 'review',
  duplicate_choice     text,
  property_id          uuid        REFERENCES properties(id) ON DELETE SET NULL,
  steps                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  version              integer     NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL DEFAULT now() + interval '30 days',
  CONSTRAINT pid_country_ok   CHECK (country IN ('es', 'cl')),
  CONSTRAINT pid_kind_ok      CHECK (source_kind IN ('link', 'pdf')),
  CONSTRAINT pid_state_ok     CHECK (state IN ('review', 'created', 'done', 'discarded')),
  CONSTRAINT pid_choice_ok    CHECK (duplicate_choice IS NULL OR duplicate_choice IN ('new', 'existing', 'update')),
  CONSTRAINT pid_created_prop CHECK (state IN ('review', 'discarded') OR property_id IS NOT NULL),
  CONSTRAINT pid_request_len  CHECK (char_length(request_key) BETWEEN 8 AND 80),
  CONSTRAINT pid_url_len      CHECK (source_url IS NULL OR char_length(source_url) <= 2048),
  CONSTRAINT pid_name_len     CHECK (source_name IS NULL OR char_length(source_name) <= 300),
  CONSTRAINT pid_hash_ok      CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pid_part_ok      CHECK (source_part IS NULL OR source_part BETWEEN 1 AND 200),
  CONSTRAINT pid_photos_arr   CHECK (jsonb_typeof(photos) = 'array'),
  CONSTRAINT pid_size_ok      CHECK (pg_column_size(extracted) + pg_column_size(fields) + pg_column_size(photos) <= 2000000)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_drafts_request ON property_import_drafts (created_by, request_key);
CREATE INDEX IF NOT EXISTS idx_import_drafts_owner ON property_import_drafts (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_drafts_property ON property_import_drafts (property_id) WHERE property_id IS NOT NULL;

ALTER TABLE property_import_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE property_import_drafts FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE property_import_drafts TO service_role;

-- El borrador de p_actor, bloqueado. Ajeno o inexistente = 'draft_not_found'.
CREATE OR REPLACE FUNCTION import_draft_lock(p_actor uuid, p_draft uuid)
RETURNS property_import_drafts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d property_import_drafts;
BEGIN
  SELECT * INTO d FROM property_import_drafts WHERE id = p_draft AND created_by = p_actor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft_not_found';
  END IF;
  RETURN d;
END
$$;

-- Crea la ficha del borrador UNA sola vez. Si ya la tiene, la devuelve.
-- p_row: columnas permitidas (lista explícita; el resto se ignora). Siempre:
-- source 'manual', status 'available', published_web false, país del borrador
-- y supresión de alertas = NOT notify_clients.
CREATE OR REPLACE FUNCTION import_draft_create_property(p_actor uuid, p_draft uuid, p_expected_version integer, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d     property_import_drafts;
  v_id  uuid;
  v_slug text;
BEGIN
  d := import_draft_lock(p_actor, p_draft);
  IF d.property_id IS NOT NULL THEN
    SELECT slug INTO v_slug FROM properties WHERE id = d.property_id;
    RETURN jsonb_build_object('property_id', d.property_id, 'slug', v_slug, 'created', false, 'choice', d.duplicate_choice);
  END IF;
  IF d.state <> 'review' THEN RAISE EXCEPTION 'draft_not_reviewable'; END IF;
  IF d.version <> p_expected_version THEN RAISE EXCEPTION 'draft_changed'; END IF;
  IF d.agency_id IS NULL THEN RAISE EXCEPTION 'agency_required'; END IF;
  IF coalesce(btrim(p_row->>'title'), '') = '' THEN RAISE EXCEPTION 'title_required'; END IF;
  IF coalesce(btrim(p_row->>'zone'), '') = '' THEN RAISE EXCEPTION 'zone_required'; END IF;
  IF coalesce((p_row->>'price')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'price_required'; END IF;
  IF coalesce(btrim(p_row->>'external_id'), '') = '' THEN RAISE EXCEPTION 'external_reference_required'; END IF;
  IF p_row->>'operation' NOT IN ('sale', 'rent') THEN RAISE EXCEPTION 'operation_required'; END IF;
  IF coalesce(btrim(p_row->>'slug'), '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'slug_invalid'; END IF;

  BEGIN
    INSERT INTO properties (
      agency_id, source, external_id, slug, status, country, published_web, new_listing_alerts_suppressed,
      title, description, operation, stay, price, bedrooms, bathrooms, square_meters,
      zone, subzone, address, features, source_url, latitude, longitude, location_precision, last_synced_at)
    VALUES (
      d.agency_id, 'manual', btrim(p_row->>'external_id'), btrim(p_row->>'slug'), 'available', d.country, false, NOT d.notify_clients,
      btrim(p_row->>'title'), nullif(p_row->>'description', ''), (p_row->>'operation')::property_operation,
      (nullif(p_row->>'stay', ''))::property_stay, (p_row->>'price')::numeric,
      coalesce((p_row->>'bedrooms')::integer, 0), coalesce((p_row->>'bathrooms')::integer, 0), (p_row->>'square_meters')::integer,
      btrim(p_row->>'zone'), nullif(btrim(coalesce(p_row->>'subzone', '')), ''), nullif(btrim(coalesce(p_row->>'address', '')), ''),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_row->'features', '[]'::jsonb))), '{}'),
      nullif(p_row->>'source_url', ''), (p_row->>'latitude')::double precision, (p_row->>'longitude')::double precision,
      nullif(p_row->>'location_precision', ''), now())
    RETURNING id, slug INTO v_id, v_slug;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_key';
  END;

  UPDATE property_import_drafts
     SET property_id = v_id, state = 'created', duplicate_choice = coalesce(duplicate_choice, 'new'),
         version = version + 1, updated_at = now()
   WHERE id = p_draft;
  RETURN jsonb_build_object('property_id', v_id, 'slug', v_slug, 'created', true, 'choice', 'new');
END
$$;

-- Duplicado: usar la ficha existente sin escribir en ella.
CREATE OR REPLACE FUNCTION import_draft_use_existing(p_actor uuid, p_draft uuid, p_expected_version integer, p_property uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d      property_import_drafts;
  v_slug text;
BEGIN
  d := import_draft_lock(p_actor, p_draft);
  IF d.property_id IS NOT NULL THEN
    SELECT slug INTO v_slug FROM properties WHERE id = d.property_id;
    RETURN jsonb_build_object('property_id', d.property_id, 'slug', v_slug, 'created', false, 'choice', d.duplicate_choice);
  END IF;
  IF d.state <> 'review' THEN RAISE EXCEPTION 'draft_not_reviewable'; END IF;
  IF d.version <> p_expected_version THEN RAISE EXCEPTION 'draft_changed'; END IF;
  SELECT slug INTO v_slug FROM properties WHERE id = p_property AND country = d.country;
  IF NOT FOUND THEN RAISE EXCEPTION 'property_not_found'; END IF;
  UPDATE property_import_drafts
     SET property_id = p_property, state = 'created', duplicate_choice = 'existing', version = version + 1, updated_at = now()
   WHERE id = p_draft;
  RETURN jsonb_build_object('property_id', p_property, 'slug', v_slug, 'created', false, 'choice', 'existing');
END
$$;

-- Duplicado: actualizar campos concretos de la existente, solo si nadie la ha
-- tocado desde que se comparó (updated_at). Nunca toca estado, archivado,
-- fotos, created_at, publicación web ni supresión de alertas.
CREATE OR REPLACE FUNCTION import_draft_update_existing(
  p_actor uuid, p_draft uuid, p_expected_version integer, p_property uuid, p_expected_updated_at timestamptz, p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d      property_import_drafts;
  v_upd  timestamptz;
  v_slug text;
  k      text;
BEGIN
  d := import_draft_lock(p_actor, p_draft);
  IF d.property_id IS NOT NULL THEN
    SELECT slug INTO v_slug FROM properties WHERE id = d.property_id;
    RETURN jsonb_build_object('property_id', d.property_id, 'slug', v_slug, 'created', false, 'choice', d.duplicate_choice);
  END IF;
  IF d.state <> 'review' THEN RAISE EXCEPTION 'draft_not_reviewable'; END IF;
  IF d.version <> p_expected_version THEN RAISE EXCEPTION 'draft_changed'; END IF;
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN RAISE EXCEPTION 'invalid_fields'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_fields) LOOP
    IF k NOT IN ('title', 'description', 'price', 'bedrooms', 'bathrooms', 'square_meters', 'zone', 'subzone', 'address', 'features', 'stay') THEN
      RAISE EXCEPTION 'invalid_fields';
    END IF;
  END LOOP;
  SELECT updated_at, slug INTO v_upd, v_slug FROM properties WHERE id = p_property AND country = d.country FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'property_not_found'; END IF;
  IF v_upd IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'property_changed'; END IF;
  UPDATE properties SET
    title         = CASE WHEN p_fields ? 'title'         THEN btrim(p_fields->>'title') ELSE title END,
    description   = CASE WHEN p_fields ? 'description'   THEN nullif(p_fields->>'description', '') ELSE description END,
    price         = CASE WHEN p_fields ? 'price'         THEN (p_fields->>'price')::numeric ELSE price END,
    bedrooms      = CASE WHEN p_fields ? 'bedrooms'      THEN (p_fields->>'bedrooms')::integer ELSE bedrooms END,
    bathrooms     = CASE WHEN p_fields ? 'bathrooms'     THEN (p_fields->>'bathrooms')::integer ELSE bathrooms END,
    square_meters = CASE WHEN p_fields ? 'square_meters' THEN (p_fields->>'square_meters')::integer ELSE square_meters END,
    zone          = CASE WHEN p_fields ? 'zone'          THEN btrim(p_fields->>'zone') ELSE zone END,
    subzone       = CASE WHEN p_fields ? 'subzone'       THEN nullif(btrim(coalesce(p_fields->>'subzone', '')), '') ELSE subzone END,
    address       = CASE WHEN p_fields ? 'address'       THEN nullif(btrim(coalesce(p_fields->>'address', '')), '') ELSE address END,
    features      = CASE WHEN p_fields ? 'features'      THEN coalesce(ARRAY(SELECT jsonb_array_elements_text(p_fields->'features')), '{}') ELSE features END,
    stay          = CASE WHEN p_fields ? 'stay'          THEN (nullif(p_fields->>'stay', ''))::property_stay ELSE stay END,
    updated_at    = now()
  WHERE id = p_property;
  UPDATE property_import_drafts
     SET property_id = p_property, state = 'created', duplicate_choice = 'update', version = version + 1, updated_at = now()
   WHERE id = p_draft;
  RETURN jsonb_build_object('property_id', p_property, 'slug', v_slug, 'created', false, 'choice', 'update');
END
$$;

-- Foto subida al borrador (PDF): se añade al final con id propio; la misma
-- foto (mismo hash) no se repite.
CREATE OR REPLACE FUNCTION import_draft_add_photo(p_actor uuid, p_draft uuid, p_photo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d     property_import_drafts;
  v_new jsonb;
BEGIN
  d := import_draft_lock(p_actor, p_draft);
  IF d.state <> 'review' THEN RAISE EXCEPTION 'draft_not_reviewable'; END IF;
  IF jsonb_typeof(p_photo) <> 'object' OR p_photo->>'sha' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_photo'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d.photos) e WHERE e->>'sha' = p_photo->>'sha') THEN
    RETURN (SELECT e FROM jsonb_array_elements(d.photos) e WHERE e->>'sha' = p_photo->>'sha' LIMIT 1);
  END IF;
  IF jsonb_array_length(d.photos) >= 60 THEN RAISE EXCEPTION 'too_many_photos'; END IF;
  v_new := p_photo || jsonb_build_object('id', 'u-' || left(p_photo->>'sha', 16), 'kind', 'upload', 'selected', true);
  UPDATE property_import_drafts SET photos = photos || jsonb_build_array(v_new), version = version + 1, updated_at = now()
   WHERE id = p_draft;
  RETURN v_new;
END
$$;

-- Foto ya procesada → fila de la ficha. Idempotente por (ficha, url).
CREATE OR REPLACE FUNCTION import_draft_attach_photo(p_actor uuid, p_draft uuid, p_url text, p_position integer, p_is_cover boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d property_import_drafts;
BEGIN
  d := import_draft_lock(p_actor, p_draft);
  IF d.property_id IS NULL OR d.duplicate_choice <> 'new' THEN RAISE EXCEPTION 'draft_without_new_property'; END IF;
  IF EXISTS (SELECT 1 FROM property_photos WHERE property_id = d.property_id AND url = p_url) THEN
    RETURN false;
  END IF;
  INSERT INTO property_photos (property_id, url, position, is_cover) VALUES (d.property_id, p_url, p_position, p_is_cover);
  IF p_is_cover THEN
    UPDATE properties SET cover_photo_url = p_url, last_synced_at = now() WHERE id = d.property_id;
  END IF;
  RETURN true;
END
$$;

-- Estado de un paso: photos | catalog | client_link → {status, …detalle}.
CREATE OR REPLACE FUNCTION import_draft_set_step(p_actor uuid, p_draft uuid, p_step text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d       property_import_drafts;
  v_steps jsonb;
  v_done  boolean;
BEGIN
  d := import_draft_lock(p_actor, p_draft);
  IF p_step NOT IN ('photos', 'catalog', 'client_link') THEN RAISE EXCEPTION 'invalid_step'; END IF;
  IF d.property_id IS NULL THEN RAISE EXCEPTION 'draft_without_property'; END IF;
  IF jsonb_typeof(p_value) <> 'object' OR p_value->>'status' NOT IN ('pending', 'running', 'ok', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid_step';
  END IF;
  v_steps := d.steps || jsonb_build_object(p_step, p_value || jsonb_build_object('at', now()));
  -- Hecho cuando ningún paso queda pendiente ni fallido.
  v_done := NOT EXISTS (SELECT 1 FROM jsonb_each(v_steps) s WHERE s.value->>'status' IN ('pending', 'running', 'failed'));
  UPDATE property_import_drafts
     SET steps = v_steps, state = CASE WHEN v_done THEN 'done' ELSE 'created' END, updated_at = now()
   WHERE id = p_draft;
  RETURN v_steps;
END
$$;

-- Bucket PRIVADO para las fotos de los PDF antes de confirmar (como
-- mail-attachments, 0171). Sin políticas: solo el servidor (service_role).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('property-import-drafts', 'property-import-drafts', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

REVOKE ALL ON FUNCTION import_draft_lock(uuid, uuid)                                            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION import_draft_create_property(uuid, uuid, integer, jsonb)                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION import_draft_use_existing(uuid, uuid, integer, uuid)                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION import_draft_update_existing(uuid, uuid, integer, uuid, timestamptz, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION import_draft_add_photo(uuid, uuid, jsonb)                                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION import_draft_attach_photo(uuid, uuid, text, integer, boolean)            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION import_draft_set_step(uuid, uuid, text, jsonb)                           FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION import_draft_lock(uuid, uuid)                                         TO service_role;
GRANT EXECUTE ON FUNCTION import_draft_create_property(uuid, uuid, integer, jsonb)              TO service_role;
GRANT EXECUTE ON FUNCTION import_draft_use_existing(uuid, uuid, integer, uuid)                  TO service_role;
GRANT EXECUTE ON FUNCTION import_draft_update_existing(uuid, uuid, integer, uuid, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION import_draft_add_photo(uuid, uuid, jsonb)                             TO service_role;
GRANT EXECUTE ON FUNCTION import_draft_attach_photo(uuid, uuid, text, integer, boolean)         TO service_role;
GRANT EXECUTE ON FUNCTION import_draft_set_step(uuid, uuid, text, jsonb)                        TO service_role;

COMMIT;
