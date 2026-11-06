-- Reversión de 0246 (RLS del cliente sobre el principal, CHECK del principal activo y
-- make_encargo_primary que hereda las alertas). Idempotente. Deja las políticas de 0001 y la
-- función de 0244 tal cual eran. Va ANTES de rollback-0245/0244/0243.
-- ⚠️ Con las políticas de 0001 un cliente del portal vuelve a poder crear/alterar encargos
-- por PostgREST: revertir solo junto con el resto de la funcionalidad.

BEGIN;

DROP POLICY IF EXISTS "client_preferences_self_select" ON client_preferences;
CREATE POLICY "client_preferences_self_select" ON client_preferences
  FOR SELECT USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "client_preferences_self_upsert" ON client_preferences;
CREATE POLICY "client_preferences_self_upsert" ON client_preferences
  FOR ALL USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

ALTER TABLE client_preferences DROP CONSTRAINT IF EXISTS client_preferences_primary_active_check;

-- make_encargo_primary como en 0244 (si 0244 sigue aplicada; si no existe, no se crea).
DO $do$
BEGIN
  IF to_regprocedure('public.make_encargo_primary(uuid)') IS NOT NULL THEN
    EXECUTE $fn$
create or replace function public.make_encargo_primary(p_encargo_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_client uuid;
  v_status text;
  v_country text;
begin
  select client_id into v_client from client_preferences where id = p_encargo_id;
  if v_client is null then
    raise exception 'ENCARGO_NO_EXISTE' using errcode = 'P0001';
  end if;

  perform 1 from client_preferences where client_id = v_client for update;

  select status into v_status from client_preferences where id = p_encargo_id;
  if v_status is distinct from 'active' then
    raise exception 'ENCARGO_NO_ACTIVO' using errcode = 'P0001';
  end if;

  select country into v_country from profiles where id = v_client;
  if v_country is distinct from 'es' then
    raise exception 'CLIENTE_NO_ES' using errcode = 'P0001';
  end if;

  update client_preferences set is_primary = false, updated_at = now()
   where client_id = v_client and is_primary and id <> p_encargo_id;
  update client_preferences set is_primary = true, updated_at = now()
   where id = p_encargo_id and not is_primary;
  return v_client;
end;
$$;
$fn$;
    EXECUTE 'revoke all on function public.make_encargo_primary(uuid) from public, anon, authenticated';
    EXECUTE 'grant execute on function public.make_encargo_primary(uuid) to service_role';
  END IF;
END
$do$;

COMMIT;
