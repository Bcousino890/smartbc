-- Geofencing: Zonas con polígonos para sugerir propiedades cercanas

create table if not exists geofence_zones (
  id uuid primary key default gen_random_uuid(),

  -- Referencia a la jerarquía de ubicación
  location_hierarchy_id uuid not null references location_hierarchies(id) on delete cascade,

  -- Polígono GeoJSON detallado (puede ser más granular que location_hierarchy)
  polygon_geojson jsonb not null,

  -- Nombre descriptivo de la zona
  zone_name varchar(255) not null,

  -- Descripción
  description text,

  -- Tipo de zona
  zone_type varchar(50),
    -- ej: 'barrio', 'comuna', 'sector_especial'

  -- Radio de búsqueda en metros (opcional, para búsquedas por proximidad)
  search_radius_meters integer,

  -- Metadata
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_geofence_location on geofence_zones(location_hierarchy_id);
create index if not exists idx_geofence_active on geofence_zones(is_active);
create index if not exists idx_geofence_type on geofence_zones(zone_type);

-- Actualizar tabla client_preferences para soportar filtros chilenos

-- Agregar columnas si no existen
alter table client_preferences add column if not exists country_id uuid references countries(id);

-- Preferencias de ubicación por país (JSON para mantener flexibilidad)
alter table client_preferences add column if not exists preferred_regions text[] default array[]::text[];
alter table client_preferences add column if not exists preferred_communes text[] default array[]::text[];
alter table client_preferences add column if not exists preferred_sectors text[] default array[]::text[];
alter table client_preferences add column if not exists preferred_geofence_zones uuid[] default array[]::uuid[];

-- Preferencias arquitectónicas
alter table client_preferences add column if not exists requires_service_bedroom boolean;
alter table client_preferences add column if not exists preferred_architectural_types text[] default array[]::text[];
alter table client_preferences add column if not exists min_parking_spaces integer;
alter table client_preferences add column if not exists max_parking_spaces integer;
alter table client_preferences add column if not exists prefers_condominium boolean;
alter table client_preferences add column if not exists preferred_orientations text[] default array[]::text[];
alter table client_preferences add column if not exists min_floors integer;

-- Preferencias de precio
alter table client_preferences add column if not exists currency_preference varchar(3) default 'CLP';
alter table client_preferences add column if not exists min_price_uf decimal(12, 2);
alter table client_preferences add column if not exists max_price_uf decimal(12, 2);

-- Índices para búsquedas
create index if not exists idx_client_pref_country on client_preferences(country_id);
create index if not exists idx_client_pref_regions on client_preferences using gin(preferred_regions);
create index if not exists idx_client_pref_communes on client_preferences using gin(preferred_communes);
create index if not exists idx_client_pref_sectors on client_preferences using gin(preferred_sectors);
