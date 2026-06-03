-- Table for storing Idealista listing data
create table idealista_listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references properties(id) on delete cascade,
  square_meters integer,
  built_square_meters integer,
  price integer,
  total_rental_price integer,
  has_elevator boolean default false,
  rental_type text check (rental_type in ('residential', 'temporary')),
  floor text,
  condition text check (condition in ('good', 'to-reform', 'needs-reform')),
  energy_class text,
  equipment text,
  photo_ids uuid[],
  video_ids uuid[],
  plan_ids uuid[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for quick lookups
create index idx_idealista_listings_property_id on idealista_listings(property_id);

-- RLS
alter table idealista_listings enable row level security;

-- Admin can read/write all listings
create policy "admin_select" on idealista_listings for select using (
  exists (
    select 1 from internal_users
    where id = auth.uid() and role_key in ('owner', 'admin')
  )
);

create policy "admin_insert" on idealista_listings for insert with check (
  exists (
    select 1 from internal_users
    where id = auth.uid() and role_key in ('owner', 'admin')
  )
);

create policy "admin_update" on idealista_listings for update using (
  exists (
    select 1 from internal_users
    where id = auth.uid() and role_key in ('owner', 'admin')
  )
);

create policy "admin_delete" on idealista_listings for delete using (
  exists (
    select 1 from internal_users
    where id = auth.uid() and role_key in ('owner', 'admin')
  )
);
