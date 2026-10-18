-- ============================================================================
-- 0213 · BCP-01 P4: convertir un catálogo AUTOMÁTICO antiguo en selección fija
-- (explícita), con vista previa y revalidación. Expediente:
-- docs/changes/2026-10-18-bcp-01-buscar-e-importar/ (I-8, I-9).
--
-- · catalog_conversions: registro de cada conversión con TODO lo necesario
--   para volver atrás: criterios, ajustes, la lista manual que había guardada
--   (con sus claves y posiciones), la lista nueva y las versiones.
-- · catalog_conversion_preview(actor, catálogo) → la lista efectiva que se
--   quedaría (en orden, con claves), la versión, las inclusiones que hoy no
--   aparecen (no pasan a la lista) y las filas manuales guardadas que se
--   archivan en el registro. Solo lectura.
-- · catalog_convert_explicit(actor, catálogo, versión esperada, ids esperados)
--   → bajo el bloqueo del dueño, recalcula la lista; si la versión o la lista
--   (ids y orden) no son las de la vista previa → 'selection_changed' (no se
--   convierte en silencio). Si cuadra: guarda el registro, escribe la lista
--   con las MISMAS claves públicas y el mismo orden (el lector no salta) y
--   pasa a modo manual. No toca criterios (criteria.operation la leen el
--   lector y el PDF), ajustes (se conservan, inertes), portada, textos,
--   fotos, contacto, enlaces ni grupos.
--
-- Idempotente. Reversión: rollback-0213.sql (borra las funciones; el registro
-- se conserva). Deshacer UNA conversión: undo-conversion-0213.sql.
-- El build anterior no llama a nada de esto.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS catalog_conversions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id       uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  converted_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  converted_at     timestamptz NOT NULL DEFAULT now(),
  from_version     bigint      NOT NULL,
  to_version       bigint      NOT NULL,
  criteria         jsonb       NOT NULL,
  adjustments      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  previous_items   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  converted_items  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  undone_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_catalog_conversions_catalog ON catalog_conversions (catalog_id, converted_at DESC);
ALTER TABLE catalog_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_conversions FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE catalog_conversions TO service_role;

CREATE OR REPLACE FUNCTION catalog_conversion_preview(p_actor uuid, p_catalog uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat catalogs;
  v_items jsonb;
  v_ids uuid[];
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_cat FROM catalogs WHERE id = p_catalog AND owner_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_cat.mode <> 'auto' THEN RAISE EXCEPTION 'catalog_manual'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('property_id', s.property_id, 'public_key', s.public_key, 'position', s.ord * 100, 'via', s.via) ORDER BY s.ord), '[]'::jsonb),
         coalesce(array_agg(s.property_id ORDER BY s.ord), '{}')
    INTO v_items, v_ids
    FROM catalog_select(p_catalog, v_cat.criteria) s;
  RETURN jsonb_build_object(
    'version', v_cat.version,
    'status', v_cat.status,
    'items', v_items,
    'dropped_inclusions', coalesce((SELECT jsonb_agg(a.property_id ORDER BY a.created_at)
                                      FROM catalog_adjustments a
                                     WHERE a.catalog_id = p_catalog AND a.kind = 'include' AND NOT (a.property_id = ANY (v_ids))), '[]'::jsonb),
    'archived_manual', coalesce((SELECT jsonb_agg(ci.property_id ORDER BY ci.position)
                                   FROM catalog_items ci
                                  WHERE ci.catalog_id = p_catalog AND NOT (ci.property_id = ANY (v_ids))), '[]'::jsonb),
    'adjustments', (SELECT count(*) FROM catalog_adjustments a WHERE a.catalog_id = p_catalog));
END
$$;

CREATE OR REPLACE FUNCTION catalog_convert_explicit(p_actor uuid, p_catalog uuid, p_expected_version bigint, p_expected_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_ids     uuid[];
  v_keys    text[];
  v_prev    jsonb;
  v_new     jsonb;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);  -- bloquea el catálogo
  IF v_cat.mode <> 'auto' THEN RAISE EXCEPTION 'catalog_manual'; END IF;
  IF v_cat.status <> 'active' THEN RAISE EXCEPTION 'catalog_archived'; END IF;
  IF p_expected_version IS NULL OR v_cat.version <> p_expected_version THEN RAISE EXCEPTION 'selection_changed'; END IF;
  SELECT coalesce(array_agg(s.property_id ORDER BY s.ord), '{}'), coalesce(array_agg(s.public_key ORDER BY s.ord), '{}')
    INTO v_ids, v_keys
    FROM catalog_select(p_catalog, v_cat.criteria) s;
  -- La lista, en el mismo orden, tiene que ser la que se vio.
  IF v_ids IS DISTINCT FROM coalesce(p_expected_ids, '{}'::uuid[]) THEN RAISE EXCEPTION 'selection_changed'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('property_id', property_id, 'public_key', public_key, 'position', position, 'added_at', added_at) ORDER BY position), '[]'::jsonb)
    INTO v_prev FROM catalog_items WHERE catalog_id = p_catalog;
  SELECT coalesce(jsonb_agg(jsonb_build_object('property_id', u.pid, 'public_key', u.pkey, 'position', (u.ord * 100)::integer) ORDER BY u.ord), '[]'::jsonb)
    INTO v_new FROM unnest(v_ids, v_keys) WITH ORDINALITY AS u(pid, pkey, ord);

  DELETE FROM catalog_items WHERE catalog_id = p_catalog;
  INSERT INTO catalog_items (catalog_id, property_id, public_key, position)
  SELECT p_catalog, u.pid, u.pkey, (u.ord * 100)::integer
    FROM unnest(v_ids, v_keys) WITH ORDINALITY AS u(pid, pkey, ord);
  UPDATE catalogs SET mode = 'manual', version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;

  INSERT INTO catalog_conversions (catalog_id, converted_by, from_version, to_version, criteria, adjustments, previous_items, converted_items)
  VALUES (p_catalog, p_actor, v_cat.version, v_version, v_cat.criteria,
          coalesce((SELECT jsonb_agg(jsonb_build_object('property_id', a.property_id, 'kind', a.kind, 'created_by', a.created_by, 'created_at', a.created_at))
                      FROM catalog_adjustments a WHERE a.catalog_id = p_catalog), '[]'::jsonb),
          v_prev, v_new);
  RETURN jsonb_build_object('version', v_version, 'count', cardinality(v_ids));
END
$$;

REVOKE ALL ON FUNCTION catalog_conversion_preview(uuid, uuid)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_convert_explicit(uuid, uuid, bigint, uuid[])          FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_conversion_preview(uuid, uuid)                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_convert_explicit(uuid, uuid, bigint, uuid[])       TO service_role;

COMMIT;
