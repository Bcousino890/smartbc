-- Zonas dibujadas a mano en el mapa para el encargo del cliente.
-- Lista de anillos [[lng, lat], ...] (mismo formato que lib/zone-polygon.ts).
-- Vacío = sin zona dibujada: el match sigue usando los nombres de zona/barrio.
alter table client_preferences
  add column if not exists search_polygons jsonb not null default '[]'::jsonb;
