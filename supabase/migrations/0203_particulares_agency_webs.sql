-- ============================================================
-- SmartBC · «Web propia de la agencia» (fuente agencia_web_propia)
-- ============================================================
-- El «Enlace adicional» de un anuncio de portal (`particulares.scraper_extra.agency_url`)
-- apunta a la ficha del piso en la web de la agencia anunciante (Mobilia, Inmoweb…).
-- El job de enlazado (lib/particulares/agency-web-runner.ts) lee de forma ligera y
-- respetuosa esas fichas (1 petición por URL, tope por pasada) y guarda aquí el resultado:
-- URL canónica tras redirecciones, referencia, datos y las fotos ORIGINALES sin marca
-- de agua. Es solo caché: se puede vaciar sin perder nada (se vuelve a leer).
--
-- Además amplía, AL FINAL, las dos vistas del enlazador (0200) con `agency_url` para que
-- «misma ficha en la web de la agencia / mismo dominio + referencia» sea señal de matching.
-- (Antes llevaba el número 0202 en el encargo; 0202 ya está ocupado por catalog_photo_prefs.)
-- Idempotente. No toca datos de `particulares`.
-- ============================================================

create table if not exists particulares_agency_webs (
  -- URL normalizada (dominio sin www + ruta en minúsculas + query ordenada), ver normalizeAgencyUrl().
  url_key text primary key,
  url text not null,
  final_url text,
  canonical_url text,
  domain text not null,
  cms text,
  ref text,
  status text not null default 'error' check (status in ('ok', 'gone', 'error', 'unsupported')),
  http_status integer,
  -- {title, operation, price, square_meters, bedrooms, bathrooms, floor, address, description, available}
  data jsonb not null default '{}'::jsonb,
  -- URLs de las fotos originales sin marca de agua (Mobilia: «-original.jpg»).
  photos jsonb not null default '[]'::jsonb,
  attempts integer not null default 0,
  error text,
  fetched_at timestamptz,
  -- Los fallos se reintentan con espera creciente; las lecturas buenas se refrescan a los 14 días.
  next_retry_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_particulares_agency_webs_retry on particulares_agency_webs(next_retry_at);
create index if not exists idx_particulares_agency_webs_domain_ref on particulares_agency_webs(domain, ref);

alter table particulares_agency_webs enable row level security;
drop policy if exists "particulares_agency_webs_staff_select" on particulares_agency_webs;
create policy "particulares_agency_webs_staff_select"
  on particulares_agency_webs for select using (is_staff());
drop policy if exists "particulares_agency_webs_admin_write" on particulares_agency_webs;
create policy "particulares_agency_webs_admin_write"
  on particulares_agency_webs for all using (is_admin()) with check (is_admin());

-- Vistas del enlazador: mismas filas y columnas que en 0200 + `agency_url` al final.
create or replace view particulares_link_rows as
select
  p.id, p.portal, p.operation, p.is_active, p.price, p.bedrooms, p.bathrooms, p.square_meters,
  p.floor, p.address, p.latitude, p.longitude, p.phone, p.phone2, p.owner_name, p.assigned_to,
  p.created_at, p.duplicate_of, p.link_summary, p.link_ops,
  case when jsonb_typeof(p.photos) = 'array' then jsonb_array_length(p.photos) else 0 end as n_photos,
  p.location_precision,
  p.advertiser_type,
  p.agency_key,
  p.reference,
  p.external_id,
  p.scraper_extra->>'portal_id' as portal_id,
  p.scraper_extra->>'agency_reference' as agency_reference,
  left(p.description, 700) as description,
  case when jsonb_typeof(p.photos) = 'array'
       then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(p.photos) e limit 8) t)
       else '[]'::jsonb end as photos_head,
  p.scraper_extra->>'agency_url' as agency_url
from particulares p
where p.advertiser_type = 'particular' or p.portal in ('fotocasa', 'pisos');

create or replace view particulares_agency_rows as
select
  p.id, p.portal, p.operation, p.is_active, p.price, p.bedrooms, p.bathrooms, p.square_meters,
  p.floor, p.address, p.latitude, p.longitude, p.phone, p.phone2, p.owner_name, p.assigned_to,
  p.created_at, p.duplicate_of, p.link_summary, p.link_ops,
  case when jsonb_typeof(p.photos) = 'array' then jsonb_array_length(p.photos) else 0 end as n_photos,
  p.location_precision,
  p.advertiser_type,
  p.agency_key,
  p.reference,
  p.external_id,
  p.scraper_extra->>'portal_id' as portal_id,
  p.scraper_extra->>'agency_reference' as agency_reference,
  left(p.description, 700) as description,
  case when jsonb_typeof(p.photos) = 'array'
       then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(p.photos) e limit 8) t)
       else '[]'::jsonb end as photos_head,
  p.scraper_extra->>'agency_url' as agency_url
from particulares p
where p.advertiser_type = 'professional' and p.portal not in ('fotocasa', 'pisos');

revoke all on particulares_link_rows from public, anon, authenticated;
grant select on particulares_link_rows to service_role;
revoke all on particulares_agency_rows from public, anon, authenticated;
grant select on particulares_agency_rows to service_role;
