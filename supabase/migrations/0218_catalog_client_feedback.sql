-- ============================================================================
-- 0218 · BCP-01: catálogos asignados a clientes, enlace personal y opiniones.
--
-- Expediente: docs/changes/2026-10-20-bcp-01-compacto-y-opiniones/
--   (spec.md DC10–DC18, plan.md B1).
--
-- Qué añade:
--   · catalog_client_links: el MISMO catálogo asignado a un cliente del CRM
--     (profiles, role 'client'), con su enlace personal (token propio,
--     caducidad y revocación). Una asignación vigente por catálogo y cliente.
--     El enlace identifica la ASIGNACIÓN, no a una persona autenticada (DC11).
--   · catalog_feedback: opinión por (catálogo, cliente, vivienda): 1–5
--     estrellas y comentario opcional (≤ 1.000). La vivienda es su identidad
--     estable (property_id), resuelta en el servidor desde la clave pública
--     (DC12). Se guardan el título del catálogo y el de la vivienda al opinar.
--     Si la vivienda sale del catálogo o se renueva el enlace, la opinión se
--     conserva; nada la borra en silencio (DC15).
--   · Lectura pública: get_public_catalog y get_catalog_states aceptan
--     también los enlaces personales (misma instantánea y huella: las
--     opiniones NO van en ella, DC18).
--   · catalog_feedback_get / catalog_feedback_set: SOLO por token personal.
--     Caducidad, revocación y catálogo archivado se comprueban en cada
--     escritura ('link_invalid', sin decir cuál). Una opinión igual a la
--     guardada no escribe ni avisa (DC14).
--   · Aviso interno (DC17) en crm_notifications al asesor responsable del
--     cliente (profiles.assigned_advisor_id) o, si no tiene, al dueño del
--     catálogo. Uno por opinión: si hay uno sin leer, se actualiza.
--   · Funciones del dueño (guarda de la HOME): crear, renovar, revocar y
--     listar asignaciones.
--
-- Permisos (E1): RLS sin políticas, REVOKE a public/anon/authenticated y
-- EXECUTE/GRANT solo a service_role. SECURITY INVOKER y search_path fijo.
-- Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-20-bcp-01-compacto-y-opiniones/rollback-0218.sql
-- ============================================================================

BEGIN;

