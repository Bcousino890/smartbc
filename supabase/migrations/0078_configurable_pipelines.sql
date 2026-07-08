-- Pipelines configurables para Captaciones. Reemplaza el enum fijo de
-- `captaciones.status` (CHECK constraint con 9 valores hardcodeados) por
-- etapas que el admin puede crear, renombrar, recolorear, reordenar y
-- eliminar libremente, agrupadas en pipelines independientes (se puede tener
-- más de uno, ej. "Captaciones" y "Renovación de contrato").
--
-- Un puñado de comportamientos reales del sistema (quién puede convertir a
-- propiedad, qué etapa es el punto de entrada, cuáles son terminales) no
-- pueden depender de nombres arbitrarios que el admin puede cambiar, así que
-- cada etapa lleva un `stage_type` de un set cerrado que el motor entiende:
--   draft     - punto de entrada de una captación nueva
--   assign    - al soltar/asignar una captación aquí, se le asigna un usuario
--   normal    - etapa libre, sin comportamiento especial
--   confirmed - habilita el botón "Convertir a propiedad"
--   rejected  - terminal, la captación se descarta
--   converted - terminal, solo la puede fijar POST /captaciones/[id]/convert
--
-- La columna legada `captaciones.status` se deja tal cual (no se migra ni se
-- borra) como registro histórico; pipeline_id/stage_id pasan a ser la fuente
-- de verdad para todo lo nuevo.

CREATE TABLE IF NOT EXISTS captacion_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL DEFAULT 'cl',
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Solo un pipeline default por país (el que se usa para captaciones nuevas)
CREATE UNIQUE INDEX IF NOT EXISTS idx_captacion_pipelines_one_default
  ON captacion_pipelines(country) WHERE is_default;

CREATE TABLE IF NOT EXISTS captacion_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES captacion_pipelines(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color_key TEXT NOT NULL DEFAULT 'slate',
  position INTEGER NOT NULL DEFAULT 0,
  stage_type TEXT NOT NULL DEFAULT 'normal'
    CHECK (stage_type IN ('draft', 'assign', 'normal', 'confirmed', 'rejected', 'converted')),
  requires_notes BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (pipeline_id, key)
);

CREATE INDEX IF NOT EXISTS idx_captacion_pipeline_stages_pipeline
  ON captacion_pipeline_stages(pipeline_id, position);

ALTER TABLE captaciones
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES captacion_pipelines(id),
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES captacion_pipeline_stages(id);

CREATE INDEX IF NOT EXISTS idx_captaciones_pipeline_stage ON captaciones(pipeline_id, stage_id);

-- Seed: un pipeline "Captaciones" con las 9 etapas que ya existían como
-- enum, para que nada cambie visualmente al desplegar esto. country='cl'
-- porque es el único país que usa el módulo.
INSERT INTO captacion_pipelines (id, country, name, is_default)
SELECT gen_random_uuid(), 'cl', 'Captaciones', true
WHERE NOT EXISTS (SELECT 1 FROM captacion_pipelines WHERE country = 'cl' AND is_default);

DO $$
DECLARE
  default_pipeline_id UUID;
BEGIN
  SELECT id INTO default_pipeline_id
  FROM captacion_pipelines WHERE country = 'cl' AND is_default LIMIT 1;

  INSERT INTO captacion_pipeline_stages
    (pipeline_id, key, label, color_key, position, stage_type, requires_notes)
  VALUES
    (default_pipeline_id, 'draft', 'Borrador', 'slate', 0, 'draft', false),
    (default_pipeline_id, 'assigned', 'Asignada', 'blue', 1, 'assign', false),
    (default_pipeline_id, 'preliminary_data', 'Datos Preliminares', 'orange', 2, 'normal', false),
    (default_pipeline_id, 'contacting', 'Contactando', 'purple', 3, 'normal', false),
    (default_pipeline_id, 'field_visit', 'Visita Presencial', 'amber', 4, 'normal', true),
    (default_pipeline_id, 'revision', 'Revisión', 'rose', 5, 'normal', true),
    (default_pipeline_id, 'confirmed', 'Confirmada', 'emerald', 6, 'confirmed', false),
    (default_pipeline_id, 'converted_to_property', 'Convertida', 'cyan', 7, 'converted', false),
    (default_pipeline_id, 'rejected', 'Rechazada', 'red', 8, 'rejected', false)
  ON CONFLICT (pipeline_id, key) DO NOTHING;

  -- Backfill: cada captación existente apunta al pipeline default y a la
  -- etapa cuya key coincide con su status legado.
  UPDATE captaciones c
  SET pipeline_id = default_pipeline_id,
      stage_id = s.id
  FROM captacion_pipeline_stages s
  WHERE s.pipeline_id = default_pipeline_id
    AND s.key = c.status
    AND c.country = 'cl'
    AND c.pipeline_id IS NULL;
END $$;

ALTER TABLE captacion_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE captacion_pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Cualquier staff puede ver los pipelines (para renderizar el tablero); solo
-- admin/owner/agent_admin puede crearlos/editarlos/borrarlos.
DROP POLICY IF EXISTS "captacion_pipelines_select" ON captacion_pipelines;
CREATE POLICY "captacion_pipelines_select" ON captacion_pipelines FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'owner', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior', 'captadora')
    )
  );

DROP POLICY IF EXISTS "captacion_pipelines_manage" ON captacion_pipelines;
CREATE POLICY "captacion_pipelines_manage" ON captacion_pipelines FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner', 'agent_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner', 'agent_admin')));

DROP POLICY IF EXISTS "captacion_pipeline_stages_select" ON captacion_pipeline_stages;
CREATE POLICY "captacion_pipeline_stages_select" ON captacion_pipeline_stages FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'owner', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior', 'captadora')
    )
  );

DROP POLICY IF EXISTS "captacion_pipeline_stages_manage" ON captacion_pipeline_stages;
CREATE POLICY "captacion_pipeline_stages_manage" ON captacion_pipeline_stages FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner', 'agent_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner', 'agent_admin')));

COMMENT ON TABLE captacion_pipelines IS 'Pipelines configurables de captaciones (se puede tener más de uno)';
COMMENT ON TABLE captacion_pipeline_stages IS 'Etapas de un pipeline: nombre/color/orden libres, stage_type fijo para el comportamiento del sistema';
COMMENT ON COLUMN captaciones.pipeline_id IS 'Pipeline al que pertenece esta captación';
COMMENT ON COLUMN captaciones.stage_id IS 'Etapa actual dentro del pipeline (reemplaza a status para el workflow)';

NOTIFY pgrst, 'reload schema';
