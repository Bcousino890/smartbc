-- Agrega 'neighbor' (vecino) como tipo de contacto válido para captacion_contacts
ALTER TABLE captacion_contacts DROP CONSTRAINT captacion_contacts_contact_type_check;
ALTER TABLE captacion_contacts ADD CONSTRAINT captacion_contacts_contact_type_check
  CHECK (contact_type IN ('owner', 'spouse', 'family', 'neighbor', 'other'));
