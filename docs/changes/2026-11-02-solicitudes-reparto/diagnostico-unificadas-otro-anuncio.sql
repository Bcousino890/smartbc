-- ============================================================================
-- SOLO LECTURA. Solicitudes que la unificación automática por teléfono absorbió
-- en el pasado aunque eran de OTRO anuncio que su superviviente (antes de
-- 0237 la regla no miraba el anuncio). Siguen ocultas (merged_into_id); este
-- informe solo las cuenta y lista para decidir qué hacer. No escribe nada.
-- Mismo criterio que adsDiffer() en lib/sales-inbox/merge.ts: código, si no
-- referencia, si no título del anuncio, comparando la mejor evidencia común.
-- ============================================================================
BEGIN READ ONLY;
WITH par AS (
  SELECT a.id AS absorbida, a.conversation_id AS conv_absorbida, a.merged_at,
         s.id AS superviviente, s.conversation_id AS conv_superviviente,
         lower(btrim(a.idealista_code)) AS ca, lower(btrim(s.idealista_code)) AS cs,
         lower(btrim(a.property_ref))   AS ra, lower(btrim(s.property_ref))   AS rs,
         lower(btrim(a.property_title)) AS ta, lower(btrim(s.property_title)) AS ts
    FROM idealista_leads a
    JOIN idealista_leads s ON s.id = a.merged_into_id
)
SELECT conv_absorbida, conv_superviviente, merged_at,
       COALESCE(ca, '—') || ' / ' || COALESCE(cs, '—') AS codigos,
       COALESCE(ra, '—') || ' / ' || COALESCE(rs, '—') AS referencias,
       COALESCE(ta, '—') || ' / ' || COALESCE(ts, '—') AS titulos
  FROM par
 WHERE CASE
         WHEN NULLIF(ca, '') IS NOT NULL AND NULLIF(cs, '') IS NOT NULL THEN ca <> cs
         WHEN NULLIF(ra, '') IS NOT NULL AND NULLIF(rs, '') IS NOT NULL THEN ra <> rs
         WHEN NULLIF(ta, '') IS NOT NULL AND NULLIF(ts, '') IS NOT NULL THEN ta <> ts
         ELSE false
       END
 ORDER BY merged_at DESC;
ROLLBACK;
