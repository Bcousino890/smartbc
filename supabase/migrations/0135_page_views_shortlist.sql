-- ============================================================================
-- SmartBC · Atribuir una sesión de analítica a un Shortlist
-- ============================================================================
-- `page_views.page_type` es texto libre, así que 'client_shortlist' no
-- necesita migración. Lo que falta es la columna que ata la sesión a SU
-- shortlist: sin ella, los `property_view` de catorce residencias quedarían
-- sueltos y no se podría responder a "qué casas le llamaron la atención".
--
-- Nullable y sin defecto: no toca ninguna fila existente ni ningún otro flujo
-- de analítica. ON DELETE SET NULL para que borrar un shortlist no arrastre
-- histórico de visitas.
--
-- ⚠️ Aquí se guarda el ID, NUNCA el token: el token es la llave del documento
-- privado y no tiene por qué vivir en una tabla de métricas.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE page_views
  ADD COLUMN IF NOT EXISTS shortlist_id uuid
  REFERENCES client_shortlists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_page_views_shortlist
  ON page_views (shortlist_id) WHERE shortlist_id IS NOT NULL;
