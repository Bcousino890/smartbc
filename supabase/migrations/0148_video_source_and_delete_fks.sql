-- 0148 · Dos arreglos de datos/contrato encontrados en producción (2026-08-21).
--
-- 1) VÍDEOS IMPORTADOS MAL ETIQUETADOS COMO 'manual'.
--    El importador por enlace insertaba los vídeos del anuncio sin `source`,
--    y el default de la columna es 'manual'. Resultado: un mp4 de Idealista
--    con la marca de agua de OTRA agencia incrustada (caso real BC-1397,
--    "Domus Aurea Capital") pasaba el filtro hero-safe de la decisión D4
--    (solo vídeo manual propio) y se convertía en el hero del SmartLink.
--    El diagnóstico es inequívoco: los vídeos manuales de verdad viven en el
--    bucket (storage_path sin esquema http), los importados guardan la URL
--    externa como storage_path. Se reetiquetan como 'imported'; siguen
--    mostrándose en la sección de vídeos, pero nunca como hero.
update property_media
set source = 'imported'
where type = 'video'
  and source = 'manual'
  and storage_path ~* '^https?://';

-- 2) EL BORRADO DE PROPIEDAD ESTABA BLOQUEADO POR DOS FKs RESTRICT.
--    "No se pudo eliminar: violates foreign key constraint
--    client_shortlist_items_property_id_fkey". Un item de shortlist o una
--    selección de cliente no tienen sentido sin su propiedad: caen con ella.
--    (captaciones.converted_to_property_id se queda como está: la acción de
--    borrado ya desvincula y devuelve la captación a "confirmada" a mano.)
alter table client_shortlist_items
  drop constraint client_shortlist_items_property_id_fkey,
  add constraint client_shortlist_items_property_id_fkey
    foreign key (property_id) references properties(id) on delete cascade;

alter table client_property_selections
  drop constraint client_property_selections_property_id_fkey,
  add constraint client_property_selections_property_id_fkey
    foreign key (property_id) references properties(id) on delete cascade;
