-- ============================================================================
-- SmartBC · Salvaguardas del borrado de contactos por sincronización
-- ============================================================================
-- Desde la 0104, una integración puede enviar `contacts` con mode=sync y eso
-- RETIRA contactos. Es la primera operación destructiva que puede ejecutar un
-- sistema externo contra el CRM, y el integrador "crm chile" va a lanzar un
-- reenvío forzado de todo su catálogo: justo el momento en que un fallo en su
-- lógica de curación se manifestaría a escala.
--
-- La 0104 protegía los contactos CREADOS en el panel (api_client_id NULL). Pero
-- quedaba un hueco: un contacto que creó la integración y que después CORRIGIÓ
-- una captadora —tras hablar con el propietario, que es el dato más valioso que
-- tenemos— seguía marcado como suyo, y por tanto era borrable. Se perdería
-- trabajo del equipo sin que nadie se enterara.
--
--   captacion_contacts.updated_by_user_at
--     Marca de "una persona ha tocado esto". Un contacto con esta marca no se
--     retira nunca en una sincronización, lo haya creado quien lo haya creado.
--
--   api_requests.items_removed
--     Los contadores del log registraban altas, cambios y errores, pero no
--     borrados. Sin esto, un reenvío que retirase miles de contactos no dejaría
--     rastro agregado en el panel y nadie lo vería a tiempo.
-- ============================================================================

ALTER TABLE captacion_contacts
  ADD COLUMN IF NOT EXISTS updated_by_user_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN captacion_contacts.updated_by_user_at IS 'Última vez que una persona editó este contacto desde el panel. Si tiene valor, ninguna sincronización lo retira.';

ALTER TABLE api_requests
  ADD COLUMN IF NOT EXISTS items_removed INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN api_requests.items_removed IS 'Elementos retirados por esta petición (contactos con mode=sync). Permite detectar en el panel un borrado masivo inesperado.';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
