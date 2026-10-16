-- SOLO PRUEBAS LOCALES (HOME · grupos). Deja al otro dueño en 99 grupos
-- (borra el grupo :drop, de primer nivel y sin subgrupos).
\set ON_ERROR_STOP 1
DELETE FROM catalog_groups WHERE owner_id = '00000000-0000-0000-0000-0000000000a2' AND name = 'Grupo ' || :'drop';
SELECT test_util.ok((SELECT count(*) FROM catalog_groups WHERE owner_id = '00000000-0000-0000-0000-0000000000a2') = 99, 'límite: el otro dueño tiene 99 grupos');
