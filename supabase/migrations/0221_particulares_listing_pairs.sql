-- ============================================================
-- SmartBC · Pares particular ↔ anuncio de agencia (mismo inmueble)
-- ============================================================
-- Un particular que da su piso en Idealista y, después, una agencia que capta
-- ese mismo piso y lo publica como profesional. Ambos anuncios son filas de
-- `particulares` (advertiser_type particular / professional). Esta tabla guarda
-- el emparejamiento sin tocar `particulares` ni `particulares_links`.
-- El teléfono NO sirve como criterio: el particular y la agencia casi nunca lo comparten.
--   · cierto:   (reservado; aún sin regla que lo justifique)
--   · probable: mismo precio, m², habitaciones, operación y dirección.
-- Si una persona lo decide, `status` pasa a confirmado/descartado y el job no lo toca.
-- Idempotente. Se puede revertir con `drop table particulares_listing_pairs`.
-- ============================================================

create table if not exists particulares_listing_pairs (
  id uuid primary key default gen_random_uuid(),
  -- Anuncio del particular (advertiser_type = 'particular').
  particular_id uuid not null references particulares(id) on delete cascade,
  -- Anuncio de la agencia (advertiser_type = 'professional').
  agency_listing_id uuid not null references particulares(id) on delete cascade,
  level text not null check (level in ('cierto', 'probable')),
  rule text not null,
  evidence jsonb not null default '{}'::jsonb,
  -- auto: lo decidió el job · confirmado / descartado: lo decidió una persona.
  status text not null default 'auto' check (status in ('auto', 'confirmado', 'descartado')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint particulares_listing_pairs_unique unique (particular_id, agency_listing_id),
  constraint particulares_listing_pairs_distinct check (particular_id <> agency_listing_id)
);
create index if not exists idx_particulares_listing_pairs_particular on particulares_listing_pairs(particular_id);
create index if not exists idx_particulares_listing_pairs_agency on particulares_listing_pairs(agency_listing_id);

alter table particulares_listing_pairs enable row level security;
drop policy if exists "particulares_listing_pairs_staff_select" on particulares_listing_pairs;
create policy "particulares_listing_pairs_staff_select"
  on particulares_listing_pairs for select using (is_staff());
drop policy if exists "particulares_listing_pairs_admin_write" on particulares_listing_pairs;
create policy "particulares_listing_pairs_admin_write"
  on particulares_listing_pairs for all using (is_admin()) with check (is_admin());
