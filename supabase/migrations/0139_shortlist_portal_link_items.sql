-- ============================================================================
-- SmartBC · El shortlist acepta anuncios que todavía no son ficha
-- ============================================================================
-- Hasta ahora un item del shortlist tenía que ser una propiedad del CRM
-- (`property_id NOT NULL`). Pero el trabajo real empieza antes: se ven quince
-- pisos con el cliente en Idealista, se mandan a su ficha con la extensión y
-- ahí siguen siendo enlaces — «Con ficha 0». Pedirle al cliente que ordene
-- eso obligaba a importar los quince primero, y muchos se van a caer en la
-- primera llamada.
--
-- Ahora un item apunta a UNA de las dos cosas, nunca a ninguna y nunca a las
-- dos: la ficha del CRM, o el enlace del portal.
--
--   property_id    → ya es nuestra: fotos propias, referencia BC-####
--   portal_link_id → todavía es un anuncio: una foto del portal y poco más
--
-- ⚠️ La diferencia se nota en la superficie del cliente y es inevitable: de un
-- enlace solo tenemos la miniatura que capturó la extensión. Cuando ese piso
-- sobreviva a la llamada y se le cree ficha, la tarjeta mejora sola.
--
-- ON DELETE CASCADE en portal_link_id (y no RESTRICT como en property_id):
-- un enlace es material de trabajo desechable; una ficha es historial
-- comercial. Borrar un enlace que ya se mandó se lleva su tarjeta por delante,
-- que es lo que se espera.
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

ALTER TABLE client_shortlist_items
  ALTER COLUMN property_id DROP NOT NULL;

ALTER TABLE client_shortlist_items
  ADD COLUMN IF NOT EXISTS portal_link_id uuid
    REFERENCES client_portal_links(id) ON DELETE CASCADE;

DO $$
BEGIN
  -- Exactamente una de las dos fuentes. Sin esto podría existir un item
  -- huérfano (ninguna) o esquizofrénico (las dos), y la proyección pública
  -- tendría que adivinar cuál manda.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'client_shortlist_items'::regclass
      AND conname = 'csi_one_source'
  ) THEN
    ALTER TABLE client_shortlist_items
      ADD CONSTRAINT csi_one_source
      CHECK (num_nonnulls(property_id, portal_link_id) = 1);
  END IF;
END $$;

-- `csi_unique_property UNIQUE (shortlist_id, property_id)` se queda como está:
-- con property_id ya nullable, Postgres considera los NULL distintos entre sí,
-- así que sigue impidiendo la misma FICHA dos veces sin estorbar a los
-- enlaces. Estos necesitan su propio índice parcial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_csi_unique_portal_link
  ON client_shortlist_items (shortlist_id, portal_link_id)
  WHERE portal_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csi_portal_link
  ON client_shortlist_items (portal_link_id)
  WHERE portal_link_id IS NOT NULL;
