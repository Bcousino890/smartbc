-- ============================================================================
-- SmartBC · Procedencia de los contactos de una captación
-- ============================================================================
-- Petición del integrador "crm chile": que `contacts[]` admita `mode: "sync"`
-- como `photos`, de modo que los contactos que dejan de enviar se retiren de la
-- ficha. Su equipo cura la lista —de quince personas eligen a mano las tres que
-- sirven para llamar— y hoy, al quitar a alguien, seguía apareciendo en el panel.
--
-- Para poder retirar contactos hace falta saber CUÁL es de quién. Sin eso, un
-- integrador que manda una lista corta podría borrar el contacto que una
-- captadora acaba de conseguir por teléfono.
--
-- El integrador proponía distinguirlos por el prefijo de su `external_id`. Se
-- guarda en su lugar el cliente API que creó cada contacto, que es más robusto:
--   · no depende de la convención de nombres del proveedor,
--   · un proveedor no puede retirar los contactos de otro,
--   · los contactos creados a mano en el panel tienen api_client_id NULL y
--     quedan fuera de cualquier borrado automático, siempre.
-- ============================================================================

ALTER TABLE captacion_contacts
  ADD COLUMN IF NOT EXISTS api_client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_captacion_contacts_api_client
  ON captacion_contacts (api_client_id) WHERE api_client_id IS NOT NULL;

COMMENT ON COLUMN captacion_contacts.api_client_id IS 'Integración que creó este contacto. NULL = creado a mano en el panel; nunca se retira en una sincronización con mode=sync.';

-- Backfill conservador: solo se marcan como "de la integración" los contactos
-- que llevan external_id (los que crea el panel no lo llevan) y que cuelgan de
-- una captación gobernada por esa misma integración. Ante la duda, se deja NULL
-- —es decir, se tratan como manuales y no se pueden borrar solos.
UPDATE captacion_contacts cc
   SET api_client_id = c.api_client_id
  FROM captaciones c
 WHERE cc.captacion_id = c.id
   AND cc.api_client_id IS NULL
   AND cc.external_id IS NOT NULL
   AND c.api_client_id IS NOT NULL;

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
