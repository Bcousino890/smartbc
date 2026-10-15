-- ============================================================
-- SmartBC · Taxonomía de fuentes + señales de matching con agencias (sobre 0198)
-- ============================================================
-- Tipos de fuente de un inmueble:
--   particular      → anuncio de propietario (advertiser_type <> 'professional')
--   agencia_portal  → agencia anunciante en un portal (advertiser_type = 'professional')
--   agencia_web     → web directa de agencia colaboradora (`properties`, migración 0198)
--
-- Esta migración solo AMPLÍA lo que ve el enlazador (lib/particulares/linking-runner.ts):
--  · `particulares_link_rows` (la vista de 0176/0184) gana, AL FINAL, el tipo de anunciante,
--    la agencia normalizada, referencias, texto recortado y las primeras fotos. Mismas filas
--    que antes: el agrupado de particulares no cambia.
--  · `particulares_agency_rows` (nueva): anuncios de agencias en portales (professional) que
--    NO están ya en la vista anterior (fotocasa/pisos profesionales siguen allí).
-- Solo service_role (contienen teléfonos). No toca datos. Idempotente.
-- ============================================================

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
       else '[]'::jsonb end as photos_head
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
       else '[]'::jsonb end as photos_head
from particulares p
where p.advertiser_type = 'professional' and p.portal not in ('fotocasa', 'pisos');

revoke all on particulares_link_rows from public, anon, authenticated;
grant select on particulares_link_rows to service_role;
revoke all on particulares_agency_rows from public, anon, authenticated;
grant select on particulares_agency_rows to service_role;
