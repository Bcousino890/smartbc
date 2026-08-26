-- Fase 2 del plan de mejoras de Particulares — RLS en `particulares` y
-- `particulares_changes`, que hoy no la tienen (solo `particulares_contacts`
-- la tiene, desde la migración 0033, con el mismo patrón que se replica acá).
--
-- Defensa en profundidad: hoy todo el módulo pasa por `createAdminClient()`
-- (service role, bypassa RLS), así que esto NO cambia el comportamiento de
-- la app. Mitiga la misma clase de bug que causó la vulnerabilidad de la
-- Fase 0 (un endpoint nuevo que reemplazó a uno viejo y perdió el chequeo de
-- rol) si algún día una query usa el cliente autenticado normal en vez del
-- admin.
--
-- Roles con permiso `particulares.view` en lib/permissions.ts (ver también
-- STAFF_ROLES en lib/db/auth-helpers.ts, que coincide exactamente): owner,
-- admin, advisor, agent_junior, agent_senior, agent_admin. El rol
-- "captadora" (operaria de captaciones) queda fuera a propósito — su matriz
-- de permisos tiene particulares.view = false.

ALTER TABLE particulares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_particulares" ON particulares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner','admin','advisor','agent_admin','agent_senior','agent_junior')
    )
  );

ALTER TABLE particulares_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_particulares_changes" ON particulares_changes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner','admin','advisor','agent_admin','agent_senior','agent_junior')
    )
  );
