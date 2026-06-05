-- Añadir campo assigned_to a visit_requests para registrar quién hace la visita
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;
