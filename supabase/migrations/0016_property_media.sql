-- Table for storing property media (photos, videos, plans)
create table property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  type text not null check (type in ('photo', 'video', 'plan')),
  file_name text not null,
  storage_path text not null unique,
  url text not null,
  has_watermark boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint valid_url check (url ~ '^https?://')
);

-- Index for quick queries by property
create index idx_property_media_property_id on property_media(property_id);
create index idx_property_media_type on property_media(type);

-- RLS
alter table property_media enable row level security;

-- Admin can read/write all media
create policy "admin_select" on property_media for select using (
  exists (
    select 1 from internal_users
    where id = auth.uid() and role_key in ('owner', 'admin')
  )
);

create policy "admin_insert" on property_media for insert with check (
  exists (
    select 1 from internal_users
    where id = auth.uid() and role_key in ('owner', 'admin')
  )
);

create policy "admin_delete" on property_media for delete using (
  exists (
    select 1 from internal_users
    where id = auth.uid() and role_key in ('owner', 'admin')
  )
);
