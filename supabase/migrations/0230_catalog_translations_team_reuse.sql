-- ============================================================================
-- 0230 · BCP-01: una traducción ya hecha se reutiliza en todo el equipo.
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (result-traduccion-compartida.md).
--
-- Decisión de Fabricio (23-10-2026): si una vivienda ya se tradujo a un
-- idioma, no se vuelve a pagar la IA al ponerla en otro catálogo, sea de quien
-- sea del equipo. Hasta aquí (0226) cada traducción era del dueño y, salvo la
-- de la biblioteca, de UN catálogo: el mismo piso, con el mismo español, se
-- traducía otra vez en cada catálogo nuevo.
--
-- catalog_tr_reuse: antes de reservar una llamada a la IA, para lo que le
-- falte a esta vivienda en este idioma, copia a las filas del dueño una
-- traducción ya PUBLICADA (aprobada) en cualquier catálogo del equipo:
--   · la descripción: misma vivienda y EXACTAMENTE el mismo español (huella y
--     contenido de la fuente), biblioteca o texto del catálogo;
--   · la plantilla «Vivir en…»: exactamente el mismo texto;
--   · cada característica: la misma cadena exacta.
-- Si hay varias, gana la corregida o vista a mano y, después, la más reciente.
-- Lo copiado entra como borrador de la IA (origin 'ai'); la publicación de
-- siempre (catalog_tr_publish) vuelve a pasar los filtros y lo aprueba en
-- ESTE catálogo. El título y la introducción de cada catálogo no se comparten
-- (son de ese catálogo). Nunca pisa nada: solo rellena lo que no existe.
--
-- `reused_from` (textos) y `reused_from_owner` (características) dicen de
-- dónde salió la copia. Nada más cambia: ni datos existentes, ni
-- instantáneas, ni huellas. Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0230.sql
-- ============================================================================

BEGIN;

ALTER TABLE catalog_tr_texts    ADD COLUMN IF NOT EXISTS reused_from       uuid REFERENCES catalog_tr_texts(id) ON DELETE SET NULL;
ALTER TABLE catalog_tr_features ADD COLUMN IF NOT EXISTS reused_from_owner uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Búsqueda de lo ya traducido por vivienda y huella (y por texto exacto).
CREATE INDEX IF NOT EXISTS idx_catalog_tr_sources_reuse    ON catalog_tr_sources (property_id, es_sig) WHERE kind IN ('library', 'catalog');
CREATE INDEX IF NOT EXISTS idx_catalog_tr_sources_area_sig ON catalog_tr_sources (es_sig) WHERE kind = 'area';
CREATE INDEX IF NOT EXISTS idx_catalog_tr_features_reuse   ON catalog_tr_features (lang, es) WHERE status = 'approved';

