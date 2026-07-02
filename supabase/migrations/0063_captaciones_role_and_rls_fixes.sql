-- Arreglos del módulo de captaciones (Chile):
--
-- 1. El rol 'captadora' se usa en toda la app (permisos, asignación,
--    usuarios) pero nunca se añadió al enum user_role, por lo que era
--    imposible guardar un perfil con ese rol y getCaptadoras() siempre
--    devolvía vacío (el flujo de asignación quedaba muerto).
--
-- 2. Las políticas RLS de 0048/0050/0057 referencian una tabla
--    `user_profiles` que no existe (la app usa `profiles`) y roles
--    ('agent') que no existen en el enum. Se recrean apuntando a
--    `profiles` con los roles reales. Nota: la app accede a estas tablas
--    con el service role (bypassa RLS), así que esto es defensa en
--    profundidad, no un cambio de comportamiento.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'captadora';

-- ── captaciones ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "agents_admins_view" ON captaciones;
DROP POLICY IF EXISTS "agents_admins_create" ON captaciones;
DROP POLICY IF EXISTS "captadoras_view_assigned" ON captaciones;
DROP POLICY IF EXISTS "captadoras_update_assigned" ON captaciones;

CREATE POLICY "captaciones_staff_view" ON captaciones FOR SELECT
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
    )
  );

CREATE POLICY "captaciones_staff_create" ON captaciones FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
    )
  );

CREATE POLICY "captaciones_assigned_update" ON captaciones FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
  );

-- ── captacion_logs ──────────────────────────────────────────────────────────
-- El endpoint de cambio de estado registra attempt_type='status_change' y
-- result=<nuevo estado>, pero los CHECK de 0048 solo admitían tipos/resultados
-- de contacto → cada insert fallaba en silencio y el historial de estados
-- nunca se guardaba. Se amplía attempt_type y se libera result.
ALTER TABLE captacion_logs DROP CONSTRAINT IF EXISTS captacion_logs_attempt_type_check;
ALTER TABLE captacion_logs ADD CONSTRAINT captacion_logs_attempt_type_check
  CHECK (attempt_type IN ('call', 'visit', 'message', 'whatsapp', 'status_change'));
ALTER TABLE captacion_logs DROP CONSTRAINT IF EXISTS captacion_logs_result_check;

DROP POLICY IF EXISTS "captadoras_create_logs" ON captacion_logs;

CREATE POLICY "captacion_logs_staff_insert" ON captacion_logs FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior', 'captadora')
    )
  );

-- ── captacion_photos ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "captacion_photos_view" ON captacion_photos;
DROP POLICY IF EXISTS "captacion_photos_insert" ON captacion_photos;

CREATE POLICY "captacion_photos_view" ON captacion_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
        )
    )
  );

CREATE POLICY "captacion_photos_insert" ON captacion_photos FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior', 'captadora')
    )
  );

-- ── captacion_contacts (0057 también referenciaba user_profiles) ────────────
DROP POLICY IF EXISTS "captacion_contacts_view" ON captacion_contacts;
DROP POLICY IF EXISTS "captacion_contacts_insert" ON captacion_contacts;
DROP POLICY IF EXISTS "captacion_contacts_update" ON captacion_contacts;
DROP POLICY IF EXISTS "captacion_contacts_delete" ON captacion_contacts;

CREATE POLICY "captacion_contacts_view" ON captacion_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
        )
    )
  );

CREATE POLICY "captacion_contacts_insert" ON captacion_contacts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
        )
    )
  );

CREATE POLICY "captacion_contacts_update" ON captacion_contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
        )
    )
  );

CREATE POLICY "captacion_contacts_delete" ON captacion_contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
        )
    )
  );

-- ── crm_notifications (política de insert de admin apuntaba a user_profiles) ─
DROP POLICY IF EXISTS "notifications_admin_insert" ON crm_notifications;

CREATE POLICY "notifications_admin_insert" ON crm_notifications FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'agent_admin'))
  );
