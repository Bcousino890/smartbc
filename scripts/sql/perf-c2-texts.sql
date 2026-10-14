-- ============================================================================
-- SOLO MEDICIÓN LOCAL (BCP-01 ampliación C2, Z7). Datos sintéticos. Con 0197:
--   · publica un texto del catálogo LARGO (≈5.900 de los 6.000 caracteres,
--     entrada de ≈200 y 2 puntos) en TODAS las viviendas efectivas de todos
--     los catálogos de la medición (manuales y automáticos);
--   · da una historia aprobada (entrada + 7 capítulos de ≈400 caracteres) a
--     una de cada tres propiedades sintéticas.
-- Es el peor caso de tamaño de la instantánea. Lo llama perf-c2.sh.
-- ============================================================================
\set ON_ERROR_STOP 1
SET ROLE service_role;
DO $$
DECLARE
  owner uuid := '00000000-0000-0000-0000-0000000000f1';
  sentence text := 'Una casa pensada para vivir despacio, con la luz entrando por tres fachadas a lo largo del día y un salón que se abre a un balcón corrido sobre la calle arbolada. ';
  body text;
  c record; pid uuid; rev int;
BEGIN
  body := '';
  WHILE length(body) + length(sentence) + 2 <= 5900 LOOP
    body := body || sentence;
    IF length(body) % 900 < length(sentence) THEN body := body || E'\n\n'; END IF;
  END LOOP;
  body := trim(body);
  FOR c IN SELECT id FROM catalogs WHERE title LIKE 'Perf %' ORDER BY title LOOP
    FOREACH pid IN ARRAY catalog_effective_ids(c.id) LOOP
      rev := catalog_text_save_draft(owner, c.id, pid, body,
        'Luz por tres fachadas y una finca de principios de siglo, con portería, ascensor y una escalera de madera restaurada, a pocos minutos a pie del mercado y de los colegios del barrio.',
        ARRAY['Ascensor', 'Terraza'], 'manual', NULL);
      PERFORM catalog_text_publish(owner, c.id, pid, rev);
    END LOOP;
  END LOOP;
END $$;
-- Historias aprobadas (tabla compartida de la ficha: solo LECTURA para 0197).
WITH v AS (
  INSERT INTO property_story_versions (property_id, source_hash, status, prelude, prelude_status)
  SELECT p.id, 'perf-hash', 'approved', repeat('Un ático para vivir mirando al parque, con una terraza que funciona como una habitación más. ', 3), 'approved'
    FROM properties p WHERE p.slug LIKE 'perf-%' AND substr(p.slug, 6)::int % 3 = 0
  RETURNING id
)
INSERT INTO property_story_blocks (version_id, chapter, copy, position, status)
SELECT v.id, ch, repeat('El salón, de doble altura y con chimenea, se abre por completo a la terraza y recibe luz durante todo el día. ', 4), k, 'approved'
  FROM v CROSS JOIN LATERAL unnest(ARRAY['overview', 'living', 'kitchen', 'private', 'outdoor', 'building', 'barrio']) WITH ORDINALITY AS t(ch, k);
RESET ROLE;
ANALYZE catalog_texts; ANALYZE property_story_versions; ANALYZE property_story_blocks;
SELECT count(*) AS textos_publicados, round(avg(length(pub_body))) AS caracteres_medios, max(length(pub_body)) AS caracteres_max,
       (SELECT count(*) FROM property_story_versions WHERE status = 'approved') AS historias
  FROM catalog_texts WHERE pub_body IS NOT NULL;
