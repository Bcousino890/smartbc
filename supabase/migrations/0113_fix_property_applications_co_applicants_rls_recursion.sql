-- ============================================================
-- SmartBC · Fix: recursión infinita en RLS (42P17) entre
--   property_applications y property_application_co_applicants
-- ============================================================
-- Causa raíz de "/documentacion no abre" (Application error, digest
-- persistente, código Postgres 42P17 "infinite recursion detected in
-- policy for relation property_applications"):
--
--   - La política "applications_client_read_own" (migración 0070) sobre
--     property_applications subconsulta property_application_co_applicants
--     para saber si el usuario es co-solicitante.
--   - Las políticas "co_applicants_read" e "co_applicants_insert"
--     (también 0070) sobre property_application_co_applicants
--     subconsultan de vuelta property_applications para saber si el
--     usuario es el titular.
--
-- Cada subconsulta dispara la RLS de la OTRA tabla, que vuelve a
-- disparar la primera: Postgres detecta el ciclo y aborta con 42P17 en
-- CUALQUIER select sobre property_applications hecho con la sesión de un
-- cliente normal (no service role). Como la primera query de
-- /documentacion pega directo a esa tabla, el feature nunca llegó a
-- funcionar para un cliente real desde que existen estas políticas.
--
-- Fix: dos funciones SECURITY DEFINER que consultan cada tabla saltando
-- su propia RLS (mismo principio que createAdminClient en el código de
-- la app: solo se usa para saltar RLS en un chequeo puntual ya
-- controlado, nunca para decidir permisos). Las políticas llaman a la
-- función en vez de subconsultar la tabla directamente, así ninguna de
-- las dos vuelve a disparar RLS sobre la otra y el ciclo desaparece.
-- Idempotente: create or replace + drop policy if exists.
-- ============================================================

create or replace function property_application_is_co_applicant(app_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from property_application_co_applicants
    where property_application_id = app_id
      and client_id = uid
  );
$$;

create or replace function property_application_is_owner(app_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from property_applications
    where id = app_id
      and client_id = uid
  );
$$;

revoke all on function property_application_is_co_applicant(uuid, uuid) from public;
revoke all on function property_application_is_owner(uuid, uuid) from public;
grant execute on function property_application_is_co_applicant(uuid, uuid) to authenticated;
grant execute on function property_application_is_owner(uuid, uuid) to authenticated;

-- ─── property_applications ──────────────────────────────────

drop policy if exists "applications_client_read_own" on property_applications;
create policy "applications_client_read_own" on property_applications
  for select using (
    client_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
    or property_application_is_co_applicant(id, auth.uid())
  );

-- ─── property_application_co_applicants ─────────────────────

drop policy if exists "co_applicants_read" on property_application_co_applicants;
create policy "co_applicants_read" on property_application_co_applicants
  for select using (
    client_id = auth.uid()
    or property_application_is_owner(property_application_id, auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

drop policy if exists "co_applicants_insert" on property_application_co_applicants;
create policy "co_applicants_insert" on property_application_co_applicants
  for insert with check (
    property_application_is_owner(property_application_id, auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor'))
  );

-- Recargar el schema cache de PostgREST para que la API vea las funciones
-- y políticas nuevas sin esperar a un restart del contenedor rest.
NOTIFY pgrst, 'reload schema';
