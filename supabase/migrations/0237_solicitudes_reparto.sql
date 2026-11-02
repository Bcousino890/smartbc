-- ============================================================================
-- 0237 · Solicitudes: vínculo exacto del anuncio y reparto por inmueble
--
-- Expediente: docs/changes/2026-11-02-solicitudes-reparto/
--
-- Qué añade (todo ADITIVO: ninguna columna existente cambia de tipo ni de
-- significado, no se borra nada y la bandeja anterior sigue funcionando):
--
--   1. idealista_leads.property_link_method — CON QUÉ EVIDENCIA está enlazada
--      la solicitud a su anuncio/inmueble. Hasta hoy no se guardaba, y un
--      emparejamiento por calle+precio se leía igual que una referencia
--      exacta. Solo 'ref', 'code' y 'manual' cuentan como vínculo exacto.
--   2. Estado del reparto en la solicitud (routing_status/…) y versión de la
--      asignación, y la misma versión en el asesor del cliente (profiles).
--   3. property_routing_rules — «Asesor del piso»: un asesor por inmueble.
--   4. assignment_events — auditoría append-only de reglas y asignaciones.
--   5. zinto_owner_sync — cola de salida del responsable hacia Zinto. HOY NO SE
--      ENVÍA NADA: el repositorio no tiene contrato de asignación de Zinto
--      (ver result.md). Las filas quedan 'pending' con blocked_reason
--      'contract_missing' para que un trabajador las drene cuando exista.
--   6. Funciones atómicas (solo service_role) que aplican la política:
--        1º reasignación manual de un administrador,
--        2º asesor actual del cliente,
--        3º regla del inmueble (solo con vínculo EXACTO, primera asignación),
--        4º «Pendiente de reparto».
--
-- Recuperación: rollback-0237.sql en el expediente (DROP de lo añadido y la
-- vista 0161 restaurada). Efecto irreversible: ninguno sobre datos previos;
-- se pierden las reglas, la auditoría y la cola creadas después.
-- Compatibilidad: el código anterior ignora las columnas nuevas (todas con
-- DEFAULT o NULL). La vista conserva todas sus columnas y añade siete al final.
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE en todo; el backfill solo toca
-- filas con property_link_method NULL. Sin BEGIN/COMMIT propio: cada sentencia
-- es reejecutable si el runner corta a mitad.
-- ============================================================================

