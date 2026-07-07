-- Mejoras del módulo de captaciones (Chile):
--
-- 1. captacion_contacts.extra_phones: un dueño/contacto puede tener más de un
--    teléfono. Se guardan como JSONB [{ "phone": "+56912345678", "has_whatsapp": true }]
--    para no duplicar contactos cuando la captadora consigue un segundo número.
--
-- 2. captaciones.rol_propiedad: rol de avalúo SII de la propiedad (ej: "1234-56"),
--    lo completa la captadora/admin en la pestaña Ubicación junto a la dirección real.
--
-- 3. captaciones.features: características scrapeadas de la ficha original
--    (piscina, bodega, estacionamientos, etc.) como JSONB array de strings,
--    para que captadora y admin vean la ficha completa sin abrir el portal.

ALTER TABLE captacion_contacts ADD COLUMN IF NOT EXISTS
  extra_phones JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS
  rol_propiedad TEXT;

ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS
  features JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN captacion_contacts.extra_phones IS 'Teléfonos adicionales del contacto: [{"phone": "+569...", "has_whatsapp": bool}]';
COMMENT ON COLUMN captaciones.rol_propiedad IS 'Rol de avalúo SII de la propiedad (ej: 1234-56)';
COMMENT ON COLUMN captaciones.features IS 'Características scrapeadas de la ficha original (array JSON de strings)';

-- Fuerza a PostgREST a recargar la caché de esquema para que vea las columnas.
NOTIFY pgrst, 'reload schema';
