-- Tabla de contactos adicionales para captaciones
-- Permite múltiples teléfonos, emails y relaciones (dueño, cónyuge, familiar, etc.)
CREATE TABLE captacion_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captacion_id UUID NOT NULL REFERENCES captaciones(id) ON DELETE CASCADE,

  -- Tipo de contacto
  contact_type TEXT NOT NULL CHECK (contact_type IN ('owner', 'spouse', 'family', 'other')),

  -- Datos del contacto
  contact_name TEXT,
  phone VARCHAR(20),  -- Normalizado: +56991234567
  email VARCHAR(255),

  -- WhatsApp
  has_whatsapp BOOLEAN DEFAULT FALSE,

  -- Relación (si contact_type='family': "Hijo", "Hermano", etc.)
  relationship TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_captacion_contacts ON captacion_contacts(captacion_id);
CREATE INDEX idx_captacion_contacts_phone ON captacion_contacts(phone) WHERE phone IS NOT NULL;

ALTER TABLE captacion_contacts ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad: mismos permisos que la captación padre
CREATE POLICY "captacion_contacts_view" ON captacion_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent'))
        )
    )
  );

CREATE POLICY "captacion_contacts_insert" ON captacion_contacts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent', 'captadora'))
        )
    )
  );

CREATE POLICY "captacion_contacts_update" ON captacion_contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent', 'captadora'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent', 'captadora'))
        )
    )
  );

CREATE POLICY "captacion_contacts_delete" ON captacion_contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent', 'captadora'))
        )
    )
  );

COMMENT ON TABLE captacion_contacts IS 'Contactos adicionales de una captación (dueño, cónyuge, familiares, otros)';
