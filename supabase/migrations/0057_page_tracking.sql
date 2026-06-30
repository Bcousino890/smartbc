-- ============================================================
-- SmartBC · Tracking de páginas — page_views + page_events
-- ============================================================
-- page_views : una fila por visita de página (web pública + smartlinks)
-- page_events: eventos granulares dentro de cada visita
-- ============================================================

create table if not exists page_views (
  id            uuid        primary key default gen_random_uuid(),
  property_id   uuid        references properties(id) on delete set null,
  share_id      uuid        references property_shares(id) on delete set null,
  page_type     text        not null,   -- 'smartlink'|'public_property'|'property_list'|'home'|'contact'|'other'
  page_path     text        not null,
  referrer      text,
  session_id    text        not null,
  ip            text,
  user_agent    text,
  device_type   text,                   -- 'mobile'|'tablet'|'desktop'
  browser       text,
  os            text,
  country_code  text,                   -- 'ES'|'CL'|etc
  country_name  text,
  city          text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_page_views_property
  on page_views(property_id, created_at desc)
  where property_id is not null;

create index if not exists idx_page_views_share
  on page_views(share_id, created_at desc)
  where share_id is not null;

create index if not exists idx_page_views_session
  on page_views(session_id, created_at desc);

create index if not exists idx_page_views_page_type
  on page_views(page_type, created_at desc);

create index if not exists idx_page_views_created
  on page_views(created_at desc);

-- Eventos granulares dentro de una visita
create table if not exists page_events (
  id            uuid        primary key default gen_random_uuid(),
  page_view_id  uuid        not null references page_views(id) on delete cascade,
  event_type    text        not null,
  data          jsonb,
  created_at    timestamptz not null default now(),

  constraint valid_event_type check (event_type in (
    'photo_view', 'video_play', 'plan_view', 'scroll',
    'contact_click', 'visit_request', 'share_click', 'time_on_page'
  ))
);

create index if not exists idx_page_events_page_view
  on page_events(page_view_id, created_at desc);

create index if not exists idx_page_events_type
  on page_events(event_type, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table page_views  enable row level security;
alter table page_events enable row level security;

-- page_views: staff puede SELECT. INSERT con service role (sin policy de insert).
create policy "page_views_staff_select"
  on page_views for select using (is_staff());

-- page_events: staff puede SELECT. INSERT con service role.
create policy "page_events_staff_select"
  on page_events for select using (is_staff());
