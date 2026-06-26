-- Especificaciones arquitectónicas de propiedades (Chile)
-- Incluye campos específicos del mercado chileno

create table if not exists property_architectural_specs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,

  -- Dormitorio de servicio (típico en Chile)
  has_service_bedroom boolean default false,

  -- Tipo arquitectónico
  architectural_type varchar(100),
    -- ej: 'mediterranea', 'chilena', 'inglesa', 'moderna', 'neoclasica'

  -- Número total de pisos en la propiedad
  num_floors integer,

  -- Es parte de condominio
  is_condominium boolean default false,

  -- Si es edificio, desde qué piso
  building_floor integer,

  -- Orientación principal
  orientation varchar(50),
    -- ej: 'norte', 'sur', 'oriente', 'poniente', 'norponiente'

  -- Estacionamientos
  parking_spaces integer default 0,

  -- Otros espacios
  has_laundry_area boolean default false,
  has_storage boolean default false,
  has_garden boolean default false,

  -- Metadata
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_property_specs_property on property_architectural_specs(property_id);
create index if not exists idx_property_specs_type on property_architectural_specs(architectural_type);
create index if not exists idx_property_specs_condominium on property_architectural_specs(is_condominium);

-- Tabla de precios en múltiples monedas
create table if not exists property_prices (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,

  -- Precio en CLP (moneda base)
  price_clp integer not null,

  -- Precio en UF (unidad de fomento chilena)
  price_uf decimal(12, 2),

  -- Tipo de cambio usado para la conversión (referencial)
  clp_to_uf_rate decimal(10, 4),

  -- Operación asociada: alquiler o venta
  operation varchar(50) not null,
    -- 'alquiler' o 'venta'

  -- Período de renta (si aplica)
  rental_period varchar(50),
    -- 'mes', 'día', 'año'

  -- Metadata
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_property_prices_property on property_prices(property_id);
create index if not exists idx_property_prices_operation on property_prices(operation);
create index if not exists idx_property_prices_clp on property_prices(price_clp);
create index if not exists idx_property_prices_uf on property_prices(price_uf);

-- Agregar columnas a tabla de propiedades para enlazar con nueva estructura
alter table properties add column if not exists country_id uuid references countries(id);
alter table properties add column if not exists region_id uuid references location_hierarchies(id);
alter table properties add column if not exists commune_id uuid references location_hierarchies(id);
alter table properties add column if not exists sector_id uuid references location_hierarchies(id);
alter table properties add column if not exists currency_display varchar(3) default 'CLP';

-- Índices para las nuevas columnas
create index if not exists idx_properties_country on properties(country_id);
create index if not exists idx_properties_region on properties(region_id);
create index if not exists idx_properties_commune on properties(commune_id);
create index if not exists idx_properties_sector on properties(sector_id);
