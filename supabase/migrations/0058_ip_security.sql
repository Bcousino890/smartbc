-- ============================================================
-- SmartBC · Seguridad de IPs — blacklist, whitelist, activity log
-- ============================================================

create table if not exists ip_blacklist (
  id          uuid        primary key default gen_random_uuid(),
  ip_address  text        not null unique,
  reason      text        not null,   -- 'scraper'|'bot'|'ddos'|'suspicious'|'manual_block'
  severity    text        not null default 'high',  -- 'low'|'medium'|'high'
  cidr_range  text,
  is_active   boolean     not null default true,
  blocked_at  timestamptz not null default now(),
  expires_at  timestamptz,            -- NULL = permanente
  blocked_by  uuid        references profiles(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint valid_reason   check (reason   in ('scraper','bot','ddos','suspicious','manual_block')),
  constraint valid_severity check (severity in ('low','medium','high'))
);

create index if not exists idx_ip_blacklist_active
  on ip_blacklist(ip_address)
  where is_active = true;

create index if not exists idx_ip_blacklist_expires
  on ip_blacklist(expires_at desc)
  where is_active = true and expires_at is not null;

-- IPs de confianza que nunca se bloquean
create table if not exists ip_whitelist (
  id          uuid        primary key default gen_random_uuid(),
  ip_address  text        not null unique,
  cidr_range  text,
  description text,
  is_active   boolean     not null default true,
  added_by    uuid        references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ip_whitelist_active
  on ip_whitelist(ip_address)
  where is_active = true;

-- Log de actividad por IP (page views, bloqueos, rate-limits)
create table if not exists ip_activity_log (
  id                           uuid        primary key default gen_random_uuid(),
  ip_address                   text        not null,
  session_id                   text,
  action                       text        not null,  -- 'page_view'|'blocked'|'rate_limited'|'suspicious'
  page_path                    text,
  http_status                  int,
  detected_bot                 boolean     not null default false,
  detected_scraper             boolean     not null default false,
  request_count_last_minute    int,
  created_at                   timestamptz not null default now(),

  constraint valid_action check (action in ('page_view','blocked','rate_limited','suspicious'))
);

create index if not exists idx_ip_activity_log_ip
  on ip_activity_log(ip_address, created_at desc);

create index if not exists idx_ip_activity_log_flags
  on ip_activity_log(detected_bot, detected_scraper, created_at desc);

create index if not exists idx_ip_activity_log_created
  on ip_activity_log(created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table ip_blacklist     enable row level security;
alter table ip_whitelist     enable row level security;
alter table ip_activity_log  enable row level security;

-- ip_blacklist: admin puede ALL; staff puede SELECT
create policy "ip_blacklist_admin_all"
  on ip_blacklist for all using (is_admin()) with check (is_admin());
create policy "ip_blacklist_staff_select"
  on ip_blacklist for select using (is_staff());

-- ip_whitelist: admin puede ALL; staff puede SELECT
create policy "ip_whitelist_admin_all"
  on ip_whitelist for all using (is_admin()) with check (is_admin());
create policy "ip_whitelist_staff_select"
  on ip_whitelist for select using (is_staff());

-- ip_activity_log: staff puede SELECT. INSERT con service role.
create policy "ip_activity_log_staff_select"
  on ip_activity_log for select using (is_staff());
