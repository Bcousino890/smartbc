-- Soporte multi-país: Crear tabla de países y jerarquía de ubicaciones para Chile

-- Tabla de países
create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  code varchar(2) not null unique,
  name_es varchar(255) not null,
  name_en varchar(255) not null,
  currency_code varchar(3) not null,
  created_at timestamp with time zone default now()
);

-- Crear índices para búsquedas rápidas
create index if not exists idx_countries_code on countries(code);

-- Insertar países base (España y Chile)
insert into countries (code, name_es, name_en, currency_code)
values
  ('ES', 'España', 'Spain', 'EUR'),
  ('CL', 'Chile', 'Chile', 'CLP')
on conflict (code) do nothing;

-- Tabla de jerarquía de ubicaciones: Región → Comuna → Sector
-- Soporta tanto estructuras españolas como chilenas
create table if not exists location_hierarchies (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,

  -- Nivel 1: Región/Comunidad Autónoma (España) o Región (Chile)
  region_name varchar(255) not null,
  region_code varchar(50),

  -- Nivel 2: Comuna/Ciudad (Chile) o Provincia (España)
  commune_name varchar(255) not null,
  commune_code varchar(50),

  -- Nivel 3: Sector/Barrio (Chile) o Neighborhood (España)
  sector_name varchar(255) not null,
  sector_code varchar(50),

  -- Polígono GeoJSON para geofencing (opcional)
  polygon_geojson jsonb,

  -- Prioridad para UI (ej: RM = 1)
  priority integer default 999,

  -- Metadata
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índices para búsquedas jerárquicas
create index if not exists idx_location_country on location_hierarchies(country_id);
create index if not exists idx_location_region on location_hierarchies(region_code, country_id);
create index if not exists idx_location_commune on location_hierarchies(commune_code, region_code, country_id);
create index if not exists idx_location_sector on location_hierarchies(sector_code, commune_code, region_code, country_id);
create index if not exists idx_location_active on location_hierarchies(is_active);

-- Vista para obtener regiones únicas por país
create or replace view regions_by_country as
select distinct
  country_id,
  region_code,
  region_name,
  priority
from location_hierarchies
where is_active = true
order by priority, region_name;

-- Vista para obtener comunas por región
create or replace view communes_by_region as
select distinct
  region_code,
  region_name,
  country_id,
  commune_code,
  commune_name,
  priority
from location_hierarchies
where is_active = true
order by priority, commune_name;

-- Vista para obtener sectores por comuna
create or replace view sectors_by_commune as
select distinct
  commune_code,
  commune_name,
  region_code,
  region_name,
  country_id,
  sector_code,
  sector_name,
  polygon_geojson,
  priority
from location_hierarchies
where is_active = true
order by priority, sector_name;