-- ─── 1 · Columnas ──────────────────────────────────────────────────────────

ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS property_link_method text,
  ADD COLUMN IF NOT EXISTS routing_status       text,
  ADD COLUMN IF NOT EXISTS routing_reason       text,
  ADD COLUMN IF NOT EXISTS routing_rule_id      uuid,
  ADD COLUMN IF NOT EXISTS routing_rule_version integer,
  ADD COLUMN IF NOT EXISTS assignment_source    text,
  ADD COLUMN IF NOT EXISTS assignment_version   integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE idealista_leads ADD CONSTRAINT il_property_link_method_valid CHECK (
    property_link_method IS NULL OR property_link_method IN
      ('ref', 'code', 'manual', 'unverified', 'ambiguous', 'conflict', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE idealista_leads ADD CONSTRAINT il_routing_status_valid CHECK (
    routing_status IS NULL OR routing_status IN ('assigned', 'pending', 'conflict'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE idealista_leads ADD CONSTRAINT il_assignment_source_valid CHECK (
    assignment_source IS NULL OR assignment_source IN ('rule', 'inherited', 'manual_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN idealista_leads.property_link_method IS
  'Evidencia del enlace con el anuncio: ref/code (identificador único), manual (corrección autorizada), unverified (enlace sin evidencia: calle+precio o histórico), ambiguous, conflict, none. NULL = sin clasificar.';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS advisor_assignment_source  text,
  ADD COLUMN IF NOT EXISTS advisor_assignment_version integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_advisor_assignment_source_valid CHECK (
    advisor_assignment_source IS NULL OR advisor_assignment_source IN ('rule', 'lead', 'manual_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_leads_routing_pending
  ON idealista_leads (created_at DESC) WHERE routing_status IN ('pending', 'conflict');

-- ─── 2 · Reglas de reparto («Asesor del piso») ───────────────────────────────
--
-- Una fila por inmueble. El sujeto es la ficha propia (properties) o, cuando
-- el anuncio de Idealista no tiene ficha propia (las «inspo», que son la
-- mayoría), el propio anuncio. Nunca un texto de dirección.

CREATE TABLE IF NOT EXISTS property_routing_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country        text NOT NULL CHECK (country IN ('es', 'cl')),
  property_id    uuid REFERENCES properties(id) ON DELETE CASCADE,
  listing_id     uuid REFERENCES idealista_listings(id) ON DELETE CASCADE,
  advisor_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  active         boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  created_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prr_one_subject CHECK (num_nonnulls(property_id, listing_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prr_property ON property_routing_rules (property_id) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prr_listing  ON property_routing_rules (listing_id)  WHERE listing_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prr_advisor ON property_routing_rules (advisor_id) WHERE active;

-- ─── 3 · Auditoría append-only ───────────────────────────────────────────────
--
-- Sin claves foráneas a propósito: la auditoría sobrevive al borrado de la
-- solicitud, del cliente o del asesor.

CREATE TABLE IF NOT EXISTS assignment_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN (
                        'rule_set', 'rule_cleared',
                        'lead_rule', 'lead_inherited', 'lead_pending', 'lead_conflict',
                        'lead_manual', 'lead_link_fixed',
                        'client_first', 'client_reassign',
                        'zinto_ack', 'zinto_ack_stale', 'zinto_retry')),
  actor_id            uuid,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  lead_id             uuid,
  client_id           uuid,
  property_id         uuid,
  listing_id          uuid,
  rule_id             uuid,
  rule_version        integer,
  previous_advisor_id uuid,
  new_advisor_id      uuid,
  reason              text,
  assignment_version  integer,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ae_lead   ON assignment_events (lead_id, occurred_at DESC)   WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ae_client ON assignment_events (client_id, occurred_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ae_rule   ON assignment_events (rule_id, occurred_at DESC)   WHERE rule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assignment_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assignment_events_append_only';
END $$;
DROP TRIGGER IF EXISTS trg_assignment_events_append_only ON assignment_events;
CREATE TRIGGER trg_assignment_events_append_only
  BEFORE UPDATE OR DELETE ON assignment_events
  FOR EACH ROW EXECUTE FUNCTION assignment_events_append_only();

-- ─── 4 · Cola de salida hacia Zinto ──────────────────────────────────────────
--
-- Una fila por (sujeto, versión de asignación): reintentar no duplica. Una
-- versión nueva deja 'superseded' a las anteriores sin enviar, y un acuse de
-- una versión vieja no cambia nada (zinto_owner_sync_ack).

CREATE TABLE IF NOT EXISTS zinto_owner_sync (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind       text NOT NULL CHECK (subject_kind IN ('client', 'lead')),
  subject_id         uuid NOT NULL,
  phone_digits       text,
  country            text NOT NULL DEFAULT 'es',
  advisor_id         uuid,
  assignment_version integer NOT NULL,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'acked', 'error', 'superseded')),
  blocked_reason     text,
  attempts           integer NOT NULL DEFAULT 0,
  last_error         text,
  acked_at           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zos_one_per_version UNIQUE (subject_kind, subject_id, assignment_version)
);
CREATE INDEX IF NOT EXISTS idx_zos_open ON zinto_owner_sync (status, created_at) WHERE status IN ('pending', 'error');

COMMENT ON TABLE zinto_owner_sync IS
  'Cola recuperable del responsable hacia Zinto. Sin contrato de asignación confirmado no hay trabajador que la envíe: blocked_reason=contract_missing.';

-- ─── 5 · Acceso: solo service_role ───────────────────────────────────────────

ALTER TABLE property_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE zinto_owner_sync       ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON property_routing_rules, assignment_events, zinto_owner_sync FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON property_routing_rules, zinto_owner_sync TO service_role;
GRANT SELECT, INSERT ON assignment_events TO service_role;

-- ─── 6 · Funciones auxiliares ────────────────────────────────────────────────

-- Rol efectivo (rol por país si lo hay, si no el global) = owner/admin.
-- Mismo criterio que requireRoles() en lib/auth/guard.ts.
CREATE OR REPLACE FUNCTION routing_actor_is_admin(p_actor uuid, p_country text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT r.role::text FROM profiles_country_roles r
      WHERE r.user_id = p_actor AND r.country = p_country),
    (SELECT p.role::text FROM profiles p WHERE p.id = p_actor)
  ) IN ('owner', 'admin')
$$;

-- Quién puede llevar clientes. Misma lista que getAssignableStaff().
CREATE OR REPLACE FUNCTION routing_is_advisor(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_id
      AND p.role::text IN ('owner', 'admin', 'advisor', 'agent_junior', 'agent_senior', 'agent_admin')
  )
$$;

-- Clave estable del inmueble de un anuncio: la ficha propia si la tiene.
CREATE OR REPLACE FUNCTION routing_listing_home(p_listing uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE('p:' || x.property_id::text, 'l:' || x.id::text)
  FROM idealista_listings x WHERE x.id = p_listing
$$;

CREATE OR REPLACE FUNCTION routing_audit(
  p_op uuid, p_kind text, p_actor uuid, p_lead uuid, p_client uuid,
  p_prev uuid, p_new uuid, p_reason text, p_version integer,
  p_rule uuid DEFAULT NULL, p_rule_version integer DEFAULT NULL,
  p_property uuid DEFAULT NULL, p_listing uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE sql SET search_path = public AS $$
  INSERT INTO assignment_events (
    operation_id, kind, actor_id, lead_id, client_id, previous_advisor_id, new_advisor_id,
    reason, assignment_version, rule_id, rule_version, property_id, listing_id, details)
  VALUES (p_op, p_kind, p_actor, p_lead, p_client, p_prev, p_new,
          p_reason, p_version, p_rule, p_rule_version, p_property, p_listing, COALESCE(p_details, '{}'::jsonb))
$$;

-- Encola el responsable vigente para Zinto. Idempotente por versión.
CREATE OR REPLACE FUNCTION routing_enqueue_zinto(
  p_kind text, p_subject uuid, p_phone text, p_country text, p_advisor uuid, p_version integer
) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE zinto_owner_sync
     SET status = 'superseded', updated_at = now()
   WHERE subject_kind = p_kind AND subject_id = p_subject
     AND status IN ('pending', 'error') AND assignment_version < p_version;
  INSERT INTO zinto_owner_sync (subject_kind, subject_id, phone_digits, country, advisor_id,
                                assignment_version, status, blocked_reason)
  VALUES (p_kind, p_subject, NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), ''),
          COALESCE(p_country, 'es'), p_advisor, p_version, 'pending', 'contract_missing')
  ON CONFLICT (subject_kind, subject_id, assignment_version) DO NOTHING;
END $$;

-- ─── 7 · Vínculo exacto ──────────────────────────────────────────────────────
--
-- Clasifica (y con p_fix, corrige) el enlace de una solicitud a partir de la
-- ÚNICA evidencia admitida: «Ref.» contra reference_code / bc_reference y
-- «Cod.» contra idealista_property_id, exigiendo una sola vivienda candidata.
-- Nunca mira dirección, título, precio ni teléfono.
--
--   p_fix = false  solo clasifica (backfill): si la evidencia contradice el
--                  enlace guardado, 'conflict' para revisión humana.
--   p_fix = true   ingesta: la evidencia exacta sustituye a un enlace sin
--                  evidencia, y queda escrito en el hilo y en la auditoría.

CREATE OR REPLACE FUNCTION resolve_lead_link(p_lead uuid, p_fix boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  l          idealista_leads%ROWTYPE;
  v_ref      text;
  v_code     text;
  r_homes    text[] := '{}';
  c_homes    text[] := '{}';
  v_common   text[];
  v_home     text;
  v_method   text;
  v_cur      text;
  v_cur_list text;
  v_prop     uuid;
  v_list     uuid;
  v_n        integer;
BEGIN
  SELECT * INTO l FROM idealista_leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Una corrección autorizada no la deshace ninguna captura posterior.
  IF l.property_link_method = 'manual' THEN RETURN 'manual'; END IF;

  v_ref  := NULLIF(lower(btrim(COALESCE(l.property_ref, ''))), '');
  v_code := NULLIF(btrim(COALESCE(l.idealista_code, '')), '');

  IF v_ref IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT h), '{}') INTO r_homes FROM (
      SELECT COALESCE('p:' || x.property_id::text, 'l:' || x.id::text) AS h
        FROM idealista_listings x WHERE lower(x.reference_code) = v_ref
      UNION
      SELECT 'p:' || p.id::text FROM properties p WHERE lower(p.bc_reference) = v_ref
    ) s;
  END IF;
  IF v_code IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT COALESCE('p:' || x.property_id::text, 'l:' || x.id::text)), '{}')
      INTO c_homes
      FROM idealista_listings x WHERE x.idealista_property_id = v_code;
  END IF;

  IF cardinality(r_homes) = 0 AND cardinality(c_homes) = 0 THEN
    v_method := CASE WHEN l.matched_property_id IS NOT NULL OR l.matched_listing_id IS NOT NULL
                     THEN 'unverified' ELSE 'none' END;
  ELSIF cardinality(r_homes) = 1 AND cardinality(c_homes) = 0 THEN
    v_home := r_homes[1]; v_method := 'ref';
  ELSIF cardinality(r_homes) = 0 AND cardinality(c_homes) = 1 THEN
    v_home := c_homes[1]; v_method := 'code';
  ELSIF cardinality(r_homes) = 1 AND cardinality(c_homes) = 1 THEN
    IF r_homes[1] = c_homes[1] THEN v_home := r_homes[1]; v_method := 'ref';
    ELSE v_method := 'conflict'; END IF;
  ELSE
    v_common := ARRAY(SELECT unnest(r_homes) INTERSECT SELECT unnest(c_homes));
    IF cardinality(v_common) = 1 THEN v_home := v_common[1]; v_method := 'ref';
    ELSE v_method := 'ambiguous'; END IF;
  END IF;

  IF v_home IS NOT NULL THEN
    -- Enlace guardado hoy, como clave de vivienda. Si las dos columnas apuntan
    -- a viviendas distintas, el enlace guardado es incoherente.
    v_cur_list := CASE WHEN l.matched_listing_id IS NOT NULL THEN routing_listing_home(l.matched_listing_id) END;
    v_cur := CASE
      WHEN l.matched_property_id IS NOT NULL AND v_cur_list IS NOT NULL
           AND v_cur_list <> 'p:' || l.matched_property_id::text THEN 'incoherent'
      WHEN l.matched_property_id IS NOT NULL THEN 'p:' || l.matched_property_id::text
      ELSE v_cur_list
    END;

    IF v_home LIKE 'p:%' THEN
      v_prop := substr(v_home, 3)::uuid;
      -- El ANUNCIO lo decide la evidencia recibida, no el que ya estaba: un
      -- mismo inmueble puede tener varios anuncios (republicaciones, venta y
      -- alquiler), y que el guardado sea «de la misma vivienda» no lo valida.
      SELECT count(*), min(x.id::text)::uuid INTO v_n, v_list
        FROM idealista_listings x
       WHERE x.property_id = v_prop
         AND ((v_ref IS NOT NULL AND lower(x.reference_code) = v_ref)
           OR (v_code IS NOT NULL AND x.idealista_property_id = v_code));
      IF v_n = 0 THEN
        -- La evidencia es la referencia de la FICHA (bc_reference): identifica
        -- el inmueble, no un anuncio. El anuncio guardado se conserva solo si
        -- es de ese inmueble; nada lo contradice.
        v_list := CASE WHEN v_cur_list = v_home THEN l.matched_listing_id END;
      ELSIF v_n > 1 THEN
        -- Varios anuncios del inmueble casan con la evidencia: el guardado
        -- vale solo si es uno de ellos; si no, ninguno.
        v_list := CASE WHEN EXISTS (
          SELECT 1 FROM idealista_listings x
           WHERE x.id = l.matched_listing_id AND x.property_id = v_prop
             AND ((v_ref IS NOT NULL AND lower(x.reference_code) = v_ref)
               OR (v_code IS NOT NULL AND x.idealista_property_id = v_code))
        ) THEN l.matched_listing_id END;
      END IF;
    ELSE
      v_prop := NULL;
      v_list := substr(v_home, 3)::uuid;
    END IF;

    IF v_cur IS NOT DISTINCT FROM v_home
       AND l.matched_property_id IS NOT DISTINCT FROM v_prop
       AND l.matched_listing_id IS NULL AND v_list IS NOT NULL THEN
      -- Solo falta el anuncio y la evidencia lo identifica: se completa (en
      -- la ingesta). No contradice nada, así que no es conflicto ni corrección.
      IF p_fix THEN
        UPDATE idealista_leads SET matched_listing_id = v_list, updated_at = now() WHERE id = p_lead;
      END IF;
    ELSIF v_cur IS DISTINCT FROM v_home
       OR l.matched_property_id IS DISTINCT FROM v_prop
       OR (l.matched_listing_id IS NOT NULL AND l.matched_listing_id IS DISTINCT FROM v_list) THEN
      IF NOT p_fix THEN
        v_method := 'conflict';
      ELSE
        UPDATE idealista_leads
           SET matched_property_id = v_prop, matched_listing_id = v_list, updated_at = now()
         WHERE id = p_lead;
      END IF;
      -- Solo se deja rastro cuando se SUSTITUYE un enlace; completar uno vacío
      -- con la evidencia exacta es lo normal de la ingesta.
      IF p_fix AND (l.matched_property_id IS NOT NULL OR l.matched_listing_id IS NOT NULL) THEN
        PERFORM routing_audit(gen_random_uuid(), 'lead_link_fixed', NULL, p_lead, l.client_id,
          NULL, NULL, v_method, l.assignment_version, NULL, NULL, v_prop, v_list,
          jsonb_build_object('previous_property_id', l.matched_property_id,
                             'previous_listing_id', l.matched_listing_id,
                             'ref', l.property_ref, 'code', l.idealista_code));
        INSERT INTO lead_activity (lead_id, author_id, kind, body)
        VALUES (p_lead, NULL, 'note',
          'Anuncio identificado por ' || CASE v_method WHEN 'code' THEN 'código de Idealista' ELSE 'referencia' END
          || ' exacta; sustituye al enlace anterior.');
      END IF;
    END IF;
  END IF;

  IF l.property_link_method IS DISTINCT FROM v_method THEN
    UPDATE idealista_leads SET property_link_method = v_method WHERE id = p_lead;
  END IF;
  RETURN v_method;
END $$;

-- ─── 8 · Reparto de una solicitud ────────────────────────────────────────────
--
-- Se llama al recibir o actualizar una solicitud y al vincularla a un cliente.
-- Reejecutarla no duplica nada: si ya está resuelta, no cambia.
--
-- Orden de bloqueo, el MISMO en todas las funciones de 0237: CLIENTE →
-- SOLICITUD. reassign_client_admin bloquea el cliente y después sus
-- solicitudes; route_lead bloquea el cliente ANTES de tocar la solicitud
-- (incluido resolve_lead_link, que la bloquea). Ninguna función bloquea un
-- cliente después de una solicitud: así un reparto y una reasignación
-- simultáneos se esperan en vez de interbloquearse.

CREATE OR REPLACE FUNCTION routing_set_pending(p_lead uuid, p_status text, p_reason text, p_hint jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE l idealista_leads%ROWTYPE;
BEGIN
  SELECT * INTO l FROM idealista_leads WHERE id = p_lead;
  IF l.routing_status IS DISTINCT FROM p_status OR l.routing_reason IS DISTINCT FROM p_reason THEN
    UPDATE idealista_leads SET routing_status = p_status, routing_reason = p_reason WHERE id = p_lead;
    PERFORM routing_audit(gen_random_uuid(),
      CASE p_status WHEN 'conflict' THEN 'lead_conflict' ELSE 'lead_pending' END,
      NULL, p_lead, l.client_id, l.assigned_to, l.assigned_to, p_reason, l.assignment_version,
      NULL, NULL, l.matched_property_id, l.matched_listing_id, p_hint);
  END IF;
  RETURN jsonb_build_object('outcome', p_status, 'reason', p_reason) || COALESCE(p_hint, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION route_lead(p_lead uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_client   uuid;
  c          profiles%ROWTYPE;
  l          idealista_leads%ROWTYPE;
  v_tail     text;
  v_hint     uuid[];
  v_rules    property_routing_rules[];
  v_rule     property_routing_rules%ROWTYPE;
  v_op       uuid := gen_random_uuid();
  v_version  integer;
BEGIN
  -- 1. Cliente primero (orden de bloqueo), solicitud después. El vínculo se
  --    resuelve ya con el cliente bloqueado: resolve_lead_link bloquea la
  --    solicitud y no debe hacerlo antes que el cliente.
  SELECT client_id INTO v_client FROM idealista_leads WHERE id = p_lead;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'missing'); END IF;
  IF v_client IS NOT NULL THEN
    SELECT * INTO c FROM profiles WHERE id = v_client FOR UPDATE;
  END IF;
  PERFORM resolve_lead_link(p_lead, true);
  SELECT * INTO l FROM idealista_leads WHERE id = p_lead FOR UPDATE;
  IF l.client_id IS DISTINCT FROM v_client THEN
    -- Alguien lo vinculó entre las dos lecturas: no se decide con datos viejos.
    RETURN jsonb_build_object('outcome', 'retry');
  END IF;
  IF l.merged_into_id IS NOT NULL OR l.status = 'descartado' THEN
    RETURN jsonb_build_object('outcome', 'skipped');
  END IF;

  -- 2. Cliente verificado (vinculado por una persona).
  IF l.client_id IS NOT NULL AND c.assigned_advisor_id IS NOT NULL THEN
    IF l.assigned_to IS NULL THEN
      v_version := l.assignment_version + 1;
      UPDATE idealista_leads
         SET assigned_to = c.assigned_advisor_id, assigned_at = now(), assignment_source = 'inherited',
             assignment_version = v_version, routing_status = 'assigned', routing_reason = 'client_owner',
             updated_at = now()
       WHERE id = p_lead;
      PERFORM routing_audit(v_op, 'lead_inherited', NULL, p_lead, l.client_id, NULL,
        c.assigned_advisor_id, 'client_owner', v_version);
      INSERT INTO lead_activity (lead_id, author_id, kind, body)
      VALUES (p_lead, NULL, 'assignment', 'Asignada al asesor del cliente');
      RETURN jsonb_build_object('outcome', 'inherited', 'advisor_id', c.assigned_advisor_id);
    ELSIF l.assigned_to = c.assigned_advisor_id THEN
      IF l.routing_status IS DISTINCT FROM 'assigned' THEN
        UPDATE idealista_leads SET routing_status = 'assigned', routing_reason = 'client_owner' WHERE id = p_lead;
      END IF;
      RETURN jsonb_build_object('outcome', 'unchanged', 'advisor_id', l.assigned_to);
    ELSIF l.assignment_source = 'manual_admin' THEN
      -- Un administrador asignó ESTA solicitud a otra persona de forma
      -- explícita: ni la solicitud ni el cliente cambian en silencio. Lo
      -- decide un administrador reasignando al cliente.
      RETURN routing_set_pending(p_lead, 'conflict', 'client_owner_differs',
        jsonb_build_object('client_advisor_id', c.assigned_advisor_id, 'lead_advisor_id', l.assigned_to));
    ELSE
      -- Reparto automático (o asignación anterior a 0237) frente al asesor del
      -- cliente verificado: manda el cliente, que tiene un único asesor. La
      -- solicitud lo hereda y queda auditado quién la tenía.
      v_version := l.assignment_version + 1;
      UPDATE idealista_leads
         SET assigned_to = c.assigned_advisor_id, assigned_at = now(), assignment_source = 'inherited',
             assignment_version = v_version, routing_status = 'assigned', routing_reason = 'client_owner',
             updated_at = now()
       WHERE id = p_lead;
      PERFORM routing_audit(v_op, 'lead_inherited', NULL, p_lead, l.client_id, l.assigned_to,
        c.assigned_advisor_id, 'client_owner', v_version, NULL, NULL, NULL, NULL,
        jsonb_build_object('previous_source', l.assignment_source));
      INSERT INTO lead_activity (lead_id, author_id, kind, body)
      VALUES (p_lead, NULL, 'assignment', 'Asignada al asesor del cliente (antes la tenía otra persona por el reparto)');
      -- La cola de Zinto no puede quedarse con el responsable anterior.
      PERFORM routing_enqueue_zinto('lead', p_lead, l.phone, l.country, c.assigned_advisor_id, v_version);
      RETURN jsonb_build_object('outcome', 'inherited', 'advisor_id', c.assigned_advisor_id,
        'previous_advisor_id', l.assigned_to);
    END IF;
  END IF;

  IF l.client_id IS NOT NULL AND l.assigned_to IS NOT NULL THEN
    -- Cliente sin asesor y solicitud con responsable: el cliente lo hereda
    -- (era ya la regla de convertLeadToClient). Primera asignación del cliente.
    v_version := c.advisor_assignment_version + 1;
    UPDATE profiles
       SET assigned_advisor_id = l.assigned_to, advisor_assignment_source = 'lead',
           advisor_assignment_version = v_version
     WHERE id = l.client_id;
    PERFORM routing_audit(v_op, 'client_first', NULL, p_lead, l.client_id, NULL, l.assigned_to,
      'from_lead', v_version);
    PERFORM routing_enqueue_zinto('client', l.client_id, COALESCE(c.phone, l.phone), l.country, l.assigned_to, v_version);
    UPDATE idealista_leads SET routing_status = 'assigned', routing_reason = COALESCE(routing_reason, 'client_from_lead')
     WHERE id = p_lead AND routing_status IS DISTINCT FROM 'assigned';
    RETURN jsonb_build_object('outcome', 'client_from_lead', 'advisor_id', l.assigned_to);
  END IF;

  IF l.assigned_to IS NOT NULL THEN
    -- Ya tiene responsable (manual o de una pasada anterior): no se toca.
    RETURN jsonb_build_object('outcome', 'unchanged', 'advisor_id', l.assigned_to);
  END IF;

  -- 3. Sin cliente verificado: si el teléfono ya lleva otra persona con
  --    responsable, NO se hereda (identidad sin verificar) pero tampoco se
  --    reparte por regla, que podría dar dos asesores a la misma persona.
  IF l.client_id IS NULL THEN
    v_tail := right(COALESCE(l.phone_digits, ''), 9);
    IF length(v_tail) = 9 THEN
      SELECT array_agg(DISTINCT a) INTO v_hint FROM (
        SELECT o.assigned_to AS a FROM idealista_leads o
         WHERE o.id <> l.id AND o.merged_into_id IS NULL AND o.status <> 'descartado'
           AND length(o.phone_digits) >= 9 AND right(o.phone_digits, 9) = v_tail
           AND o.assigned_to IS NOT NULL
        UNION
        SELECT p.assigned_advisor_id FROM profiles p
         WHERE p.role::text = 'client' AND p.assigned_advisor_id IS NOT NULL
           AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 9) = v_tail
      ) s;
      IF cardinality(v_hint) > 0 THEN
        RETURN routing_set_pending(p_lead, 'pending', 'possible_existing_client',
          jsonb_build_object('candidate_advisor_ids', to_jsonb(v_hint)));
      END IF;
    END IF;
  END IF;

  -- 4. Regla del inmueble: solo con vínculo exacto.
  IF COALESCE(l.property_link_method, 'none') NOT IN ('ref', 'code', 'manual') THEN
    RETURN routing_set_pending(p_lead, 'pending', CASE l.property_link_method
      WHEN 'conflict'  THEN 'link_conflict'
      WHEN 'ambiguous' THEN 'link_ambiguous'
      ELSE 'link_unverified' END);
  END IF;

  SELECT COALESCE(array_agg(r), '{}') INTO v_rules FROM property_routing_rules r
   WHERE r.active
     AND ((l.matched_property_id IS NOT NULL AND r.property_id = l.matched_property_id)
       OR (l.matched_listing_id  IS NOT NULL AND r.listing_id  = l.matched_listing_id));
  IF cardinality(v_rules) = 0 THEN
    RETURN routing_set_pending(p_lead, 'pending', 'no_rule');
  END IF;
  IF (SELECT count(DISTINCT (x).advisor_id) FROM unnest(v_rules) x) > 1
     OR EXISTS (SELECT 1 FROM unnest(v_rules) x WHERE (x).advisor_id IS NULL) AND cardinality(v_rules) > 1 THEN
    RETURN routing_set_pending(p_lead, 'pending', 'rule_ambiguous');
  END IF;
  v_rule := v_rules[1];
  IF v_rule.advisor_id IS NULL OR NOT routing_is_advisor(v_rule.advisor_id) THEN
    RETURN routing_set_pending(p_lead, 'pending', 'advisor_inactive',
      jsonb_build_object('rule_id', v_rule.id));
  END IF;
  IF l.created_at < v_rule.effective_from THEN
    -- El cambio de reparto vale para lo que llega DESPUÉS de confirmarlo; el
    -- histórico no se reasigna de forma implícita.
    RETURN routing_set_pending(p_lead, 'pending', 'arrived_before_rule',
      jsonb_build_object('rule_id', v_rule.id));
  END IF;

  v_version := l.assignment_version + 1;
  UPDATE idealista_leads
     SET assigned_to = v_rule.advisor_id, assigned_at = now(), assignment_source = 'rule',
         assignment_version = v_version, routing_status = 'assigned', routing_reason = 'property_rule',
         routing_rule_id = v_rule.id, routing_rule_version = v_rule.version, updated_at = now()
   WHERE id = p_lead;
  PERFORM routing_audit(v_op, 'lead_rule', NULL, p_lead, l.client_id, NULL, v_rule.advisor_id,
    'property_rule', v_version, v_rule.id, v_rule.version, v_rule.property_id, v_rule.listing_id);
  INSERT INTO lead_activity (lead_id, author_id, kind, body)
  VALUES (p_lead, NULL, 'assignment', 'Reparto automático por inmueble');

  IF l.client_id IS NOT NULL THEN
    -- Cliente verificado sin asesor: primera asignación (bajo su bloqueo).
    UPDATE profiles
       SET assigned_advisor_id = v_rule.advisor_id, advisor_assignment_source = 'rule',
           advisor_assignment_version = c.advisor_assignment_version + 1
     WHERE id = l.client_id;
    PERFORM routing_audit(v_op, 'client_first', NULL, p_lead, l.client_id, NULL, v_rule.advisor_id,
      'property_rule', c.advisor_assignment_version + 1, v_rule.id, v_rule.version);
    PERFORM routing_enqueue_zinto('client', l.client_id, COALESCE(c.phone, l.phone), l.country,
      v_rule.advisor_id, c.advisor_assignment_version + 1);
  ELSE
    PERFORM routing_enqueue_zinto('lead', p_lead, l.phone, l.country, v_rule.advisor_id, v_version);
  END IF;
  RETURN jsonb_build_object('outcome', 'rule', 'advisor_id', v_rule.advisor_id, 'rule_id', v_rule.id);
END $$;

CREATE OR REPLACE FUNCTION route_leads(p_leads uuid[])
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; v_out jsonb := '[]'::jsonb;
BEGIN
  FOREACH v_id IN ARRAY COALESCE(p_leads, '{}') LOOP
    v_out := v_out || jsonb_build_array(jsonb_build_object('lead_id', v_id) || route_lead(v_id));
  END LOOP;
  RETURN v_out;
END $$;

-- ─── 9 · Acciones de administrador ───────────────────────────────────────────
--
-- Comprueban el rol en la base además de en la aplicación. Los errores son
-- códigos estables que traduce lib/sales-inbox/routing-errors.ts.

-- Asignar a mano una solicitud SIN cliente vinculado. Con cliente, el
-- responsable es el del cliente: se usa reassign_client_admin.
CREATE OR REPLACE FUNCTION assign_lead_admin(
  p_actor uuid, p_lead uuid, p_advisor uuid, p_reason text, p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE l idealista_leads%ROWTYPE; v_version integer; v_op uuid := gen_random_uuid();
BEGIN
  SELECT * INTO l FROM idealista_leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT routing_actor_is_admin(p_actor, l.country) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF l.client_id IS NOT NULL THEN RAISE EXCEPTION 'client_linked'; END IF;
  IF l.assignment_version <> p_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  IF p_advisor IS NOT NULL AND NOT routing_is_advisor(p_advisor) THEN RAISE EXCEPTION 'advisor_invalid'; END IF;
  IF l.assigned_to IS NOT DISTINCT FROM p_advisor THEN
    RETURN jsonb_build_object('outcome', 'unchanged', 'version', l.assignment_version);
  END IF;
  IF l.assigned_to IS NOT NULL AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  v_version := l.assignment_version + 1;
  UPDATE idealista_leads
     SET assigned_to = p_advisor, assigned_at = CASE WHEN p_advisor IS NULL THEN NULL ELSE now() END,
         assignment_source = CASE WHEN p_advisor IS NULL THEN NULL ELSE 'manual_admin' END,
         assignment_version = v_version,
         routing_status = CASE WHEN p_advisor IS NULL THEN 'pending' ELSE 'assigned' END,
         routing_reason = CASE WHEN p_advisor IS NULL THEN 'manual_unassigned' ELSE 'manual' END,
         updated_at = now()
   WHERE id = p_lead;
  PERFORM routing_audit(v_op, 'lead_manual', p_actor, p_lead, NULL, l.assigned_to, p_advisor,
    NULLIF(btrim(COALESCE(p_reason, '')), ''), v_version);
  INSERT INTO lead_activity (lead_id, author_id, kind, body)
  VALUES (p_lead, p_actor, 'assignment',
    CASE WHEN p_advisor IS NULL THEN 'sin asignar' ELSE NULLIF(btrim(COALESCE(p_reason, '')), '') END);
  IF p_advisor IS NOT NULL THEN
    PERFORM routing_enqueue_zinto('lead', p_lead, l.phone, l.country, p_advisor, v_version);
  END IF;
  RETURN jsonb_build_object('outcome', 'assigned', 'version', v_version, 'previous_advisor_id', l.assigned_to);
END $$;

-- Reasignar el cliente completo: su asesor, sus solicitudes abiertas (con sus
-- tareas pendientes) y la conversación en Zinto. Lo hecho antes conserva su
-- autor: el hilo y la auditoría no se reescriben.
CREATE OR REPLACE FUNCTION reassign_client_admin(
  p_actor uuid, p_client uuid, p_advisor uuid, p_reason text, p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c         profiles%ROWTYPE;
  r         record;
  v_op      uuid := gen_random_uuid();
  v_version integer;
  v_leads   integer := 0;
  v_tasks   integer := 0;
  v_reason  text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT * INTO c FROM profiles WHERE id = p_client FOR UPDATE;
  IF NOT FOUND OR c.role::text <> 'client' THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT routing_actor_is_admin(p_actor, c.country) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF c.advisor_assignment_version <> p_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  IF p_advisor IS NULL OR NOT routing_is_advisor(p_advisor) THEN RAISE EXCEPTION 'advisor_invalid'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

  IF c.assigned_advisor_id IS DISTINCT FROM p_advisor THEN
    v_version := c.advisor_assignment_version + 1;
    UPDATE profiles
       SET assigned_advisor_id = p_advisor, advisor_assignment_source = 'manual_admin',
           advisor_assignment_version = v_version
     WHERE id = p_client;
  ELSE
    v_version := c.advisor_assignment_version;
  END IF;

  FOR r IN
    SELECT * FROM idealista_leads
     WHERE client_id = p_client AND merged_into_id IS NULL AND status <> 'descartado'
     ORDER BY id FOR UPDATE
  LOOP
    IF r.assigned_to IS DISTINCT FROM p_advisor OR r.routing_status IS DISTINCT FROM 'assigned' THEN
      UPDATE idealista_leads
         SET assigned_to = p_advisor, assigned_at = now(), assignment_source = 'inherited',
             assignment_version = r.assignment_version + 1, routing_status = 'assigned',
             routing_reason = 'client_reassigned', updated_at = now()
       WHERE id = r.id;
      PERFORM routing_audit(v_op, 'lead_inherited', p_actor, r.id, p_client, r.assigned_to, p_advisor,
        v_reason, r.assignment_version + 1);
      IF r.assigned_to IS DISTINCT FROM p_advisor THEN
        INSERT INTO lead_activity (lead_id, author_id, kind, body)
        VALUES (r.id, p_actor, 'assignment', 'Cliente reasignado: ' || v_reason);
      END IF;
      v_leads := v_leads + 1;
      IF r.next_action_at IS NOT NULL THEN v_tasks := v_tasks + 1; END IF;
    END IF;
  END LOOP;

  IF c.assigned_advisor_id IS NOT DISTINCT FROM p_advisor AND v_leads = 0 THEN
    RETURN jsonb_build_object('outcome', 'unchanged', 'version', v_version);
  END IF;

  PERFORM routing_audit(v_op, 'client_reassign', p_actor, NULL, p_client, c.assigned_advisor_id, p_advisor,
    v_reason, v_version, NULL, NULL, NULL, NULL,
    jsonb_build_object('leads', v_leads, 'tasks', v_tasks));
  PERFORM routing_enqueue_zinto('client', p_client, c.phone, c.country, p_advisor, v_version);
  RETURN jsonb_build_object('outcome', 'reassigned', 'version', v_version, 'leads', v_leads,
    'tasks', v_tasks, 'previous_advisor_id', c.assigned_advisor_id);
END $$;

-- Asignar uno o varios inmuebles a un asesor. Cada elemento lleva la versión
-- que vio el administrador (0 = no tenía regla) y devuelve su resultado: un
-- conflicto en uno no impide los demás ni sobrescribe nada en silencio.
--   p_items = [{"property_id": "…"} | {"listing_id": "…"}, "expected_version": n]
CREATE OR REPLACE FUNCTION routing_set_rules(
  p_actor uuid, p_country text, p_advisor uuid, p_items jsonb, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  it        jsonb;
  v_prop    uuid;
  v_list    uuid;
  v_exp     integer;
  v_rule    property_routing_rules%ROWTYPE;
  v_ok      boolean;
  v_op      uuid := gen_random_uuid();
  v_out     jsonb := '[]'::jsonb;
  v_res     text;
  v_new_id  uuid;
BEGIN
  IF NOT routing_actor_is_admin(p_actor, p_country) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_advisor IS NULL OR NOT routing_is_advisor(p_advisor) THEN RAISE EXCEPTION 'advisor_invalid'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty'; END IF;
  IF jsonb_array_length(p_items) > 500 THEN RAISE EXCEPTION 'too_many'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prop := NULLIF(it ->> 'property_id', '')::uuid;
    v_list := NULLIF(it ->> 'listing_id', '')::uuid;
    v_exp  := COALESCE((it ->> 'expected_version')::integer, 0);

    IF num_nonnulls(v_prop, v_list) <> 1 THEN
      v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', 'invalid'));
      CONTINUE;
    END IF;
    IF v_prop IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM properties WHERE id = v_prop AND country = p_country) INTO v_ok;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM idealista_listings x LEFT JOIN properties p ON p.id = x.property_id
         WHERE x.id = v_list AND (p.id IS NULL OR p.country = p_country)) INTO v_ok;
    END IF;
    IF NOT v_ok THEN
      v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', 'not_found'));
      CONTINUE;
    END IF;

    SELECT * INTO v_rule FROM property_routing_rules
     WHERE (v_prop IS NOT NULL AND property_id = v_prop) OR (v_list IS NOT NULL AND listing_id = v_list)
     FOR UPDATE;

    IF NOT FOUND THEN
      IF v_exp <> 0 THEN
        v_res := 'version_conflict';
      ELSE
        INSERT INTO property_routing_rules (country, property_id, listing_id, advisor_id, created_by, updated_by)
        VALUES (p_country, v_prop, v_list, p_advisor, p_actor, p_actor)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_new_id;
        IF v_new_id IS NULL THEN
          v_res := 'version_conflict';  -- otro administrador la creó a la vez
        ELSE
          v_res := 'created';
          PERFORM routing_audit(v_op, 'rule_set', p_actor, NULL, NULL, NULL, p_advisor, p_reason, NULL,
            v_new_id, 1, v_prop, v_list);
        END IF;
      END IF;
      v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', v_res, 'version',
        CASE WHEN v_res = 'created' THEN 1 END));
      v_new_id := NULL;
      CONTINUE;
    END IF;

    IF v_rule.version <> v_exp THEN
      v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', 'version_conflict',
        'current_version', v_rule.version, 'current_advisor_id', v_rule.advisor_id));
      CONTINUE;
    END IF;
    IF v_rule.active AND v_rule.advisor_id = p_advisor THEN
      v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', 'unchanged', 'version', v_rule.version));
      CONTINUE;
    END IF;

    UPDATE property_routing_rules
       SET advisor_id = p_advisor, active = true, effective_from = now(), version = v_rule.version + 1,
           updated_by = p_actor, updated_at = now()
     WHERE id = v_rule.id;
    PERFORM routing_audit(v_op, 'rule_set', p_actor, NULL, NULL,
      CASE WHEN v_rule.active THEN v_rule.advisor_id END, p_advisor, p_reason, NULL,
      v_rule.id, v_rule.version + 1, v_prop, v_list);
    v_out := v_out || jsonb_build_array(it || jsonb_build_object(
      'result', CASE WHEN v_rule.active THEN 'replaced' ELSE 'created' END,
      'version', v_rule.version + 1,
      'previous_advisor_id', CASE WHEN v_rule.active THEN v_rule.advisor_id END));
  END LOOP;
  RETURN v_out;
END $$;

-- Quitar el reparto de uno o varios inmuebles (las solicitudes futuras de esos
-- pisos irán a «Pendiente de reparto»). No toca a ningún cliente ya asignado.
CREATE OR REPLACE FUNCTION routing_clear_rules(
  p_actor uuid, p_country text, p_items jsonb, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  it     jsonb;
  v_prop uuid;
  v_list uuid;
  v_exp  integer;
  v_rule property_routing_rules%ROWTYPE;
  v_op   uuid := gen_random_uuid();
  v_out  jsonb := '[]'::jsonb;
BEGIN
  IF NOT routing_actor_is_admin(p_actor, p_country) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty'; END IF;
  IF jsonb_array_length(p_items) > 500 THEN RAISE EXCEPTION 'too_many'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prop := NULLIF(it ->> 'property_id', '')::uuid;
    v_list := NULLIF(it ->> 'listing_id', '')::uuid;
    v_exp  := COALESCE((it ->> 'expected_version')::integer, 0);
    SELECT * INTO v_rule FROM property_routing_rules
     WHERE ((v_prop IS NOT NULL AND property_id = v_prop) OR (v_list IS NOT NULL AND listing_id = v_list))
       AND country = p_country
     FOR UPDATE;
    IF NOT FOUND OR NOT v_rule.active THEN
      v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', 'unchanged'));
      CONTINUE;
    END IF;
    IF v_rule.version <> v_exp THEN
      v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', 'version_conflict',
        'current_version', v_rule.version, 'current_advisor_id', v_rule.advisor_id));
      CONTINUE;
    END IF;
    UPDATE property_routing_rules
       SET active = false, version = v_rule.version + 1, updated_by = p_actor, updated_at = now()
     WHERE id = v_rule.id;
    PERFORM routing_audit(v_op, 'rule_cleared', p_actor, NULL, NULL, v_rule.advisor_id, NULL, p_reason, NULL,
      v_rule.id, v_rule.version + 1, v_rule.property_id, v_rule.listing_id);
    v_out := v_out || jsonb_build_array(it || jsonb_build_object('result', 'cleared', 'version', v_rule.version + 1));
  END LOOP;
  RETURN v_out;
END $$;

-- Corrección autorizada del enlace (anuncio exacto elegido por una persona
-- con evidencia y motivo). Sustituye a la edición sin rastro de antes.
CREATE OR REPLACE FUNCTION set_lead_link_manual(
  p_actor uuid, p_lead uuid, p_property uuid, p_listing uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE l idealista_leads%ROWTYPE; v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT * INTO l FROM idealista_leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF p_listing IS NOT NULL AND p_property IS NOT NULL
     AND routing_listing_home(p_listing) IS DISTINCT FROM 'p:' || p_property::text THEN
    RAISE EXCEPTION 'link_incoherent';
  END IF;
  UPDATE idealista_leads
     SET matched_property_id = p_property,
         matched_listing_id  = p_listing,
         property_link_method = CASE WHEN p_property IS NULL AND p_listing IS NULL THEN 'none' ELSE 'manual' END,
         updated_at = now()
   WHERE id = p_lead;
  PERFORM routing_audit(gen_random_uuid(), 'lead_link_fixed', p_actor, p_lead, l.client_id, NULL, NULL,
    v_reason, l.assignment_version, NULL, NULL, p_property, p_listing,
    jsonb_build_object('previous_property_id', l.matched_property_id,
                       'previous_listing_id', l.matched_listing_id,
                       'previous_method', l.property_link_method));
  INSERT INTO lead_activity (lead_id, author_id, kind, body)
  VALUES (p_lead, p_actor, 'note', 'Vínculo del anuncio revisado: ' || v_reason);
  RETURN jsonb_build_object('outcome', 'linked');
END $$;

-- ─── 9b · Registrar contacto (resultado + tarea, una sola vez) ───────────────
--
-- «Registrar contacto» guarda el resultado y, si se pide, la próxima tarea en
-- UNA transacción. p_client_key la genera la pantalla al abrir el formulario:
-- un doble clic o un reintento tras un corte devuelve 'duplicate' sin escribir
-- nada más. Abrir Zinto o el teléfono NO pasa por aquí: solo un registro
-- explícito cuenta como contacto.

ALTER TABLE lead_activity ADD COLUMN IF NOT EXISTS client_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_activity_client_key
  ON lead_activity (client_key) WHERE client_key IS NOT NULL;

CREATE OR REPLACE FUNCTION lead_register_contact(
  p_actor uuid, p_lead uuid, p_kind text, p_outcome text, p_note text,
  p_next_at timestamptz, p_next_note text, p_complete_task boolean, p_client_key uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; l idealista_leads%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('call', 'whatsapp', 'email') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF p_kind = 'call' AND COALESCE(p_outcome, '') NOT IN ('answered', 'no_answer') THEN
    RAISE EXCEPTION 'outcome_required';
  END IF;
  IF p_kind <> 'call' AND p_outcome IS NOT NULL THEN RAISE EXCEPTION 'invalid_outcome'; END IF;

  SELECT * INTO l FROM idealista_leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_client_key IS NOT NULL AND EXISTS (SELECT 1 FROM lead_activity WHERE client_key = p_client_key) THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;

  INSERT INTO lead_activity (lead_id, author_id, kind, outcome, body, client_key)
  VALUES (p_lead, p_actor, p_kind, p_outcome, NULLIF(btrim(COALESCE(p_note, '')), ''), p_client_key)
  RETURNING id INTO v_id;

  IF p_next_at IS NOT NULL THEN
    UPDATE idealista_leads
       SET next_action_at = p_next_at, next_action_note = NULLIF(btrim(COALESCE(p_next_note, '')), ''),
           updated_at = now()
     WHERE id = p_lead;
    INSERT INTO lead_activity (lead_id, author_id, kind, body)
    VALUES (p_lead, p_actor, 'follow_up', NULLIF(btrim(COALESCE(p_next_note, '')), ''));
  ELSIF p_complete_task AND l.next_action_at IS NOT NULL THEN
    -- Completar la tarea no cierra la solicitud: solo retira el recordatorio.
    UPDATE idealista_leads SET next_action_at = NULL, updated_at = now() WHERE id = p_lead;
    INSERT INTO lead_activity (lead_id, author_id, kind, body)
    VALUES (p_lead, p_actor, 'follow_up', 'tarea completada');
  END IF;
  RETURN jsonb_build_object('outcome', 'saved', 'activity_id', v_id);
EXCEPTION WHEN unique_violation THEN
  -- Dos envíos simultáneos con la misma clave: el segundo no escribe nada.
  RETURN jsonb_build_object('outcome', 'duplicate');
END $$;

-- ─── 10 · Zinto: acuses y reintento ──────────────────────────────────────────

-- Lo llamará el trabajador de Zinto cuando exista el contrato. Un acuse de una
-- versión que ya no es la vigente no cambia nada.
CREATE OR REPLACE FUNCTION zinto_owner_sync_ack(p_id uuid, p_version integer, p_ok boolean, p_error text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s zinto_owner_sync%ROWTYPE; v_latest integer;
BEGIN
  SELECT * INTO s FROM zinto_owner_sync WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT max(assignment_version) INTO v_latest FROM zinto_owner_sync
   WHERE subject_kind = s.subject_kind AND subject_id = s.subject_id;
  IF s.assignment_version <> p_version OR s.assignment_version < v_latest OR s.status = 'superseded' THEN
    PERFORM routing_audit(gen_random_uuid(), 'zinto_ack_stale', NULL, NULL, NULL, NULL, s.advisor_id,
      NULL, p_version, NULL, NULL, NULL, NULL,
      jsonb_build_object('sync_id', p_id, 'latest_version', v_latest));
    RETURN 'stale';
  END IF;
  UPDATE zinto_owner_sync
     SET status = CASE WHEN p_ok THEN 'acked' ELSE 'error' END,
         acked_at = CASE WHEN p_ok THEN now() END,
         last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END,
         attempts = attempts + 1, updated_at = now()
   WHERE id = p_id;
  RETURN CASE WHEN p_ok THEN 'acked' ELSE 'error' END;
END $$;

-- Reintento autorizado: vuelve a dejar pendiente la ÚLTIMA versión. No crea
-- otra fila, así que no puede duplicar el envío.
CREATE OR REPLACE FUNCTION zinto_owner_sync_retry(p_actor uuid, p_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s zinto_owner_sync%ROWTYPE; v_latest integer;
BEGIN
  SELECT * INTO s FROM zinto_owner_sync WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT routing_actor_is_admin(p_actor, s.country) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT max(assignment_version) INTO v_latest FROM zinto_owner_sync
   WHERE subject_kind = s.subject_kind AND subject_id = s.subject_id;
  IF s.assignment_version < v_latest OR s.status NOT IN ('error', 'pending') THEN
    RETURN 'not_retryable';
  END IF;
  UPDATE zinto_owner_sync SET status = 'pending', last_error = NULL, updated_at = now() WHERE id = p_id;
  PERFORM routing_audit(gen_random_uuid(), 'zinto_retry', p_actor, NULL, NULL, NULL, s.advisor_id,
    NULL, s.assignment_version, NULL, NULL, NULL, NULL, jsonb_build_object('sync_id', p_id));
  RETURN 'requeued';
END $$;

-- ─── 11 · Permisos de las funciones ──────────────────────────────────────────
--
-- PostgREST expone las funciones de public como RPC: sin esto, anon podría
-- llamar a assign_lead_admin con un p_actor inventado.

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'routing_actor_is_admin(uuid, text)',
    'routing_is_advisor(uuid)',
    'routing_listing_home(uuid)',
    'routing_audit(uuid, text, uuid, uuid, uuid, uuid, uuid, text, integer, uuid, integer, uuid, uuid, jsonb)',
    'routing_enqueue_zinto(text, uuid, text, text, uuid, integer)',
    'resolve_lead_link(uuid, boolean)',
    'routing_set_pending(uuid, text, text, jsonb)',
    'route_lead(uuid)',
    'route_leads(uuid[])',
    'assign_lead_admin(uuid, uuid, uuid, text, integer)',
    'reassign_client_admin(uuid, uuid, uuid, text, integer)',
    'routing_set_rules(uuid, text, uuid, jsonb, text)',
    'routing_clear_rules(uuid, text, jsonb, text)',
    'set_lead_link_manual(uuid, uuid, uuid, uuid, text)',
    'lead_register_contact(uuid, uuid, text, text, text, timestamptz, text, boolean, uuid)',
    'zinto_owner_sync_ack(uuid, integer, boolean, text)',
    'zinto_owner_sync_retry(uuid, uuid)',
    'assignment_events_append_only()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ─── 12 · Clasificación del histórico ────────────────────────────────────────
--
-- Solo CLASIFICA (p_fix = false): no cambia ningún enlace ni ningún
-- responsable del histórico. Donde la evidencia contradice lo guardado queda
-- 'conflict', para revisión humana. Idempotente: solo filas sin clasificar.

DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM idealista_leads WHERE property_link_method IS NULL LOOP
    PERFORM resolve_lead_link(v_id, false);
  END LOOP;
END $$;

-- ─── 13 · La vista de la bandeja ─────────────────────────────────────────────
--
-- Copia literal de 0161 con siete columnas nuevas AL FINAL (CREATE OR REPLACE
-- VIEW solo admite añadir columnas al final).

CREATE OR REPLACE VIEW lead_inbox_facts AS
WITH wa AS (
  SELECT
    c.lead_id                                                   AS lead_id,
    min(c.id::text)                                             AS conversation_id,
    count(*) FILTER (WHERE m.type = 'sent')                     AS outbound,
    count(*) FILTER (WHERE m.type = 'received')                 AS inbound,
    min(m.created_at) FILTER (WHERE m.type = 'sent')            AS first_outbound_at,
    max(m.created_at)                                           AS last_message_at,
    max(m.created_at) FILTER (WHERE m.type = 'received')        AS last_inbound_at,
    max(m.created_at) FILTER (WHERE m.type = 'sent')            AS last_outbound_at
  FROM zinto_conversations c
  LEFT JOIN zinto_messages m ON m.conversation_id = c.id
  WHERE c.lead_id IS NOT NULL
  GROUP BY c.lead_id
),
act AS (
  SELECT
    a.lead_id,
    max(a.created_at)                                           AS last_at,
    bool_or(a.kind IN ('call', 'whatsapp', 'email'))            AS has_touch,
    bool_or(a.kind = 'call' AND a.outcome = 'answered')         AS has_answered_call,
    count(*)                                                    AS entries
  FROM lead_activity a
  GROUP BY a.lead_id
),
mg AS (
  SELECT merged_into_id, count(*) AS absorbed
  FROM idealista_leads
  WHERE merged_into_id IS NOT NULL
  GROUP BY 1
),
dup AS (
  SELECT right(phone_digits, 9) AS tail
  FROM idealista_leads
  WHERE length(phone_digits) >= 9
    AND merged_into_id IS NULL
  GROUP BY 1
  HAVING count(*) > 1
),
cards AS (
  SELECT
    l.id AS lead_id,
    array_agg(DISTINCT d.op) FILTER (WHERE d.op IS NOT NULL) AS ops
  FROM idealista_leads l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(l.properties) = 'array'
       AND jsonb_array_length(l.properties) > 1 THEN l.properties
      ELSE '[]'::jsonb
    END
  ) AS c(card)
  CROSS JOIN LATERAL (SELECT lead_price_operation(c.card ->> 'price')) AS d(op)
  GROUP BY l.id
)
SELECT
  l.id,
  l.name,
  l.phone,
  l.phone_digits,
  l.is_international,
  l.message,
  l.property_title,
  l.property_price,
  l.property_image_url,
  l.matched_property_id,
  l.matched_listing_id,
  l.conversation_id                                             AS idealista_conversation_id,
  l.lead_type,
  l.suggested_type,
  l.status                                                      AS legacy_status,
  l.contact_status                                              AS legacy_contact_status,
  l.assigned_to,
  l.assigned_at,
  l.client_id,
  l.converted_at,
  l.converted_by,
  l.next_action_at,
  l.next_action_note,
  l.country,
  l.created_at,
  l.updated_at,

  wa.conversation_id                                            AS wa_conversation_id,
  COALESCE(wa.outbound, 0)                                      AS wa_outbound,
  COALESCE(wa.inbound, 0)                                       AS wa_inbound,
  wa.first_outbound_at                                          AS wa_first_outbound_at,
  wa.last_message_at                                            AS wa_last_message_at,
  COALESCE(
    wa.last_inbound_at IS NOT NULL
      AND (wa.last_outbound_at IS NULL OR wa.last_inbound_at > wa.last_outbound_at),
    false
  )                                                             AS wa_awaiting_reply,

  COALESCE(act.entries, 0)                                      AS activity_entries,
  act.last_at                                                   AS activity_last_at,
  COALESCE(act.has_touch, false)                                AS activity_has_touch,
  COALESCE(act.has_answered_call, false)                        AS activity_answered_call,

  (dup.tail IS NOT NULL)                                        AS duplicate_phone,

  GREATEST(
    COALESCE(wa.last_message_at, l.created_at),
    COALESCE(act.last_at, l.created_at)
  )                                                             AS last_activity_at,

  CASE
    WHEN l.client_id IS NOT NULL                                       THEN 'converted'
    WHEN l.status = 'descartado'                                       THEN 'discarded'
    WHEN COALESCE(wa.inbound, 0) > 0
      OR COALESCE(act.has_answered_call, false)                        THEN 'engaged'
    WHEN COALESCE(wa.outbound, 0) > 0
      OR COALESCE(act.has_touch, false)                                THEN 'contacted'
    ELSE 'new'
  END                                                           AS commercial_state,

  l.avatar_url                                                  AS avatar_url,

  COALESCE(mg.absorbed, 0)                                      AS merged_count,

  CASE
    WHEN px.op IS NOT NULL                                             THEN px.op
    WHEN il.operation = 'sale'                                         THEN 'sale'
    WHEN p.id IS NOT NULL
     AND NOT (p.operations @> ARRAY['sale', 'rent']::text[])           THEN p.operation::text
    ELSE NULL
  END                                                           AS lead_operation,

  CASE
    WHEN px.op IS NOT NULL                                             THEN 'price'
    WHEN il.operation = 'sale'                                         THEN 'listing'
    WHEN p.id IS NOT NULL
     AND NOT (p.operations @> ARRAY['sale', 'rent']::text[])           THEN 'property'
    ELSE NULL
  END                                                           AS operation_source,

  -- ── 0237 · nuevas, al final ──
  l.property_link_method                                        AS property_link_method,
  l.routing_status                                              AS routing_status,
  l.routing_reason                                              AS routing_reason,
  l.assignment_source                                           AS assignment_source,
  l.assignment_version                                          AS assignment_version,
  -- Para buscar por ID del anuncio y por referencia interna.
  l.idealista_code                                              AS idealista_code,
  l.property_ref                                                AS property_ref
FROM idealista_leads l
LEFT JOIN wa  ON wa.lead_id = l.id::text
LEFT JOIN act ON act.lead_id = l.id
LEFT JOIN mg  ON mg.merged_into_id = l.id
LEFT JOIN dup ON dup.tail = right(l.phone_digits, 9) AND length(l.phone_digits) >= 9
LEFT JOIN properties         p  ON p.id  = l.matched_property_id
LEFT JOIN idealista_listings il ON il.id = l.matched_listing_id
LEFT JOIN cards                 ON cards.lead_id = l.id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN cardinality(cards.ops) > 1 THEN 'mixed'
    WHEN cardinality(cards.ops) = 1 THEN cards.ops[1]
    ELSE lead_price_operation(l.property_price)
  END AS op
) px
WHERE l.merged_into_id IS NULL;

COMMENT ON VIEW lead_inbox_facts IS
  'Hechos derivados de cada lead para la Sales Inbox: WhatsApp, historial, duplicados, fusiones, estado comercial, venta/alquiler y (0237) vínculo y reparto. Definición viva: migración 0237.';

NOTIFY pgrst, 'reload schema';
