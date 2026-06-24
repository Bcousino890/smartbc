-- Tabla de captaciones (prospecting de propiedades)
CREATE TABLE captaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL CHECK (country IN ('es', 'cl')) DEFAULT 'cl',

  -- Creador (agente/admin)
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- URL y datos scrapeados
  source_url TEXT NOT NULL,
  source_site TEXT, -- 'portalinmobiliario', 'corredora_xyz', etc.

  -- Datos básicos scrapeados
  title TEXT,
  description TEXT,
  price NUMERIC,
  currency TEXT DEFAULT 'clp',
  bedrooms INTEGER,
  bathrooms INTEGER,
  square_meters INTEGER,
  cover_photo_url TEXT,

  -- Ubicación
  region TEXT,
  commune TEXT,
  zone TEXT,
  subzone TEXT,
  address_scraped TEXT,
  latitude NUMERIC,
  longitude NUMERIC,

  -- Datos completados por captadora
  owner_phone TEXT,
  owner_name TEXT,
  owner_contact TEXT,
  address_real TEXT,
  owner_confirmed BOOLEAN DEFAULT FALSE,

  -- Asignación
  assigned_to UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'converted_to_property', 'rejected')),

  -- Tracking
  converted_to_property_id UUID REFERENCES properties(id),
  completed_at TIMESTAMP WITH TIME ZONE,

  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE captacion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captacion_id UUID NOT NULL REFERENCES captaciones(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('call', 'visit', 'message', 'whatsapp')),
  result TEXT NOT NULL CHECK (result IN ('answered', 'no_answer', 'interested', 'not_interested', 'call_back', 'wrong_number', 'busy')),

  owner_phone TEXT,
  owner_name TEXT,
  owner_contact TEXT,
  address_real TEXT,
  notes TEXT,
  photo_url TEXT,

  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_captaciones_country ON captaciones(country);
CREATE INDEX idx_captaciones_created_by ON captaciones(created_by);
CREATE INDEX idx_captaciones_assigned_to ON captaciones(assigned_to);
CREATE INDEX idx_captaciones_status ON captaciones(status);
CREATE INDEX idx_captaciones_commune ON captaciones(commune) WHERE commune IS NOT NULL;
CREATE INDEX idx_captacion_logs_captacion_id ON captacion_logs(captacion_id);

ALTER TABLE captaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE captacion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_admins_view" ON captaciones FOR SELECT
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent')));

CREATE POLICY "agents_admins_create" ON captaciones FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent')));

CREATE POLICY "captadoras_view_assigned" ON captaciones FOR SELECT
  USING (assigned_to = auth.uid() OR auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin'));

CREATE POLICY "captadoras_update_assigned" ON captaciones FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE POLICY "captadoras_create_logs" ON captacion_logs FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'captadora'));

COMMENT ON TABLE captaciones IS 'Propiedades en prospección - agentes crean, captadoras completan info';
COMMENT ON TABLE captacion_logs IS 'Historial de intentos de contacto por captadoras';
