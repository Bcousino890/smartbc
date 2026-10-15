-- ============================================================
-- SmartBC · Particulares ↔ propiedades de agencias del CRM (mismo inmueble)
-- ============================================================
-- Una propiedad de agencia colaboradora (`properties`: Housingo, Level, Portales
-- externos…) puede ser el MISMO piso que un anuncio de particular. El job
-- `/api/cron/particulares/link-twins` (lib/particulares/agency-matching.ts)
-- reutiliza el enlazador de 0176, con matching estricto (dirección + m² +
-- habitaciones + baños + precio; el teléfono de la agencia NO cuenta) y guarda
-- aquí los pares. Los «cierto» además suman la fuente «Agencia» al
-- `particulares.link_summary` (sin columnas nuevas en `particulares`).
-- No fusiona ni borra nada. Idempotente. NO toca `particulares_links`.
-- ============================================================

create table if not exists particulares_agency_matches (
  id uuid primary key default gen_random_uuid(),
  particular_id uuid not null references particulares(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  level text not null check (level in ('cierto', 'probable')),
  rule text not null,
  score numeric,
  evidence jsonb not null default '{}'::jsonb,
  -- auto: lo decidió el job · confirmado / descartado: lo decidió una persona
  -- (el job no lo toca nunca más).
  status text not null default 'auto' check (status in ('auto', 'confirmado', 'descartado')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint particulares_agency_matches_unique unique (particular_id, property_id)
);
create index if not exists idx_particulares_agency_matches_particular on particulares_agency_matches(particular_id);
create index if not exists idx_particulares_agency_matches_property on particulares_agency_matches(property_id);

alter table particulares_agency_matches enable row level security;
drop policy if exists "particulares_agency_matches_staff_select" on particulares_agency_matches;
create policy "particulares_agency_matches_staff_select"
  on particulares_agency_matches for select using (is_staff());
drop policy if exists "particulares_agency_matches_admin_write" on particulares_agency_matches;
create policy "particulares_agency_matches_admin_write"
  on particulares_agency_matches for all using (is_admin()) with check (is_admin());

-- Inserta/actualiza pares calculados; una decisión humana NUNCA se modifica desde aquí.
create or replace function apply_particulares_agency_matches(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  insert into particulares_agency_matches (particular_id, property_id, level, rule, score, evidence, last_seen_at)
  select (e->>'particular_id')::uuid, (e->>'property_id')::uuid, e->>'level', e->>'rule',
         (e->>'score')::numeric, coalesce(e->'evidence', '{}'::jsonb), now()
    from jsonb_array_elements(p) e
  on conflict (particular_id, property_id) do update
     set level = excluded.level, rule = excluded.rule, score = excluded.score,
         evidence = excluded.evidence, last_seen_at = now()
   where particulares_agency_matches.status = 'auto';
  get diagnostics n = row_count;
  return n;
end $$;

-- Borra los pares automáticos que el último cálculo ya no propone.
create or replace function prune_particulares_agency_matches(p_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from particulares_agency_matches where status = 'auto' and last_seen_at < p_before;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function apply_particulares_agency_matches(jsonb) from public, anon, authenticated;
revoke all on function prune_particulares_agency_matches(timestamptz) from public, anon, authenticated;
grant execute on function apply_particulares_agency_matches(jsonb) to service_role;
grant execute on function prune_particulares_agency_matches(timestamptz) to service_role;
