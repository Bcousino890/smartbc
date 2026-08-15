-- ============================================================================
-- SmartBC · Analítica de Viewing Collections
-- ============================================================================
-- Dos cambios sobre el sistema de analítica existente:
--   1. page_events.event_type es un CHECK cerrado → tres valores nuevos
--   2. page_views necesita poder atribuir la sesión a una colección
--
-- page_views.page_type es TEXTO LIBRE, así que 'viewing_collection' no
-- requiere migración (verificado contra producción el 2026-08-15).
--
-- smartlink_click NO se añade: se reutiliza 'share_click', que ya existe. Así
-- las métricas de SmartLinks y de colecciones son directamente comparables.
--
-- ⚠️ Esta es la única migración del módulo que toca tablas ajenas. Si hay que
-- revertirla después de que se hayan insertado eventos nuevos, hace falta
-- borrarlos antes de restaurar el CHECK antiguo (ver el handoff).
-- ============================================================================

ALTER TABLE page_events DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE page_events ADD CONSTRAINT valid_event_type CHECK (event_type IN (
  -- Existentes: verificados en producción, no tocar.
  'photo_view', 'video_play', 'plan_view', 'scroll',
  'contact_click', 'visit_request', 'share_click', 'time_on_page',
  -- Viewing Collections.
  'collection_open', 'stop_view', 'stop_expand'
));

ALTER TABLE page_views
  ADD COLUMN IF NOT EXISTS collection_share_id uuid
  REFERENCES viewing_collection_shares(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_page_views_collection_share
  ON page_views(collection_share_id, created_at DESC)
  WHERE collection_share_id IS NOT NULL;
