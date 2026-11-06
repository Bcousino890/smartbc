-- ============================================================================
-- 0246 · Encargos: RLS del cliente solo sobre su encargo principal y el
-- consentimiento de las alertas no se parte al cambiar de principal.
-- Aditiva e idempotente. Solo afecta a client_preferences (España y Chile
-- comparten la tabla, pero Chile solo tiene la fila principal: no cambia nada).
--
-- 1. Políticas del propio cliente (portal): desde 0243 un cliente podía, por
--    PostgREST, crear encargos extra (el cron avisaría al equipo con la etiqueta
--    que eligiera), pausar/borrar su principal (el borrado arrastra
--    encargo_matches) y leer las notas internas de todos sus encargos. Ahora sus
--    políticas solo alcanzan la fila principal (USING y WITH CHECK), así que no
--    puede insertar ni ver filas no principales ni dejar de ser principal. Las
--    políticas del equipo (client_preferences_staff_all) no cambian. El portal
--    del cliente (app/api/cliente/preferences, app/(cliente)/actions.ts) ya
--    apunta siempre a la fila principal.
-- 2. CHECK: el principal siempre está activo (la app ya lo impide; ahora la base
--    también). Las filas existentes lo cumplen: 0243 las dejó todas activas.
-- 3. make_encargo_primary: el nuevo principal hereda del anterior las columnas
--    de las alertas por correo (new_listing_alerts_enabled / _frequency /
--    _last_sent_at). Son datos del CLIENTE guardados por fila y el cron de
--    alertas, la baja y el interruptor solo miran el principal: sin esto, al
--    cambiar de principal las alertas se paraban en silencio o volvían a llegar a
--    quien se había dado de baja. Mismos errores y permisos que en 0244.
--
-- Reversión: docs/changes/2026-11-06-encargos-matching/rollback-0246.sql
-- ============================================================================

BEGIN;

-- 1. Políticas del propio cliente: solo la fila principal.
DROP POLICY IF EXISTS "client_preferences_self_select" ON client_preferences;
CREATE POLICY "client_preferences_self_select" ON client_preferences
  FOR SELECT USING (auth.uid() = client_id AND is_primary);

DROP POLICY IF EXISTS "client_preferences_self_upsert" ON client_preferences;
CREATE POLICY "client_preferences_self_upsert" ON client_preferences
  FOR ALL USING (auth.uid() = client_id AND is_primary)
  WITH CHECK (auth.uid() = client_id AND is_primary);

-- 2. El principal siempre activo.
ALTER TABLE client_preferences DROP CONSTRAINT IF EXISTS client_preferences_primary_active_check;
ALTER TABLE client_preferences
  ADD CONSTRAINT client_preferences_primary_active_check CHECK (NOT is_primary OR status = 'active');

-- 3. Cambio de principal que conserva el consentimiento de las alertas.
create or replace function public.make_encargo_primary(p_encargo_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_client uuid;
  v_status text;
  v_country text;
  v_prev client_preferences%rowtype;
begin
  select client_id into v_client from client_preferences where id = p_encargo_id;
  if v_client is null then
    raise exception 'ENCARGO_NO_EXISTE' using errcode = 'P0001';
  end if;

  -- Bloquea todas las filas del cliente: dos cambios concurrentes se serializan.
  perform 1 from client_preferences where client_id = v_client for update;

  select status into v_status from client_preferences where id = p_encargo_id;
  if v_status is distinct from 'active' then
    raise exception 'ENCARGO_NO_ACTIVO' using errcode = 'P0001';
  end if;

  select country into v_country from profiles where id = v_client;
  if v_country is distinct from 'es' then
    raise exception 'CLIENTE_NO_ES' using errcode = 'P0001';
  end if;

  select * into v_prev from client_preferences
   where client_id = v_client and is_primary and id <> p_encargo_id;

  update client_preferences set is_primary = false, updated_at = now()
   where client_id = v_client and is_primary and id <> p_encargo_id;
  update client_preferences set is_primary = true, updated_at = now()
   where id = p_encargo_id and not is_primary;

  -- Las alertas por correo son del cliente: pasan con él al nuevo principal.
  if v_prev.id is not null then
    update client_preferences
       set new_listing_alerts_enabled = v_prev.new_listing_alerts_enabled,
           new_listing_alerts_frequency = v_prev.new_listing_alerts_frequency,
           new_listing_alerts_last_sent_at = v_prev.new_listing_alerts_last_sent_at
     where id = p_encargo_id;
  end if;
  return v_client;
end;
$$;

revoke all on function public.make_encargo_primary(uuid) from public, anon, authenticated;
grant execute on function public.make_encargo_primary(uuid) to service_role;

COMMIT;