-- ── Asignaciones (enlace personal) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_client_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  client_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_client_links_token_len CHECK (char_length(token) >= 24)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_client_links_active
  ON catalog_client_links (catalog_id, client_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_client_links_client ON catalog_client_links (client_id);
ALTER TABLE catalog_client_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_client_links FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_client_links TO service_role;

-- ── Opiniones ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Vivienda, catálogo y enlace: SET NULL (nunca borrar el histórico).
  catalog_id      uuid        REFERENCES catalogs(id) ON DELETE SET NULL,
  client_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id     uuid        REFERENCES properties(id) ON DELETE SET NULL,
  link_id         uuid        REFERENCES catalog_client_links(id) ON DELETE SET NULL,
  catalog_title   text        NOT NULL,
  property_title  text        NOT NULL,
  rating          smallint    NOT NULL,
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_feedback_rating_ok  CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT catalog_feedback_comment_ok CHECK (comment IS NULL OR char_length(comment) BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_feedback_one
  ON catalog_feedback (catalog_id, client_id, property_id);
CREATE INDEX IF NOT EXISTS idx_catalog_feedback_client ON catalog_feedback (client_id, updated_at DESC);
ALTER TABLE catalog_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_feedback FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_feedback TO service_role;

-- ── Claves públicas de la lista efectiva (la misma lista que la instantánea) ─

CREATE OR REPLACE FUNCTION catalog_public_keys(p_catalog uuid)
RETURNS TABLE (property_id uuid, public_key text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.property_id, s.public_key
    FROM catalogs c
    CROSS JOIN LATERAL catalog_select(c.id, c.criteria) s
   WHERE c.id = p_catalog AND c.mode = 'auto'
  UNION ALL
  SELECT ci.property_id, ci.public_key
    FROM catalog_items ci
    JOIN catalogs c ON c.id = ci.catalog_id
    JOIN properties p ON p.id = ci.property_id
   WHERE ci.catalog_id = p_catalog AND c.mode <> 'auto'
     AND p.archived_at IS NULL AND p.status::text NOT IN ('sold', 'archived')
$$;

-- Asignación válida para un token personal (o ninguna fila).
CREATE OR REPLACE FUNCTION catalog_client_link_valid(p_token text)
RETURNS catalog_client_links
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.*
    FROM catalog_client_links l
    JOIN catalogs c ON c.id = l.catalog_id
   WHERE l.token = p_token AND l.revoked_at IS NULL AND l.expires_at > now() AND c.status = 'active'
$$;

-- ── Lectura pública: enlaces generales y personales ─────────────────────────

CREATE OR REPLACE FUNCTION get_public_catalog(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
             'valid',       true,
             'expires_at',  t.expires_at,
             'fingerprint', md5(x.snap::text),
             'snapshot',    x.snap)
      FROM (
        SELECT s.catalog_id, s.expires_at, s.revoked_at FROM catalog_shares s WHERE s.token = p_token
        UNION ALL
        SELECT l.catalog_id, l.expires_at, l.revoked_at FROM catalog_client_links l WHERE l.token = p_token
      ) t
      JOIN catalogs c ON c.id = t.catalog_id
      CROSS JOIN LATERAL (SELECT catalog_internal_snapshot(c.id) AS snap) x
     WHERE t.revoked_at IS NULL
       AND t.expires_at > now()
       AND c.status = 'active'
     LIMIT 1
  ), jsonb_build_object('valid', false))
$$;

CREATE OR REPLACE FUNCTION get_catalog_states(p_tokens text[])
RETURNS TABLE (token text, valid boolean, fingerprint text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.tok,
         (k.catalog_id IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now() AND c.status = 'active'),
         CASE WHEN k.catalog_id IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now() AND c.status = 'active'
              THEN md5(catalog_internal_snapshot(c.id)::text) END,
         CASE WHEN k.catalog_id IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now() AND c.status = 'active'
              THEN k.expires_at END
    FROM unnest(p_tokens) AS t(tok)
    LEFT JOIN LATERAL (
      SELECT s.catalog_id, s.expires_at, s.revoked_at FROM catalog_shares s WHERE s.token = t.tok
      UNION ALL
      SELECT l.catalog_id, l.expires_at, l.revoked_at FROM catalog_client_links l WHERE l.token = t.tok
      LIMIT 1
    ) k ON true
    LEFT JOIN catalogs c ON c.id = k.catalog_id
$$;

-- ── Funciones del dueño (HOME) ──────────────────────────────────────────────

-- Asigna el catálogo a un cliente del CRM y crea su enlace personal. Una
-- asignación vigente caducada se revoca y se sustituye; vigente y en plazo:
-- 'link_exists' (se renueva aparte). Los permisos del personal sobre ese
-- cliente los comprueba la aplicación antes de llamar.
CREATE OR REPLACE FUNCTION catalog_client_link_create(p_actor uuid, p_catalog uuid, p_client uuid, p_days integer)
RETURNS TABLE (id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat catalogs;
  v_tok text;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.status <> 'active' THEN RAISE EXCEPTION 'catalog_archived'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN RAISE EXCEPTION 'invalid_days'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = p_client AND pr.role = 'client') THEN RAISE EXCEPTION 'client_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM catalog_client_links l WHERE l.catalog_id = p_catalog AND l.client_id = p_client
               AND l.revoked_at IS NULL AND l.expires_at > now()) THEN
    RAISE EXCEPTION 'link_exists';
  END IF;
  UPDATE catalog_client_links l SET revoked_at = now()
   WHERE l.catalog_id = p_catalog AND l.client_id = p_client AND l.revoked_at IS NULL;
  -- Un token que no coincida con ningún enlace general ni personal.
  LOOP
    v_tok := generate_url_safe_token(21);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM catalog_shares s WHERE s.token = v_tok)
          AND NOT EXISTS (SELECT 1 FROM catalog_client_links l WHERE l.token = v_tok);
  END LOOP;
  RETURN QUERY
    INSERT INTO catalog_client_links (catalog_id, client_id, token, expires_at, created_by)
    VALUES (p_catalog, p_client, v_tok, now() + make_interval(days => p_days), p_actor)
    RETURNING catalog_client_links.id, catalog_client_links.token, catalog_client_links.expires_at;
END
$$;