-- p_source: la fuente de la vivienda (del dueño); p_area: la de su plantilla
-- (o NULL); p_features: las cadenas que se ven hoy. Devuelve qué se copió:
-- {text: bool, area: bool, features: n}.
CREATE OR REPLACE FUNCTION catalog_tr_reuse(p_actor uuid, p_source uuid, p_area uuid, p_lang text, p_features jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_src   catalog_tr_sources;
  v_from  catalog_tr_texts;
  v_text  boolean := false;
  v_area  boolean := false;
  v_n     integer := 0;
  v_f     text;
  v_feat  catalog_tr_features;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  IF jsonb_typeof(coalesce(p_features, '[]'::jsonb)) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(p_features, '[]'::jsonb)) > 80 THEN
    RAISE EXCEPTION 'invalid_text';
  END IF;

  -- La descripción de la vivienda.
  IF p_source IS NOT NULL THEN
    SELECT * INTO v_src FROM catalog_tr_sources WHERE id = p_source AND owner_id = p_actor;
    IF NOT FOUND OR v_src.kind NOT IN ('library', 'catalog') THEN RAISE EXCEPTION 'source_not_found'; END IF;
    PERFORM catalog_tr_lock(p_source, p_lang);
    IF NOT EXISTS (SELECT 1 FROM catalog_tr_texts WHERE source_id = p_source AND lang = p_lang) THEN
      SELECT t.* INTO v_from
        FROM catalog_tr_texts t JOIN catalog_tr_sources s ON s.id = t.source_id
       WHERE s.kind IN ('library', 'catalog') AND s.property_id = v_src.property_id AND s.es_sig = v_src.es_sig AND s.es = v_src.es
         AND s.id <> p_source AND t.lang = p_lang AND t.status = 'approved'
         AND catalog_tr_keys_match(t.content->'b', v_src.es->'b') AND catalog_tr_blocker(t.content) IS NULL
       ORDER BY (t.approval = 'manual' OR t.origin = 'manual') DESC NULLS LAST, t.approved_at DESC, t.id
       LIMIT 1;
      IF FOUND THEN
        INSERT INTO catalog_tr_texts (source_id, lang, status, content, origin, reused_from)
        VALUES (p_source, p_lang, 'draft', v_from.content, 'ai', v_from.id)
        ON CONFLICT (source_id, lang) DO NOTHING;
        v_text := FOUND;
      END IF;
    END IF;
  END IF;

  -- La plantilla «Vivir en…» (mismo texto exacto).
  IF p_area IS NOT NULL THEN
    SELECT * INTO v_src FROM catalog_tr_sources WHERE id = p_area AND owner_id = p_actor;
    IF NOT FOUND OR v_src.kind <> 'area' THEN RAISE EXCEPTION 'source_not_found'; END IF;
    PERFORM catalog_tr_lock(p_area, p_lang);
    IF NOT EXISTS (SELECT 1 FROM catalog_tr_texts WHERE source_id = p_area AND lang = p_lang) THEN
      SELECT t.* INTO v_from
        FROM catalog_tr_texts t JOIN catalog_tr_sources s ON s.id = t.source_id
       WHERE s.kind = 'area' AND s.es_sig = v_src.es_sig AND s.es = v_src.es
         AND s.id <> p_area AND t.lang = p_lang AND t.status = 'approved'
         AND catalog_tr_keys_match(t.content->'b', v_src.es->'b') AND catalog_tr_blocker(t.content) IS NULL
       ORDER BY (t.approval = 'manual' OR t.origin = 'manual') DESC NULLS LAST, t.approved_at DESC, t.id
       LIMIT 1;
      IF FOUND THEN
        INSERT INTO catalog_tr_texts (source_id, lang, status, content, origin, reused_from)
        VALUES (p_area, p_lang, 'draft', v_from.content, 'ai', v_from.id)
        ON CONFLICT (source_id, lang) DO NOTHING;
        v_area := FOUND;
      END IF;
    END IF;
  END IF;

  -- Las características (por cadena exacta) que el dueño aún no tiene.
  FOR v_f IN SELECT DISTINCT x FROM jsonb_array_elements_text(coalesce(p_features, '[]'::jsonb)) AS a(x)
              WHERE btrim(x) <> '' AND char_length(x) <= 200 LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM catalog_tr_features WHERE owner_id = p_actor AND lang = p_lang AND es = v_f);
    SELECT * INTO v_feat FROM catalog_tr_features
     WHERE lang = p_lang AND es = v_f AND status = 'approved' AND owner_id <> p_actor AND catalog_tr_text_blocker(tr) IS NULL
     ORDER BY (approval = 'manual' OR origin = 'manual') DESC NULLS LAST, approved_at DESC, owner_id
     LIMIT 1;
    CONTINUE WHEN NOT FOUND;
    INSERT INTO catalog_tr_features (owner_id, lang, es, tr, status, origin, reused_from_owner)
    VALUES (p_actor, p_lang, v_f, v_feat.tr, 'draft', 'ai', v_feat.owner_id)
    ON CONFLICT (owner_id, lang, es) DO NOTHING;
    IF FOUND THEN v_n := v_n + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('text', v_text, 'area', v_area, 'features', v_n);
END
$$;

REVOKE ALL ON FUNCTION catalog_tr_reuse(uuid, uuid, uuid, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_tr_reuse(uuid, uuid, uuid, text, jsonb) TO service_role;

COMMIT;
