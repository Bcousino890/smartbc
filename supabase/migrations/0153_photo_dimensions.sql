-- 0153 · dimensiones reales de cada foto.
--
-- Sin esto, ninguna decisión sobre el hero puede tomarse con criterio: no se
-- sabe si una foto da para ocupar 2880px de pantalla o si es una miniatura de
-- 850px que se está ampliando. Se leen de las cabeceras del propio fichero
-- (unos pocos KB por foto), no con IA.
--
-- NULL = todavía sin medir. Se trata como "no sé", nunca como "pequeña".
alter table property_photos
  add column if not exists source_width integer,
  add column if not exists source_height integer;

-- El hero consulta por propiedad y posición; ya existe índice por
-- property_id, así que no hace falta ninguno nuevo.