-- Renueva la caducidad (mismo token).
CREATE OR REPLACE FUNCTION catalog_client_link_renew(p_actor uuid, p_link uuid, p_days integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_link catalog_client_links;
  v_exp  timestamptz;
BEGIN
  SELECT * INTO v_link FROM catalog_client_links WHERE id = p_link;
  IF NOT FOUND THEN RAISE EXCEPTION 'link_not_found'; END IF;
  PERFORM catalog_require_owner(p_actor, v_link.catalog_id);
  IF v_link.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN RAISE EXCEPTION 'invalid_days'; END IF;
  UPDATE catalog_client_links SET expires_at = now() + make_interval(days => p_days) WHERE id = p_link RETURNING expires_at INTO v_exp;
  RETURN v_exp;
END
$$;

-- Revoca el enlace personal. Las opiniones se conservan.
CREATE OR REPLACE FUNCTION catalog_client_link_revoke(p_actor uuid, p_link uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_link catalog_client_links;
BEGIN
  SELECT * INTO v_link FROM catalog_client_links WHERE id = p_link;
  IF NOT FOUND THEN RAISE EXCEPTION 'link_not_found'; END IF;
  PERFORM catalog_require_owner(p_actor, v_link.catalog_id);
  UPDATE catalog_client_links SET revoked_at = now() WHERE id = p_link AND revoked_at IS NULL;
END
$$;

-- Asignaciones de un catálogo (gestión): vigentes y revocadas, con el número
-- de opiniones del cliente en ESTE catálogo y la última.
CREATE OR REPLACE FUNCTION catalog_client_links_list(p_actor uuid, p_catalog uuid)
RETURNS TABLE (id uuid, client_id uuid, client_name text, token text, expires_at timestamptz,
               revoked_at timestamptz, created_at timestamptz, feedback_count integer, last_feedback_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM catalogs c JOIN home_owners h ON h.profile_id = p_actor WHERE c.id = p_catalog AND c.owner_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT l.id, l.client_id, coalesce(nullif(btrim(pr.full_name), ''), pr.email), l.token, l.expires_at, l.revoked_at, l.created_at,
           (SELECT count(*)::integer FROM catalog_feedback f WHERE f.catalog_id = l.catalog_id AND f.client_id = l.client_id),
           (SELECT max(f.updated_at) FROM catalog_feedback f WHERE f.catalog_id = l.catalog_id AND f.client_id = l.client_id)
      FROM catalog_client_links l
      JOIN profiles pr ON pr.id = l.client_id
     WHERE l.catalog_id = p_catalog
     ORDER BY (l.revoked_at IS NULL) DESC, l.created_at DESC;
END
$$;

-- ── Opiniones por token personal ────────────────────────────────────────────

-- Las opiniones de ESTA asignación sobre las viviendas que siguen en el
-- catálogo, por clave pública. Enlace no válido: nada.
CREATE OR REPLACE FUNCTION catalog_feedback_get(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE WHEN l.id IS NULL THEN jsonb_build_object('personal', false) ELSE jsonb_build_object(
    'personal', true,
    'items', coalesce((
      SELECT jsonb_object_agg(k.public_key, jsonb_build_object('rating', f.rating, 'comment', f.comment, 'updated_at', f.updated_at))
        FROM catalog_public_keys(l.catalog_id) k
        JOIN catalog_feedback f ON f.catalog_id = l.catalog_id AND f.client_id = l.client_id AND f.property_id = k.property_id
    ), '{}'::jsonb)) END
  FROM catalog_client_link_valid(p_token) l
$$;

-- Guarda la opinión de la asignación sobre una vivienda del catálogo.
-- Devuelve {status: 'saved' | 'unchanged', updated_at}. Errores:
-- 'link_invalid' (inexistente, revocado, caducado o catálogo archivado),
-- 'not_in_catalog', 'invalid_rating', 'comment_too_long'.
CREATE OR REPLACE FUNCTION catalog_feedback_set(p_token text, p_key text, p_rating integer, p_comment text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_link     catalog_client_links;
  v_prop     uuid;
  v_comment  text := nullif(btrim(coalesce(p_comment, '')), '');
  v_row      catalog_feedback;
  v_cat      catalogs;
  v_ptitle   text;
  v_client   text;
  v_to       uuid;
  v_body     text;
  v_country  text;
BEGIN
  SELECT * INTO v_link FROM catalog_client_link_valid(p_token);
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'link_invalid'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'invalid_rating'; END IF;
  IF char_length(coalesce(v_comment, '')) > 1000 THEN RAISE EXCEPTION 'comment_too_long'; END IF;
  SELECT k.property_id INTO v_prop FROM catalog_public_keys(v_link.catalog_id) k WHERE k.public_key = p_key LIMIT 1;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'not_in_catalog'; END IF;

  -- Una escritura a la vez por opinión (reintentos y dos pestañas).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_link.catalog_id::text || v_link.client_id::text || v_prop::text, 0));
  SELECT * INTO v_row FROM catalog_feedback
   WHERE catalog_id = v_link.catalog_id AND client_id = v_link.client_id AND property_id = v_prop FOR UPDATE;
  IF FOUND AND v_row.rating = p_rating AND v_row.comment IS NOT DISTINCT FROM v_comment THEN
    RETURN jsonb_build_object('status', 'unchanged', 'updated_at', v_row.updated_at);
  END IF;

  SELECT * INTO v_cat FROM catalogs WHERE id = v_link.catalog_id;
  SELECT coalesce((SELECT t.pub_title FROM catalog_texts t WHERE t.catalog_id = v_link.catalog_id AND t.property_id = v_prop), p.title)
    INTO v_ptitle FROM properties p WHERE p.id = v_prop;
  INSERT INTO catalog_feedback (catalog_id, client_id, property_id, link_id, catalog_title, property_title, rating, comment)
  VALUES (v_link.catalog_id, v_link.client_id, v_prop, v_link.id, v_cat.title, v_ptitle, p_rating, v_comment)
  ON CONFLICT (catalog_id, client_id, property_id) DO UPDATE
     SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, link_id = EXCLUDED.link_id,
         catalog_title = EXCLUDED.catalog_title, property_title = EXCLUDED.property_title, updated_at = now()
  RETURNING * INTO v_row;

  -- Aviso interno: al asesor responsable del cliente o, sin él, al dueño del
  -- catálogo. Uno por opinión: si hay uno sin leer, se actualiza.
  SELECT coalesce(nullif(btrim(pr.full_name), ''), pr.email),
         CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = pr.assigned_advisor_id) THEN pr.assigned_advisor_id ELSE v_cat.owner_id END,
         CASE WHEN pr.country IN ('es', 'cl') THEN pr.country ELSE 'es' END
    INTO v_client, v_to, v_country
    FROM profiles pr WHERE pr.id = v_link.client_id;
  v_body := format('%s ha valorado «%s» con %s de 5 en el catálogo «%s».', v_client, v_ptitle, p_rating, v_cat.title)
            || CASE WHEN v_comment IS NULL THEN '' ELSE ' «' || left(v_comment, 160) || CASE WHEN char_length(v_comment) > 160 THEN '…' ELSE '' END || '»' END;
  UPDATE crm_notifications
     SET title = 'Opinión de catálogo', body = v_body, created_at = now(),
         data = jsonb_build_object('feedback_id', v_row.id, 'client_id', v_link.client_id, 'catalog_id', v_link.catalog_id, 'property_id', v_prop, 'rating', p_rating)
   WHERE user_id = v_to AND type = 'catalog_feedback' AND read IS NOT TRUE AND data->>'feedback_id' = v_row.id::text;
  IF NOT FOUND THEN
    INSERT INTO crm_notifications (user_id, type, title, body, link, data)
    VALUES (v_to, 'catalog_feedback', 'Opinión de catálogo', v_body,
            '/' || v_country || '/admin/clientes/' || v_link.client_id || '?tab=properties#catalog-feedback',
            jsonb_build_object('feedback_id', v_row.id, 'client_id', v_link.client_id, 'catalog_id', v_link.catalog_id, 'property_id', v_prop, 'rating', p_rating));
  END IF;
  RETURN jsonb_build_object('status', 'saved', 'updated_at', v_row.updated_at);
END
$$;

-- ── Permisos (E1) ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_public_keys(uuid)                                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_client_link_valid(text)                             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_public_catalog(text)                                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_catalog_states(text[])                                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_client_link_create(uuid, uuid, uuid, integer)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_client_link_renew(uuid, uuid, integer)              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_client_link_revoke(uuid, uuid)                      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_client_links_list(uuid, uuid)                       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_feedback_get(text)                                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_feedback_set(text, text, integer, text)             FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_public_keys(uuid)                                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_client_link_valid(text)                          TO service_role;
GRANT EXECUTE ON FUNCTION get_public_catalog(text)                                 TO service_role;
GRANT EXECUTE ON FUNCTION get_catalog_states(text[])                               TO service_role;
GRANT EXECUTE ON FUNCTION catalog_client_link_create(uuid, uuid, uuid, integer)    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_client_link_renew(uuid, uuid, integer)           TO service_role;
GRANT EXECUTE ON FUNCTION catalog_client_link_revoke(uuid, uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_client_links_list(uuid, uuid)                    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_feedback_get(text)                               TO service_role;
GRANT EXECUTE ON FUNCTION catalog_feedback_set(text, text, integer, text)          TO service_role;

COMMIT;
