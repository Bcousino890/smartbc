-- ============================================================================
-- Reversión de 0229: las traducciones vuelven a bloquear cualquier precio en
-- la base de datos (definiciones de 0226). No toca datos.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION catalog_tr_blocker(p_content jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    catalog_text_blocker(p_content->>'t'),
    catalog_text_blocker(p_content->>'i'),
    (SELECT catalog_text_blocker(e->>'x') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_content->'b') = 'array' THEN p_content->'b' ELSE '[]'::jsonb END) e
      WHERE catalog_text_blocker(e->>'x') IS NOT NULL LIMIT 1))
$$;

CREATE OR REPLACE FUNCTION catalog_tr_feature_save(p_actor uuid, p_lang text, p_es text, p_tr text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  IF coalesce(btrim(p_es), '') = '' OR char_length(p_es) > 200 OR coalesce(btrim(p_tr), '') = '' OR char_length(p_tr) > 200 THEN
    RAISE EXCEPTION 'invalid_text';
  END IF;
  IF catalog_text_blocker(p_tr) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_text_blocker(p_tr); END IF;
  INSERT INTO catalog_tr_features (owner_id, lang, es, tr, status, origin)
  VALUES (p_actor, p_lang, p_es, btrim(p_tr), 'draft', 'manual')
  ON CONFLICT (owner_id, lang, es) DO UPDATE
     SET tr = EXCLUDED.tr, status = 'draft', origin = 'manual', updated_at = now(), approved_at = NULL
   WHERE catalog_tr_features.tr IS DISTINCT FROM EXCLUDED.tr OR catalog_tr_features.status <> 'draft';
END
$$;

CREATE OR REPLACE FUNCTION catalog_tr_approve(p_actor uuid, p_catalog uuid, p_property uuid, p_lang text, p_es_sig text, p_parts jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_t   catalog_tr_texts;
  v_a   catalog_tr_texts;
  v_aid uuid;
  v_f   jsonb;
  v_row catalog_tr_features;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  SELECT * INTO v_t FROM catalog_tr_text_for(p_actor, p_catalog, p_property, p_lang, nullif(p_parts->'text'->>'id', '')::uuid);
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'translation_not_found'; END IF;
  PERFORM catalog_tr_lock(v_t.source_id, v_t.lang);
  SELECT * INTO v_t FROM catalog_tr_texts WHERE id = v_t.id FOR UPDATE;
  IF v_t.status = 'rejected' OR v_t.rev IS DISTINCT FROM (p_parts->'text'->>'rev')::integer THEN RAISE EXCEPTION 'translation_changed'; END IF;
  IF catalog_tr_blocker(v_t.content) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_tr_blocker(v_t.content); END IF;
  UPDATE catalog_tr_texts SET status = 'approved', approved_at = now(), approved_by = p_actor, updated_at = now()
   WHERE id = v_t.id AND status <> 'approved';

  v_aid := nullif(p_parts->'area'->>'id', '')::uuid;
  IF v_aid IS NOT NULL THEN
    SELECT t.* INTO v_a FROM catalog_tr_texts t JOIN catalog_tr_sources s ON s.id = t.source_id
     WHERE t.id = v_aid AND t.lang = p_lang AND s.owner_id = p_actor AND s.kind = 'area';
    IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_found'; END IF;
    PERFORM catalog_tr_lock(v_a.source_id, v_a.lang);
    SELECT * INTO v_a FROM catalog_tr_texts WHERE id = v_aid FOR UPDATE;
    IF v_a.status = 'rejected' OR v_a.rev IS DISTINCT FROM (p_parts->'area'->>'rev')::integer THEN RAISE EXCEPTION 'translation_changed'; END IF;
    IF catalog_tr_blocker(v_a.content) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_tr_blocker(v_a.content); END IF;
    UPDATE catalog_tr_texts SET status = 'approved', approved_at = now(), approved_by = p_actor, updated_at = now()
     WHERE id = v_aid AND status <> 'approved';
  END IF;

  FOR v_f IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_parts->'features') = 'array' THEN p_parts->'features' ELSE '[]'::jsonb END) e LOOP
    SELECT * INTO v_row FROM catalog_tr_features WHERE owner_id = p_actor AND lang = p_lang AND es = v_f->>'es' FOR UPDATE;
    IF NOT FOUND OR v_row.status = 'rejected' OR v_row.tr IS DISTINCT FROM (v_f->>'tr') THEN RAISE EXCEPTION 'translation_changed'; END IF;
    IF catalog_text_blocker(v_row.tr) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_text_blocker(v_row.tr); END IF;
    UPDATE catalog_tr_features SET status = 'approved', approved_at = now(), updated_at = now()
     WHERE owner_id = p_actor AND lang = p_lang AND es = v_row.es AND status <> 'approved';
  END LOOP;

  RETURN catalog_tr_copy_set(p_actor, p_catalog, p_property, p_lang, p_es_sig, v_t.id, v_aid, p_parts->'list');
END
$$;

DROP FUNCTION IF EXISTS catalog_tr_text_blocker(text);

REVOKE ALL ON FUNCTION catalog_tr_blocker(jsonb)                             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_feature_save(uuid, text, text, text)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_approve(uuid, uuid, uuid, text, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_tr_blocker(jsonb)                          TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_feature_save(uuid, text, text, text)    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_approve(uuid, uuid, uuid, text, text, jsonb) TO service_role;

COMMIT;
