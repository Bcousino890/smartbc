-- Contacto por defecto del Partner API de Idealista: se aplica a toda ficha
-- que no tenga uno propio asignado (nuevas y ya existentes).
ALTER TABLE idealista_config
  ADD COLUMN IF NOT EXISTS default_contact_id integer;
