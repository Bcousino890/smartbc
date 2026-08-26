-- Foto de perfil del contacto en Idealista (avatar del panel derecho del
-- inbox, ej. https://st3.idealista.com/profilephotos/...jpg). Los contactos
-- sin foto muestran iniciales y este campo queda NULL.
ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
