-- Estado "Visita presencial" para captaciones sin datos del dueño: hay que ir
-- físicamente a la propiedad. Las instrucciones de la visita se guardan en
-- revision_notes (mismo campo que usa Revisión para su motivo) y se muestran
-- como banner en la ficha. Además: seguimiento de intentos con próximo paso
-- agendado (fecha + nota) visible en la pestaña Intentos.

ALTER TABLE captaciones
  DROP CONSTRAINT IF EXISTS captaciones_status_check;

ALTER TABLE captaciones
  ADD CONSTRAINT captaciones_status_check CHECK (
    status IN (
      'draft',                 -- Borrador: creado pero sin asignar
      'assigned',              -- Asignada: asignada a captadora/ejecutivo
      'preliminary_data',      -- Datos preliminares completados
      'contacting',            -- Contactando al dueño
      'field_visit',           -- Visita presencial: sin datos del dueño, ir a la propiedad
      'revision',              -- Revisión: datos inconsistentes
      'confirmed',             -- Confirmada: dueño quiere vender
      'converted_to_property', -- Convertida en propiedad
      'rejected'               -- Rechazada
    )
  );

ALTER TABLE captaciones
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS next_action_note TEXT;

COMMENT ON COLUMN captaciones.status IS 'Workflow: draft, assigned, preliminary_data, contacting, field_visit, revision, confirmed, converted_to_property, rejected';
COMMENT ON COLUMN captaciones.next_action_at IS 'Próximo paso agendado del seguimiento (ej: volver a llamar el viernes)';
COMMENT ON COLUMN captaciones.next_action_note IS 'Qué hay que hacer en el próximo paso';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
