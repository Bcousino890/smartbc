-- 0154 · ZONE PLACES — catálogo COMPLETO de lugares de Madrid, en casa.
--
-- La búsqueda de zona dependía del geocoder externo para todo lo que no fuera
-- universidad o POI curado, con dos costes: el ritmo de 1 req/s de Nominatim
-- (nada de sugerencias al teclear) y respuestas de calidad irregular. Esta
-- tabla trae el dato a NUESTRA base: colegios, universidades, hospitales,
-- restaurantes, centros comerciales, museos, monumentos, estaciones… de toda
-- la Comunidad de Madrid, importados una vez desde OpenStreetMap (Overpass) y
-- refrescables con el mismo script.
--
-- Con el dato en casa, las sugerencias al teclear son instantáneas y sin
-- políticas de terceros. Nominatim queda solo para direcciones y rarezas.
create table if not exists zone_places (
  id bigserial primary key,
  -- "node/123", "way/456": identidad OSM para refrescar sin duplicar y para
  -- enlazar a la página del lugar.
  osm_ref text not null unique,
  name text not null,
  -- nombre sin acentos y en minúsculas: la columna contra la que se busca.
  name_folded text not null,
  -- categorías de la casa (educacion, salud, gastronomia, compras, cultura,
  -- transporte, deporte, parque) — las mismas del resto del módulo.
  category text not null,
  lat double precision not null,
  lng double precision not null,
  address text,
  imported_at timestamptz not null default now()
);

create index if not exists zone_places_name_folded_idx
  on zone_places using gin (name_folded gin_trgm_ops);
create index if not exists zone_places_category_idx on zone_places (category);
