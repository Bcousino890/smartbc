-- ============================================================================
-- SmartBC · SALES INBOX — el lead deja de mentir
-- ============================================================================
-- Foto de producción antes de esta migración: 322 leads de Idealista, 294 en
-- "nuevo", 320 sin asignar… y 52 con una conversación de WhatsApp REAL abierta
-- que el inbox mostraba como "sin contactar". El estado no describía el
-- trabajo: describía lo que nadie había ido a marcar a mano.
--
-- Esta migración no añade otro campo de estado. Añade las TRES cosas que
-- faltaban para poder DERIVARLO de los hechos, y nada más:
--
--   1 · trazabilidad lead → cliente (client_id + cuándo + quién)
--   2 · historial de contacto con autor y fecha (lead_activity)
--   3 · próxima acción con vencimiento (next_action_at / _note)
--
-- Lo que NO hace, a propósito:
--   · no toca un solo campo de la ingesta de la extensión;
--   · no borra `status`, `contact_status` ni `lead_type` — otro código los
--     sigue leyendo y el estado nuevo se calcula, no se guarda. Quedan como
--     compatibilidad hasta que se compruebe que nadie los usa.
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

-- ─── 1 · Trazabilidad lead → cliente ────────────────────────────────────────
--
-- Era el vacío estructural del módulo: al convertir un lead se perdía de dónde
-- venía la relación. Una columna basta; una tabla puente solo haría falta si un
-- lead pudiera acabar en varios clientes, y no puede (una conversación es una
-- persona).

ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_note text;

-- "Convertido" sin cliente es un estado imposible: si el CHECK no lo impide,
-- el día que alguien desvincule a mano quedará un lead diciendo que se
-- convirtió en nadie.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'il_converted_requires_client'
  ) THEN
    ALTER TABLE idealista_leads
      ADD CONSTRAINT il_converted_requires_client
      CHECK (converted_at IS NULL OR client_id IS NOT NULL);
  END IF;
END $$;

-- ─── 2 · Historial de contacto ──────────────────────────────────────────────
--
-- Mismo patrón que `client_portal_link_notes`, que ya funciona en la ficha del
-- cliente: un HILO, no un campo que se pisa. Quien llama después necesita leer
-- lo que dijo el anterior.
--
-- `kind` distingue el gesto porque cada uno se lee distinto: una llamada
-- registrada es evidencia de contacto; una nota, no.

CREATE TABLE IF NOT EXISTS lead_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES idealista_leads(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  kind        text NOT NULL,
  body        text,
  -- Para llamadas: 'answered' | 'no_answer' | 'callback'. Es lo que separa
  -- "hablé con él" de "lo intenté", y de eso depende el estado derivado.
  outcome     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT la_kind_valid CHECK (kind IN (
    'call', 'whatsapp', 'email', 'note',
    'assignment', 'follow_up', 'conversion', 'discarded', 'status'
  )),
  CONSTRAINT la_outcome_valid CHECK (
    outcome IS NULL OR outcome IN ('answered', 'no_answer', 'callback')
  )
);

COMMENT ON TABLE lead_activity IS
  'Hilo de contacto de un lead. Es la evidencia con la que se deriva el estado comercial: no hay un campo "contactado" que mantener a mano.';

-- ─── 3 · Índices ────────────────────────────────────────────────────────────
--
-- La bandeja pagina y filtra EN SERVIDOR (antes cargaba 500 leads enteros y
-- filtraba en el navegador). Estos son los caminos que recorre de verdad.

CREATE INDEX IF NOT EXISTS idx_leads_created_at    ON idealista_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status        ON idealista_leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned      ON idealista_leads (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_unassigned    ON idealista_leads (created_at DESC) WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_client        ON idealista_leads (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_next_action   ON idealista_leads (next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_matched_prop  ON idealista_leads (matched_property_id) WHERE matched_property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_activity_lead  ON lead_activity (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activity_kind  ON lead_activity (kind, created_at DESC);

-- El puente con WhatsApp se consulta en CADA carga de la bandeja para derivar
-- el estado: sin índice, 52 conversaciones hoy y un escaneo secuencial mañana.
CREATE INDEX IF NOT EXISTS idx_zinto_conv_lead     ON zinto_conversations (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zinto_msg_conv      ON zinto_messages (conversation_id, created_at DESC);

-- ─── 4 · Búsqueda por teléfono ──────────────────────────────────────────────
--
-- Los teléfonos se guardan como los escribe la gente ("+34 612 34 56 78"),
-- así que buscar "612345678" no encontraba nada. Una columna generada con
-- solo los dígitos resuelve la búsqueda Y la detección de duplicados, que
-- compara las últimas nueve cifras.

ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS phone_digits text
  GENERATED ALWAYS AS (regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_phone_digits ON idealista_leads (phone_digits)
  WHERE phone_digits <> '';
CREATE INDEX IF NOT EXISTS idx_leads_phone_tail   ON idealista_leads (right(phone_digits, 9))
  WHERE length(phone_digits) >= 9;

-- ─── 5 · RLS ────────────────────────────────────────────────────────────────
--
-- `lead_activity` se escribe siempre desde el servidor con el cliente de
-- servicio, tras comprobar permisos en código (igual que el resto del inbox).
-- La política existe para que la tabla no quede abierta si algún día se lee
-- con la sesión del usuario.

ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_activity_staff_read ON lead_activity;
CREATE POLICY lead_activity_staff_read ON lead_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role <> 'client'
    )
  );
