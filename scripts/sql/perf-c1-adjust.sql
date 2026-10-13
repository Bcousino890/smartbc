-- ============================================================================
-- SOLO MEDICIÓN LOCAL (BCP-01 ampliación C1, Y5). Datos sintéticos. Con 0196:
-- a cada catálogo automático de la medición le pone 2 exclusiones (de su
-- selección actual), 2 inclusiones (viviendas disponibles que no estaban) y
-- una portada elegida (3.ª vivienda, 2.ª foto). Lo llama perf-c1.sh.
-- ============================================================================
\set ON_ERROR_STOP 1
SET ROLE service_role;
DO $$
DECLARE c record; ex uuid; inc uuid; cov record; ids uuid[]; owner uuid := '00000000-0000-0000-0000-0000000000f1';
BEGIN
  FOR c IN SELECT id, criteria FROM catalogs WHERE title LIKE 'Perf auto %' ORDER BY title LOOP
    FOR ex IN SELECT s.property_id FROM catalog_select(c.id, c.criteria) s ORDER BY s.ord LIMIT 2 LOOP
      PERFORM catalog_adjust(owner, c.id, ex, 'exclude');
    END LOOP;
    ids := catalog_effective_ids(c.id);  -- una vez por catálogo (no por fila)
    FOR inc IN SELECT p.id FROM properties p
                WHERE p.slug LIKE 'perf-%' AND p.country = 'es' AND p.archived_at IS NULL AND p.status::text IN ('available', 'reserved')
                  AND NOT p.id = ANY (ids)
                ORDER BY md5(c.id::text || p.id::text) LIMIT 2 LOOP
      PERFORM catalog_adjust(owner, c.id, inc, 'include');
    END LOOP;
    SELECT s.property_id, (SELECT ph.id FROM property_photos ph WHERE ph.property_id = s.property_id ORDER BY ph.position, ph.id OFFSET 1 LIMIT 1) AS photo
      INTO cov FROM catalog_select(c.id, c.criteria) s ORDER BY s.ord OFFSET 2 LIMIT 1;
    IF cov.property_id IS NOT NULL THEN
      PERFORM catalog_set_cover(owner, c.id, cov.property_id, cov.photo);
    END IF;
  END LOOP;
END $$;
RESET ROLE;
SELECT count(*) FILTER (WHERE kind = 'exclude') AS exclusiones, count(*) FILTER (WHERE kind = 'include') AS inclusiones,
       (SELECT count(*) FROM catalogs WHERE cover_property_id IS NOT NULL) AS portadas
  FROM catalog_adjustments;
