-- ============================================================================
-- 0244 · make_encargo_primary: cambiar el encargo principal de un cliente de
-- forma atómica (una sola transacción). Antes se hacía en dos UPDATE desde la
-- aplicación y un fallo entre ambos dejaba al cliente sin principal.
-- Aditiva e idempotente (create or replace). Solo España.
-- Errores (errcode P0001, mensaje estable): ENCARGO_NO_EXISTE,
-- ENCARGO_NO_ACTIVO, CLIENTE_NO_ES.
-- ============================================================================
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

  update client_preferences set is_primary = false, updated_at = now()
   where client_id = v_client and is_primary and id <> p_encargo_id;
  update client_preferences set is_primary = true, updated_at = now()
   where id = p_encargo_id and not is_primary;
  return v_client;
end;
$$;

revoke all on function public.make_encargo_primary(uuid) from public, anon, authenticated;
grant execute on function public.make_encargo_primary(uuid) to service_role;
