-- Limpia vídeos duplicados en property_media.
--
-- Causa: los .mp4 de Idealista (y similares) llevan un token/calidad en la
-- query que cambia en cada fetch y aparecen en varias <source> del mismo
-- reproductor, así que al re-importar se creaban filas duplicadas del mismo
-- vídeo. A partir de ahora el import deduplica por identidad; esta migración
-- limpia las copias ya existentes.
--
-- Identidad: YouTube/Vimeo se comparan por su URL completa (el id va en la URL);
-- el resto por origen+path (sin la query), que es lo que estabiliza los mp4.
-- Conservamos la fila más reciente por (propiedad, identidad).

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        property_id,
        CASE
          WHEN url ~* '(youtube|youtu\.be|vimeo)' THEN lower(url)
          ELSE lower(split_part(url, '?', 1))
        END
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM property_media
  WHERE type = 'video'
)
DELETE FROM property_media
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
