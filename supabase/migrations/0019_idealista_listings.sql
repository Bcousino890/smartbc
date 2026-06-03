-- Almacena los datos de preparación para publicar en Idealista
-- La API de Idealista está en beta; los anuncios se suben manualmente
CREATE TABLE IF NOT EXISTS idealista_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Tipo de inmueble
  property_type text DEFAULT 'flat',

  -- Localización
  address_street text,
  address_number text,
  address_postal_code text,
  address_city text,
  address_block text,
  address_door text,
  address_visibility text DEFAULT 'exact', -- exact | street | hidden

  -- Características básicas
  square_meters integer,
  built_square_meters integer,
  floor text,
  bedrooms integer DEFAULT 0,
  bathrooms integer DEFAULT 0,
  condition text DEFAULT 'good', -- good | to-reform | needs-reform | new

  -- Precio y alquiler
  price integer,
  total_rental_price integer,
  rental_type text DEFAULT 'residential', -- residential | temporary
  max_tenants integer DEFAULT 0,
  pets_allowed boolean DEFAULT false,
  children_recommended boolean DEFAULT false,

  -- Equipamiento e interiores
  equipment_type text DEFAULT 'unknown', -- furnished | kitchen-only | empty | unknown
  windows_location text DEFAULT 'exterior', -- interior | exterior
  has_elevator boolean DEFAULT false,

  -- Orientación
  orientation_north boolean DEFAULT false,
  orientation_south boolean DEFAULT false,
  orientation_east boolean DEFAULT false,
  orientation_west boolean DEFAULT false,

  -- Características adicionales
  has_terrace boolean DEFAULT false,
  has_balcony boolean DEFAULT false,
  has_parking boolean DEFAULT false,
  has_storage boolean DEFAULT false,
  has_pool boolean DEFAULT false,
  has_garden boolean DEFAULT false,
  has_wardrobes boolean DEFAULT false,
  has_ac boolean DEFAULT false,

  -- Tipos especiales
  is_penthouse boolean DEFAULT false,
  is_studio boolean DEFAULT false,
  is_duplex boolean DEFAULT false,

  -- Eficiencia energética
  energy_class text,
  energy_performance numeric,
  emission_rating text,
  emission_value numeric,

  -- Contacto y notas internas
  contact_id text,
  notes text,

  -- Media (IDs tras subida manual a Idealista)
  photo_ids text[] DEFAULT '{}',
  video_ids text[] DEFAULT '{}',
  plan_ids text[] DEFAULT '{}',

  -- Estado del anuncio en Idealista (draft = solo preparado, published = publicado manualmente)
  idealista_property_id text,
  idealista_state text DEFAULT 'draft',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idealista_listings_property_id_key ON idealista_listings(property_id);

ALTER TABLE idealista_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_idealista_listings"
  ON idealista_listings FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'owner'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('admin', 'owner'));
