-- ============================================================
-- SmartBC · Seed inicial (catálogo de tags + agencias ejemplo)
-- ============================================================
-- Aplicar DESPUÉS de 0001_init.sql.
-- Idempotente: usa "on conflict do nothing".
-- ============================================================

-- Catálogo de tags (la pieza central que el admin asigna a clientes)
insert into client_tags (name, category, color) values
  ('Estudiante', 'profile', '#A78BFA'),
  ('Trabajador', 'profile', '#60A5FA'),
  ('Empresa', 'profile', '#34D399'),
  ('Familia', 'profile', '#F59E0B'),
  ('Inversor', 'profile', '#EF4444'),
  ('Corta estancia', 'stay_type', '#06B6D4'),
  ('Larga estancia', 'stay_type', '#8B5CF6'),
  ('Premium', 'budget', '#D4AF37'),
  ('Lujo', 'budget', '#B91C1C'),
  ('VIP', 'priority', '#000000')
on conflict (name) do nothing;

-- Agencias colaboradoras reales — añadir según vayas confirmando acuerdos.
-- (Lucas Fox, Engel & Völkers, Gilmar, Álvora estaban como placeholders y se
--  retiraron tras confirmar que solo Barnes colabora oficialmente.)
insert into agencies (name, slug, website) values
  ('Barnes Madrid', 'barnes-madrid', 'https://www.barnes-madrid.com')
on conflict (slug) do nothing;

-- App settings iniciales
insert into app_settings (key, value) values
  ('personal_shopper_terms_version', '"1.0"'::jsonb),
  ('default_sync_frequency_hours', '6'::jsonb)
on conflict (key) do nothing;
