-- ============================================================================
-- SmartBC · Vídeo automático también para fichas "inspo" de Idealista
-- ============================================================================
-- El vídeo Ken Burns (migración 0115) solo podía generarse para propiedades
-- reales del sistema: property_video_jobs.property_id y property_media.
-- property_id eran NOT NULL con FK a `properties`. Las fichas "inspo" de
-- Idealista (anuncios señuelo sin propiedad real detrás, ver idealista_listings
-- .is_inspo de la migración 0019) no tienen fila en `properties`, así que no
-- podían generar vídeo por mucho que tuvieran fotos propias (photo_ids).
--
-- Esta migración relaja property_id a nullable en ambas tablas y añade
-- idealista_listing_id como alternativa: cada fila de cola/medio queda
-- asociada a EXACTAMENTE una de las dos (CHECK), nunca a ninguna o a ambas.
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

-- ── property_video_jobs ──────────────────────────────────────────────────────
ALTER TABLE property_video_jobs ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE property_video_jobs
  ADD COLUMN IF NOT EXISTS idealista_listing_id UUID REFERENCES idealista_listings(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_video_jobs_subject_check'
  ) THEN
    ALTER TABLE property_video_jobs
      ADD CONSTRAINT property_video_jobs_subject_check
      CHECK (
        (property_id IS NOT NULL AND idealista_listing_id IS NULL) OR
        (property_id IS NULL AND idealista_listing_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_property_video_jobs_listing
  ON property_video_jobs (idealista_listing_id, created_at DESC);

-- Mismo propósito que idx_property_video_jobs_no_dupe_pending (migración 0115)
-- pero para listings: evita encolar dos veces la misma ficha+formato mientras
-- hay un trabajo vivo. Los índices únicos parciales ignoran NULL, así que este
-- y el de property_id conviven sin pisarse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_video_jobs_no_dupe_pending_listing
  ON property_video_jobs (idealista_listing_id, format)
  WHERE status IN ('pending', 'processing');

-- ── property_media ───────────────────────────────────────────────────────────
ALTER TABLE property_media ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE property_media
  ADD COLUMN IF NOT EXISTS idealista_listing_id UUID REFERENCES idealista_listings(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_media_subject_check'
  ) THEN
    ALTER TABLE property_media
      ADD CONSTRAINT property_media_subject_check
      CHECK (
        (property_id IS NOT NULL AND idealista_listing_id IS NULL) OR
        (property_id IS NULL AND idealista_listing_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_property_media_listing_id
  ON property_media (idealista_listing_id);

-- Mismo propósito que idx_property_media_auto_video_format (migración 0115)
-- pero para listings: un solo vídeo automático por ficha inspo y formato.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_media_auto_video_format_listing
  ON property_media (idealista_listing_id, format)
  WHERE type = 'video' AND source = 'auto';

NOTIFY pgrst, 'reload schema';
