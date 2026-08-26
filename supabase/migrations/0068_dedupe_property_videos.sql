-- Limpia vídeos duplicados en property_media.
--
-- Causa: los .mp4 de Idealista (y similares) llevan un token/calidad en la
-- query que cambia en cada fetch y aparecen en varias <source> del mismo
-- reproductor, así que al re-importar se creaban filas duplicadas del mismo
-- vídeo. A partir de ahora el import deduplica por identidad; esta migración
-- limpia las copias ya existentes.
--
-- Identidad: YouTube/Vimeo por su URL completa (el id va en la URL); el resto
-- por la RUTA sola (sin host: shards st1v/st3v…; sin query: token) y quitando el
-- prefijo de CALIDAD del nombre (hd_/sd_/720p_…), porque Idealista sube el mismo
-- vídeo en dos calidades (hd_1353826753.mp4 y 1353826753.mp4). Conservamos la
-- versión HD (o la más reciente) por (propiedad, identidad).

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
