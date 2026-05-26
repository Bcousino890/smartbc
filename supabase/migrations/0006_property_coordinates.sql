-- Coordenadas geográficas para propiedades.
-- Necesario para el cálculo de distancia a universidades (feature público en
-- ficha de propiedad). Nullable porque las propiedades existentes no las
-- tienen; el import-by-link de Idealista las popula desde el JSON embebido
-- (`latitude`/`longitude` de la API), y los altas manuales pueden añadirse
-- después desde el admin.

alter table properties add column if not exists latitude double precision;
alter table properties add column if not exists longitude double precision;

-- Sin índice geoespacial por ahora: las consultas no buscan "propiedades
-- cerca de X", solo se leen para una propiedad concreta junto al resto de
-- columnas. Si en el futuro hay búsqueda por radio, conviene PostGIS.
