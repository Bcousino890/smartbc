-- SmartBC · Enlaces entre anuncios de particulares (mismo inmueble)
-- ============================================================
-- Un mismo piso puede estar publicado a la vez en Idealista y en Fotocasa, en
-- venta en un portal y en alquiler en otro, e incluso con otro teléfono y
-- otro nombre (la pareja del propietario). Hasta ahora cada anuncio era una
-- fila independiente de `particulares` y no había forma de verlos juntos.
--
-- Esta migración NO fusiona ni borra filas: añade la trazabilidad.
--
--   · `particulares_links`  una fila por par de anuncios relacionado, con el
--     nivel de seguridad, la regla que lo detectó y la EVIDENCIA (calle,
--     metros, habitaciones, teléfono, precio…) para poder auditarlo. El staff
--     puede confirmar o descartar un enlace; el recalculo automático respeta
--     esa decisión y nunca la pisa.
--   · `particulares.duplicate_of`  si el anuncio es una copia de otro (mismo
--     inmueble), apunta al anuncio "principal" que se muestra en el listado.
--     NULL = es principal o no tiene enlaces. El listado oculta los que
--     tienen valor, y el modal del principal enseña venta, alquiler y todos
--     los portales en la misma ficha.
--   · `particulares.link_summary` / `link_ops`  resumen ya calculado en el
--     principal (portales, operaciones, nº de anuncios, teléfonos distintos)
--     para pintar insignias y filtrar por operación sin hacer joins.
--
-- Todo lo escribe el job `/api/cron/particulares/link-twins`
-- (lib/particulares/linking-runner.ts) con la service role; es idempotente.

alter table particulares
  add column if not exists duplicate_of uuid references particulares(id) on delete set null,
  add column if not exists link_summary jsonb,
  add column if not exists link_ops text[];

create index if not exists idx_particulares_duplicate_of
  on particulares(duplicate_of) where duplicate_of is not null;
create index if not exists idx_particulares_link_ops
  on particulares using gin(link_ops) where link_ops is not null;

create table if not exists particulares_links (
  id uuid primary key default gen_random_uuid(),
  -- Siempre a_id < b_id (comparación de uuid): un par solo existe una vez.
  a_id uuid not null references particulares(id) on delete cascade,
  b_id uuid not null references particulares(id) on delete cascade,
  -- mismo_inmueble: es el mismo piso (misma o distinta operación / portal /
  --                 contacto).
  -- mismo_contacto: mismo teléfono pero OTRO inmueble (propietario con varios
  --                 pisos) — informativo, nunca agrupa fichas.
  relation text not null check (relation in ('mismo_inmueble', 'mismo_contacto')),
  -- cierto: se agrupa solo · probable: se muestra como sugerencia y el staff
  -- decide · informativo: solo para mismo_contacto.
  level text not null check (level in ('cierto', 'probable', 'informativo')),
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
  constraint particulares_links_ordered check (a_id < b_id),
  constraint particulares_links_unique unique (a_id, b_id, relation)
);
create index if not exists idx_particulares_links_a on particulares_links(a_id);
create index if not exists idx_particulares_links_b on particulares_links(b_id);
create index if not exists idx_particulares_links_relation
  on particulares_links(relation, level, status);

alter table particulares_links enable row level security;

-- Mismo reparto que particulares_share_links (0149): staff lee, admin escribe.
-- La puerta real son las rutas del servidor (service role + permisos de la app).
drop policy if exists "particulares_links_staff_select" on particulares_links;
create policy "particulares_links_staff_select"
  on particulares_links for select using (is_staff());
drop policy if exists "particulares_links_admin_write" on particulares_links;
create policy "particulares_links_admin_write"
  on particulares_links for all using (is_admin()) with check (is_admin());

-- ── Lectura y escritura en bloque para el job de enlazado ───────────────────
-- Vista con lo mínimo que necesita el algoritmo (sin descripción ni fotos: solo
-- el nº de fotos). Contiene teléfonos, así que NO se expone a anon/authenticated:
-- solo la service role (el job y las rutas del servidor).
create or replace view particulares_link_rows as
select
  p.id, p.portal, p.operation, p.is_active, p.price, p.bedrooms, p.bathrooms,
  p.square_meters, p.floor, p.address, p.latitude, p.longitude, p.phone, p.phone2,
  p.owner_name, p.assigned_to, p.created_at,
  p.duplicate_of, p.link_summary, p.link_ops,
  case when jsonb_typeof(p.photos) = 'array' then jsonb_array_length(p.photos) else 0 end as n_photos
from particulares p
where p.advertiser_type = 'particular' or p.portal in ('fotocasa', 'pisos');
revoke all on particulares_link_rows from public, anon, authenticated;
grant select on particulares_link_rows to service_role;

-- Aplica el estado de agrupado a muchas filas de una vez. No toca updated_at
-- (agrupar no es un cambio del anuncio) ni ninguna otra columna.
create or replace function apply_particulares_groups(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update particulares t
     set duplicate_of = nullif(e->>'duplicate_of', '')::uuid,
         link_summary = case when jsonb_typeof(e->'link_summary') = 'object' then e->'link_summary' else null end,
         link_ops     = case when jsonb_typeof(e->'link_ops') = 'array'
                             then array(select jsonb_array_elements_text(e->'link_ops')) else null end
    from jsonb_array_elements(p) e
   where t.id = (e->>'id')::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

-- Inserta/actualiza enlaces calculados. Un enlace confirmado o descartado por
-- una persona NUNCA se modifica desde aquí.
create or replace function apply_particulares_links(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  insert into particulares_links (a_id, b_id, relation, level, rule, score, evidence, last_seen_at)
  select (e->>'a')::uuid, (e->>'b')::uuid, e->>'relation', e->>'level', e->>'rule',
         (e->>'score')::numeric, coalesce(e->'evidence', '{}'::jsonb), now()
    from jsonb_array_elements(p) e
  on conflict (a_id, b_id, relation) do update
     set level = excluded.level, rule = excluded.rule, score = excluded.score,
         evidence = excluded.evidence, last_seen_at = now()
   where particulares_links.status = 'auto';
  get diagnostics n = row_count;
  return n;
end $$;

-- Borra los enlaces automáticos que el último cálculo ya no propone.
create or replace function prune_particulares_links(p_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from particulares_links where status = 'auto' and last_seen_at < p_before;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function apply_particulares_groups(jsonb) from public, anon, authenticated;
revoke all on function apply_particulares_links(jsonb) from public, anon, authenticated;
revoke all on function prune_particulares_links(timestamptz) from public, anon, authenticated;
grant execute on function apply_particulares_groups(jsonb) to service_role;
grant execute on function apply_particulares_links(jsonb) to service_role;
grant execute on function prune_particulares_links(timestamptz) to service_role;
