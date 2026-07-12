-- Permite marcar usuarios (asesores/agentes) que trabajan en ambos países
-- (España y Chile) para que puedan cambiar de dashboard igual que "admin",
-- sin necesidad de subirlos a ese rol.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS multi_country boolean NOT NULL DEFAULT false;
