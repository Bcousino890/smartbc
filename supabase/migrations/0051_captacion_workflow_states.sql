-- Actualizar el workflow de captaciones con estados más granulares

-- 1. Agregar nuevos campos a la tabla captaciones
ALTER TABLE captaciones
  ADD COLUMN IF NOT EXISTS revision_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_contact_attempt_at TIMESTAMP WITH TIME ZONE;

-- 2. Reemplazar el CHECK constraint del status con los nuevos estados
-- Primero creamos una función para actualizar el constraint
ALTER TABLE captaciones
  DROP CONSTRAINT IF EXISTS captaciones_status_check;

ALTER TABLE captaciones
  ADD CONSTRAINT captaciones_status_check CHECK (
    status IN (
      'draft',               -- Borrador: Creado pero sin asignar
      'assigned',            -- Asignada: Asignada a captadora
      'preliminary_data',    -- Datos Preliminares: Captadora completó info inicial
      'contacting',          -- Contactando: En proceso de contactar al dueño
      'revision',            -- Revisión: Datos inconsistentes, revisar
      'confirmed',           -- Confirmada: Dueño confirmó que quiere vender
      'converted_to_property', -- Convertida: Ya es una propiedad
      'rejected'             -- Rechazada: Dueño no interesado o datos inválidos
    )
  );

-- 3. Migrar datos existentes
-- pending → preliminary_data (asumimos que si tiene asignación, ya tiene datos preliminares)
UPDATE captaciones
  SET status = 'preliminary_data'
  WHERE status = 'pending' AND assigned_to IS NOT NULL;

-- pending → draft (sin asignación)
UPDATE captaciones
  SET status = 'draft'
  WHERE status = 'pending' AND assigned_to IS NULL;

-- completed → confirmed
UPDATE captaciones
  SET status = 'confirmed'
  WHERE status = 'completed';

-- 4. Crear índices para mejorar rendimiento en queries de workflow
CREATE INDEX IF NOT EXISTS idx_captaciones_status_workflow
  ON captaciones(status, assigned_to, created_by)
  WHERE status IN ('draft', 'assigned', 'preliminary_data', 'contacting');

CREATE INDEX IF NOT EXISTS idx_captaciones_assigned_status
  ON captaciones(assigned_to, status)
  WHERE status NOT IN ('converted_to_property', 'rejected');

-- 5. Actualizar comentario de tabla para documentación
COMMENT ON COLUMN captaciones.status IS 'Estado del workflow: draft, assigned, preliminary_data, contacting, revision, confirmed, converted_to_property, rejected';
COMMENT ON COLUMN captaciones.revision_notes IS 'Notas sobre por qué la captación entró a revisión';
COMMENT ON COLUMN captaciones.last_contact_attempt_at IS 'Timestamp del último intento de contacto';
