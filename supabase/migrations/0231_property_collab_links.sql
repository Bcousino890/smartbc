-- SmartBC · Enlaces temporales "en blanco" de una propiedad (empresa colaboradora)
-- ============================================================
-- Un asesor necesita pasar una propiedad a OTRA empresa sin que vea nada de BC:
-- ni logo, ni teléfono, ni correo, ni nombre. Solo "Empresa colaboradora" y la
-- referencia de la propiedad (property_reference, sin iniciales de BC).
--
-- Tabla y ruta propias (/colaboracion/{token}), aparte de property_shares
-- (SmartLinks) y de los enlaces de particulares (/a/{token}).
--
-- Cada apertura queda registrada (IP, navegador, procedencia) para que el
-- equipo sepa quién lo abrió y cuándo. `is_bot` separa las vistas previas de
-- WhatsApp/Slack/etc., que si no inflarían el contador al pegar el enlace.
--
-- Idempotente: post-deploy relanza las migraciones.

create table if not exists property_collab_links (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  token text not null unique,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  opened_count integer not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_property_collab_links_property
  on property_collab_links(property_id, created_at desc);

create table if not exists property_collab_opens (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references property_collab_links(id) on delete cascade,
  opened_at timestamptz not null default now(),
  ip text,
  user_agent text,
  referer text,
  is_bot boolean not null default false
);
create index if not exists idx_property_collab_opens_link
  on property_collab_opens(link_id, opened_at desc);

alter table property_collab_links enable row level security;
alter table property_collab_opens enable row level security;

-- Mismo reparto que property_shares: staff lee, admin escribe. La puerta real
-- es el server action (checkPermission) y la ruta pública resuelve con service
-- role; esto es defensa en profundidad.
drop policy if exists "property_collab_links_staff_select" on property_collab_links;
create policy "property_collab_links_staff_select"
  on property_collab_links for select using (is_staff());
drop policy if exists "property_collab_links_admin_write" on property_collab_links;
create policy "property_collab_links_admin_write"
  on property_collab_links for all using (is_admin()) with check (is_admin());

drop policy if exists "property_collab_opens_staff_select" on property_collab_opens;
create policy "property_collab_opens_staff_select"
  on property_collab_opens for select using (is_staff());
