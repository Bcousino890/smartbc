-- ============================================================
-- SmartBC · El enlazador de anuncios (particulares_link_rows) ve la precisión del pin
-- ============================================================
-- `location_precision` ('exact' | 'approximate') llega de Idealista (addressVisibility) y Fotocasa.
-- Un pin aproximado puede estar a cientos de metros del piso real, así que linking-core.ts no lo usa
-- para enlazar por coordenadas. La columna va AL FINAL: CREATE OR REPLACE VIEW no permite otra cosa.
-- Idempotente.
-- ============================================================
create or replace view particulares_link_rows as
select
  p.id, p.portal, p.operation, p.is_active, p.price, p.bedrooms, p.bathrooms, p.square_meters,
  p.floor, p.address, p.latitude, p.longitude, p.phone, p.phone2, p.owner_name, p.assigned_to,
  p.created_at, p.duplicate_of, p.link_summary, p.link_ops,
  case when jsonb_typeof(p.photos) = 'array' then jsonb_array_length(p.photos) else 0 end as n_photos,
  p.location_precision
from particulares p
where p.advertiser_type = 'particular' or p.portal in ('fotocasa', 'pisos');

revoke all on particulares_link_rows from public, anon, authenticated;
grant select on particulares_link_rows to service_role;
