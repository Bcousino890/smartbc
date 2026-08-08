-- ============================================================================
-- SmartBC · Vídeos dinámicos generados desde las fotos de la propiedad
-- ============================================================================
-- Genera un vídeo tipo "Ken Burns" (zoom + paneo + transiciones) a partir de
-- las fotos de una propiedad, con el logo de la agencia superpuesto y música
-- de fondo. El render lo hace ffmpeg en el VPS (ver lib/services/video/**).
--
-- Tres piezas:
--   video_music_tracks  · pistas de música que sube el admin desde
--                         /es/admin/idealista/configuracion
--   property_video_jobs · cola de render (un vídeo a la vez, por cron)
--   property_media      · columnas nuevas para describir el vídeo resultante
--
-- El bucket de música es PRIVADO: son pistas licenciadas y no deben quedar
-- descargables por URL pública. El servidor las lee con el service role
-- (que ignora RLS) justo antes de renderizar.
--
-- Los vídeos resultantes van al bucket público `properties-photos` ya
-- existente, igual que los que se suben a mano (ver /api/admin/properties/
-- upload-video), para que la ficha pública pueda reproducirlos sin firmar.
--
-- ⚠️ El contenedor `storage` del VPS necesita FILE_SIZE_LIMIT ≥ 500MB o los
--    vídeos en 4K fallarán al subir (ver CLAUDE.md).
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

-- ── Música ──────────────────────────────────────────────────────────────────
-- `is_default` marca la pista que usa la generación automática. Se fuerza a
-- una sola con el índice único parcial de abajo (no un CHECK, que no puede
-- mirar otras filas).
CREATE TABLE IF NOT EXISTS video_music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  -- Duración real de la pista, leída con ffprobe al subirla. Sirve para avisar
  -- si es más corta que el vídeo (se reproduce en bucle).
  duration_seconds NUMERIC(10, 2),
  size_bytes BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_music_single_default
  ON video_music_tracks (is_default)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_video_music_active
  ON video_music_tracks (active, created_at DESC);

-- ── Metadatos del vídeo en property_media ───────────────────────────────────
-- `source` distingue los vídeos generados por nosotros de los que sube el
-- usuario a mano o vienen del portal de origen: solo los 'auto' se regeneran
-- y se borran solos al rehacerse.
ALTER TABLE property_media
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
  -- Huella de las fotos con las que se generó: si cambia, hay que regenerar.
  ADD COLUMN IF NOT EXISTS photos_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS music_track_id UUID REFERENCES video_music_tracks(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_media_source_check'
  ) THEN
    ALTER TABLE property_media
      ADD CONSTRAINT property_media_source_check
      CHECK (source IN ('manual', 'auto', 'imported'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_media_format_check'
  ) THEN
    ALTER TABLE property_media
      ADD CONSTRAINT property_media_format_check
      CHECK (format IS NULL OR format IN ('horizontal', 'vertical'));
  END IF;
END $$;

-- Un solo vídeo automático por propiedad y formato: al regenerar se reemplaza
-- en vez de acumular copias (el problema que ya limpió la migración 0068).
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_media_auto_video_format
  ON property_media (property_id, format)
  WHERE type = 'video' AND source = 'auto';

-- ── Cola de render ──────────────────────────────────────────────────────────
-- Un worker por cron coge los 'pending' de uno en uno. `attempts` corta los
-- reintentos infinitos de una propiedad que siempre falla (foto corrupta,
-- etc.) para que no bloquee la cola.
CREATE TABLE IF NOT EXISTS property_video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'error', 'cancelled')),
  format TEXT NOT NULL DEFAULT 'horizontal'
    CHECK (format IN ('horizontal', 'vertical')),
  resolution TEXT NOT NULL DEFAULT 'fullhd'
    CHECK (resolution IN ('fullhd', '4k')),
  music_track_id UUID REFERENCES video_music_tracks(id) ON DELETE SET NULL,

  -- Huella de las fotos en el momento de encolar. Al procesar se recalcula:
  -- si cambió, el job se rehace con las fotos nuevas.
  photos_fingerprint TEXT,
  photo_count INTEGER,

  -- Estimación de peso ANTES de renderizar (requisito del panel: el usuario
  -- ve cuánto va a ocupar antes de lanzar el render) y peso real después.
  estimated_bytes BIGINT,
  actual_bytes BIGINT,
  estimated_duration_seconds NUMERIC(10, 2),

  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual', 'sync', 'cron', 'backfill')),
  media_id UUID REFERENCES property_media(id) ON DELETE SET NULL,

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El worker busca por (status, created_at): índice parcial sobre la cola viva.
CREATE INDEX IF NOT EXISTS idx_property_video_jobs_queue
  ON property_video_jobs (created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_property_video_jobs_property
  ON property_video_jobs (property_id, created_at DESC);

-- Evita encolar dos veces la misma propiedad+formato mientras hay uno vivo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_video_jobs_no_dupe_pending
  ON property_video_jobs (property_id, format)
  WHERE status IN ('pending', 'processing');

-- ── updated_at ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_video_music_tracks_updated_at ON video_music_tracks;
CREATE TRIGGER trg_video_music_tracks_updated_at
  BEFORE UPDATE ON video_music_tracks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_property_video_jobs_updated_at ON property_video_jobs;
CREATE TRIGGER trg_property_video_jobs_updated_at
  BEFORE UPDATE ON property_video_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Como en property_media (0016): la app opera con el service role, que ignora
-- RLS; estas políticas son defensa en profundidad para el rol `authenticated`.
ALTER TABLE video_music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_video_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_music_admin_all" ON video_music_tracks;
CREATE POLICY "video_music_admin_all" ON video_music_tracks
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "video_jobs_admin_all" ON property_video_jobs;
CREATE POLICY "video_jobs_admin_all" ON property_video_jobs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Bucket de música (privado) ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-music', 'video-music', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "video_music_storage_staff_all" ON storage.objects;
CREATE POLICY "video_music_storage_staff_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'video-music' AND public.is_staff())
  WITH CHECK (bucket_id = 'video-music' AND public.is_staff());

-- ── Ajustes por defecto de la generación ────────────────────────────────────
-- Clave única en app_settings; la UI de configuración la lee y la escribe.
-- Los valores aquí son el arranque en frío (ver lib/services/video/config.ts,
-- que es la fuente de verdad de los defaults y valida lo que llega).
INSERT INTO app_settings (key, value)
VALUES (
  'video_generation',
  '{
     "enabled": false,
     "secondsPerPhoto": 3.5,
     "transitionSeconds": 0.6,
     "maxPhotos": 40,
     "maxDurationSeconds": 150,
     "defaultFormat": "horizontal",
     "defaultResolution": "fullhd",
     "musicVolume": 0.5,
     "logoOpacity": 0.75,
     "regenerateOnPhotoChange": true
   }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
