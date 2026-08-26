-- Limpieza de vídeos duplicados (repite 0068 con la identidad CORREGIDA).
--
-- La 0068 se aplicó con una identidad que no unía las variantes de calidad
-- (hd_<id>.mp4 vs <id>.mp4), y como el runner de migraciones sólo ejecuta
-- ficheros NUEVOS (tabla schema_migrations), editar 0068 no volvía a correr.
-- Esta 0069 es un fichero nuevo, así que sí se aplica.
--
-- Identidad: YouTube/Vimeo por su URL completa; el resto por la RUTA sola (sin
-- host: shards st1v/st3v…; sin query: token) y quitando el prefijo de CALIDAD
-- del nombre (hd_/sd_/720p_…). Conservamos la versión HD (o la más reciente)
-- por (propiedad, identidad).

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        property_id,
        CASE
          WHEN url ~* '(youtube|youtu\.be|vimeo)' THEN lower(url)
          ELSE regexp_replace(
                 split_part(regexp_replace(lower(url), '^https?://[^/]+', ''), '?', 1),
                 '/(hd|sd|hq|lq|uhd|fhd|[0-9]{3,4}p)[_-]([^/]+)$',
                 '/\2',
                 'i'
               )
        END
      ORDER BY (url ~* '/hd[_-]') DESC, created_at DESC, id DESC
    ) AS rn
  FROM property_media
  WHERE type = 'video'
)
DELETE FROM property_media
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
