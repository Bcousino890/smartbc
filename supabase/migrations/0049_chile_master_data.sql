-- Tabla maestra de regiones de Chile
CREATE TABLE IF NOT EXISTS chile_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- RM, VI, etc.
  name TEXT NOT NULL,
  full_name TEXT -- "Región Metropolitana de Santiago"
);

-- Tabla maestra de comunas
CREATE TABLE IF NOT EXISTS chile_communes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES chile_regions(id),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  UNIQUE(region_id, name)
);

-- Tabla maestra de zonas dentro de comunas
CREATE TABLE IF NOT EXISTS chile_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id UUID NOT NULL REFERENCES chile_communes(id),
  name TEXT NOT NULL,
  UNIQUE(commune_id, name)
);

-- Tabla maestra de sub-zonas
CREATE TABLE IF NOT EXISTS chile_subzones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES chile_zones(id),
  name TEXT NOT NULL,
  UNIQUE(zone_id, name)
);

-- Índices
CREATE INDEX idx_chile_communes_region_id ON chile_communes(region_id);
CREATE INDEX idx_chile_zones_commune_id ON chile_zones(commune_id);
CREATE INDEX idx_chile_subzones_zone_id ON chile_subzones(zone_id);

-- Insertar regiones de Chile
INSERT INTO chile_regions (code, name, full_name) VALUES
  ('XV', 'Arica y Parinacota', 'Región de Arica y Parinacota'),
  ('I', 'Tarapacá', 'Región de Tarapacá'),
  ('II', 'Antofagasta', 'Región de Antofagasta'),
  ('III', 'Atacama', 'Región de Atacama'),
  ('IV', 'Coquimbo', 'Región de Coquimbo'),
  ('V', 'Valparaíso', 'Región de Valparaíso'),
  ('RM', 'Metropolitana', 'Región Metropolitana de Santiago'),
  ('VI', 'O'Higgins', 'Región del Libertador General Bernardo O'Higgins'),
  ('VII', 'Maule', 'Región del Maule'),
  ('VIII', 'Biobío', 'Región del Biobío'),
  ('IX', 'La Araucanía', 'Región de La Araucanía'),
  ('X', 'Los Lagos', 'Región de Los Lagos'),
  ('XI', 'Aysén', 'Región de Aysén del General Carlos Ibáñez del Campo'),
  ('XII', 'Magallanes', 'Región de Magallanes y de la Antártica Chilena'),
  ('XVI', 'Los Ríos', 'Región de Los Ríos')
ON CONFLICT (code) DO NOTHING;

-- Insertar comunas para Región Metropolitana (las más importantes para prospecting)
INSERT INTO chile_communes (region_id, name)
SELECT id, commune FROM (VALUES
  ('RM', 'Santiago'),
  ('RM', 'Las Condes'),
  ('RM', 'Providencia'),
  ('RM', 'Ñuñoa'),
  ('RM', 'La Florida'),
  ('RM', 'Vitacura'),
  ('RM', 'Communes'),
  ('RM', 'Lo Barnechea'),
  ('RM', 'Peñalolén'),
  ('RM', 'San Isidro'),
  ('RM', 'La Reina'),
  ('RM', 'Maipú'),
  ('RM', 'Puente Alto'),
  ('RM', 'San Bernardo'),
  ('RM', 'Quilicura'),
  ('RM', 'Colina'),
  ('RM', 'Lampa'),
  ('RM', 'Pirque'),
  ('RM', 'San José de Maipo'),
  ('RM', 'El Bosque'),
  ('RM', 'La Cisterna'),
  ('RM', 'La Granja'),
  ('RM', 'La Pintana'),
  ('RM', 'Estación Central'),
  ('RM', 'San Ramón'),
  ('RM', 'Macul'),
  ('RM', 'Independencia'),
  ('RM', 'Renca'),
  ('RM', 'Quinta Normal'),
  ('RM', 'Pudahuel'),
  ('RM', 'Conchalí'),
  ('RM', 'Huechuraba'),
  ('RM', 'Recoleta')
) AS data(region, commune)
WHERE NOT EXISTS (
  SELECT 1 FROM chile_communes cc
  INNER JOIN chile_regions cr ON cc.region_id = cr.id
  WHERE cr.code = data.region AND cc.name = data.commune
);

-- Insertar zonas ejemplo para Santiago (Barrios principales)
WITH santiago AS (SELECT id FROM chile_communes WHERE name = 'Santiago' LIMIT 1)
INSERT INTO chile_zones (commune_id, name)
SELECT id, zone FROM santiago, (VALUES
  ('Centro'), ('Estación Central'), ('Parque O'Higgins'),
  ('Yungay'), ('República'), ('Lastarria')
) AS zones(zone)
WHERE NOT EXISTS (
  SELECT 1 FROM chile_zones cz
  WHERE cz.commune_id = santiago.id AND cz.name = zones.zone
);

-- Insertar zonas para Las Condes (sectores principales)
WITH las_condes AS (SELECT id FROM chile_communes WHERE name = 'Las Condes' LIMIT 1)
INSERT INTO chile_zones (commune_id, name)
SELECT id, zone FROM las_condes, (VALUES
  ('Providencia'), ('Apoquindo'), ('Francisco de Paula Jaraquemada'),
  ('Teatinos'), ('Alcántara'), ('Jorge Alessandri')
) AS zones(zone)
WHERE NOT EXISTS (
  SELECT 1 FROM chile_zones cz
  WHERE cz.commune_id = las_condes.id AND cz.name = zones.zone
);

-- Insertar comunas adicionales de otras regiones importantes
INSERT INTO chile_communes (region_id, name)
SELECT cr.id, commune FROM (
  SELECT 'V' as region_code, 'Viña del Mar' as commune
  UNION SELECT 'V', 'Valparaíso'
  UNION SELECT 'V', 'Quilpué'
  UNION SELECT 'VIII', 'Concepción'
  UNION SELECT 'VIII', 'Talcahuano'
  UNION SELECT 'X', 'Puerto Montt'
) communes
INNER JOIN chile_regions cr ON cr.code = communes.region_code
WHERE NOT EXISTS (
  SELECT 1 FROM chile_communes cc
  WHERE cc.region_id = cr.id AND cc.name = communes.commune
);

COMMENT ON TABLE chile_regions IS 'Regiones administrativas de Chile';
COMMENT ON TABLE chile_communes IS 'Comunas (municipios) de Chile';
COMMENT ON TABLE chile_zones IS 'Zonas geográficas dentro de comunas (barrios, sectores)';
COMMENT ON TABLE chile_subzones IS 'Sub-zonas dentro de zonas';
