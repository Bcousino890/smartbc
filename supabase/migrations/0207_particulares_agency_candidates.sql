-- ============================================================
-- SmartBC · Candidatos del pase de agencias en portales (rendimiento del job link-twins)
-- ============================================================
-- `particulares_agency_rows` (0200) tiene ~70.000 filas «professional» de Idealista. Cargarlas y compararlas todas
-- en cada pasada (cada 10 min) costaba ~14 s de cálculo, 1,5 GB de RAM y dejó el job sin terminar. Solo pueden
-- enlazar con algo (otra publicación de la misma agencia, una propiedad del CRM, una web de agencia) las que cumplen
-- alguna de estas condiciones:
--   · enlazan una web de la agencia (scraper_extra.agency_url);
--   · hay una propiedad del CRM con los mismos m², habitaciones y operación, precio ±10 % y (si hay coordenadas
--     en ambos lados) a < ~3 km;
--   · su id de portal coincide con el del external_id de una propiedad del CRM;
--   · la misma agencia tiene OTRA publicación con la misma referencia.
-- Se unen con UNION (con OR el planificador anida bucles y tarda 26 s; así ~0,5 s).
-- Solo service_role. Idempotente. No toca datos.
-- ============================================================

create or replace view particulares_agency_candidate_ids as
 select p.id from particulares p
  where p.advertiser_type = 'professional' and p.portal not in ('fotocasa', 'pisos') and p.scraper_extra->>'agency_url' is not null
 union
 select p.id from particulares p
  where p.advertiser_type = 'professional' and p.portal not in ('fotocasa', 'pisos')
    and exists (select 1 from properties x
                 where x.archived_at is null and x.country = 'es' and x.agency_id is not null
                   and x.square_meters = p.square_meters and x.bedrooms = p.bedrooms and x.operation::text = p.operation
                   and x.price > 0 and p.price > 0 and abs(x.price - p.price) <= 0.1 * p.price
                   and (x.latitude is null or p.latitude is null
                        or (abs(x.latitude - p.latitude) < 0.03 and abs(x.longitude - p.longitude) < 0.04)))
 union
 select p.id from particulares p
  where p.advertiser_type = 'professional' and p.portal not in ('fotocasa', 'pisos')
    and p.external_id in (select substring(x.external_id from '(\d{6,})\s*$') from properties x where x.external_id is not null)
 union
 select p.id from particulares p
  where p.advertiser_type = 'professional' and p.portal not in ('fotocasa', 'pisos')
    and (p.agency_key, p.reference) in (
      select agency_key, reference from particulares
       where advertiser_type = 'professional' and agency_key is not null and length(reference) >= 3
       group by 1, 2 having count(*) > 1);

-- Todas las filas candidatas en UNA llamada (PostgREST corta las vistas a 1.000 filas por petición).
create or replace function get_particulares_agency_candidates()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    from particulares_agency_rows r
   where r.id in (select id from particulares_agency_candidate_ids)
$$;

revoke all on particulares_agency_candidate_ids from public, anon, authenticated;
grant select on particulares_agency_candidate_ids to service_role;
revoke all on function get_particulares_agency_candidates() from public, anon, authenticated;
grant execute on function get_particulares_agency_candidates() to service_role;
