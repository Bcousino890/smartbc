-- 0145 · SmartLink 2.0 — expansión de la capa de conocimiento de barrio.
--
-- Generado por scripts/build-neighborhood-migration.mjs. NO editar a mano:
-- vuelve a ejecutar el generador. Las coordenadas de los POIs salen de
-- scripts/geocode-neighborhood-pois.mjs (Nominatim + estaciones de Overpass)
-- y están validadas por radio contra el centro de su barrio; ninguna se ha
-- escrito de memoria.
--
-- Idempotente: se puede reaplicar sin duplicar filas.

-- 1) Alias y adscripción administrativa.
--    'aliases' evita reescribir el catálogo de propiedades: una zona sucia
--    ("Lista, Barrio de Salamanca") resuelve contra el barrio canónico sin
--    tocar la ficha. Un valor sólo puede pertenecer a un barrio: lo garantiza
--    el índice único de más abajo.
alter table neighborhoods add column if not exists aliases      text[] not null default '{}';
alter table neighborhoods add column if not exists district     text;
alter table neighborhoods add column if not exists municipality text not null default 'Madrid';

create index if not exists idx_neighborhoods_aliases on neighborhoods using gin (aliases);


-- 2) Alias sobre los barrios que ya existían.
update neighborhoods set aliases = '{"barrio-de-salamanca"}', updated_at = now() where zone_key = 'salamanca';
update neighborhoods set aliases = '{"pozuelo-de-alarcon"}', updated_at = now() where zone_key = 'pozuelo';

-- 3) Barrios nuevos (20), ordenados por volumen de propiedades activas.
insert into neighborhoods (country, zone_key, display_name, intro, aliases, district, municipality, active) values
  ('es', 'castellana', 'Castellana', 'Castellana es uno de los seis barrios del distrito de Salamanca, el que se apoya en el paseo del mismo nombre. Su trama es la del Plan Castro de 1860: manzanas rectangulares y calles anchas y arboladas. Buena parte de los palacetes decimonónicos que lo ocupan son hoy embajadas, fundaciones y sedes corporativas, entre edificios de vivienda de techos altos.', '{}', 'Salamanca', 'Madrid', true),
  ('es', 'lista', 'Lista', 'Lista es el barrio más pequeño del distrito de Salamanca, delimitado por Ortega y Gasset, Juan Bravo, Príncipe de Vergara y el paseo de la Castellana. Es residencial, con comercio a pie de calle y edificación cerrada del ensanche del siglo XIX y principios del XX. Toma el nombre de la antigua calle de Lista, hoy José Ortega y Gasset.', '{"lista-barrio-de-salamanca"}', 'Salamanca', 'Madrid', true),
  ('es', 'goya', 'Goya', 'El barrio de Goya ocupa el sur del distrito de Salamanca, entre O''Donnell, Doctor Esquerdo, Ramón de la Cruz y Menéndez Pelayo. La calle de Goya lo atraviesa y concentra su comercio. Predomina la vivienda de media altura del ensanche, y dentro de sus límites están la Fábrica Nacional de Moneda y Timbre y el antiguo Palacio de los Deportes.', '{}', 'Salamanca', 'Madrid', true),
  ('es', 'fuente-del-berro', 'Fuente del Berro', 'Fuente del Berro es un barrio residencial del distrito de Salamanca, al este de la calle de Doctor Esquerdo. Creció fuera de las rondas a partir de los años veinte con colonias de casas unifamiliares que todavía se conservan entre edificación posterior. Su referencia verde es el parque de la Quinta de la Fuente del Berro, jardín histórico de origen barroco.', '{"fuente-del-berro-barrio-de-salamanca"}', 'Salamanca', 'Madrid', true),
  ('es', 'guindalera', 'Guindalera', 'La Guindalera se urbanizó fuera de las rondas a partir de los años veinte, cuando esta zona era todavía las afueras de Madrid, y hoy es el barrio de trama más menuda del distrito de Salamanca. Conserva la colonia del Madrid Moderno, de casas neomudéjares, y limita por el este con la plaza de toros de Las Ventas.', '{}', 'Salamanca', 'Madrid', true),
  ('es', 'el-viso', 'El Viso', 'El Viso es una colonia de hotelitos proyectada en los años treinta dentro del distrito de Chamartín, entre Serrano, María de Molina y el paseo de la Castellana. Se levantó como ciudad jardín de trazas racionalistas: viviendas unifamiliares de dos y tres plantas, jardín propio y calles de poco tráfico. Es de las pocas zonas de baja densidad dentro de la almendra central.', '{"viso"}', 'Chamartín', 'Madrid', true),
  ('es', 'hispanoamerica', 'Hispanoamérica', 'Hispanoamérica es un barrio del distrito de Chamartín, al norte de la avenida de Concha Espina y al este del paseo de la Castellana. Se desarrolló entre los años cincuenta y setenta con bloques abiertos, zonas ajardinadas entre edificios y calles que llevan nombres de países americanos. El estadio Santiago Bernabéu queda junto a su límite oeste.', '{"bernabeu-hispanoamerica","bernabeu"}', 'Chamartín', 'Madrid', true),
  ('es', 'nueva-espana', 'Nueva España', 'Nueva España es un barrio del distrito de Chamartín levantado entre los años cincuenta y sesenta al norte de la avenida de Alfonso XIII. Alterna bloques abiertos con colonias de vivienda unifamiliar, de modo que su densidad es baja para la zona. El parque de Berlín, abierto en 1967 sobre antiguos terrenos ferroviarios, es su principal espacio verde.', '{}', 'Chamartín', 'Madrid', true),
  ('es', 'castillejos', 'Castillejos', 'Castillejos es un barrio del distrito de Tetuán, al oeste del paseo de la Castellana y a la altura de la plaza de Cuzco. Se construyó sobre todo en los años sesenta, con bloques de altura sobre trama regular y la calle de Orense como eje comercial. El complejo de oficinas de AZCA queda inmediatamente al sur.', '{"cuzco-castillejos","cuzco"}', 'Tetuán', 'Madrid', true),
  ('es', 'trafalgar', 'Trafalgar', 'Trafalgar es uno de los seis barrios de Chamberí, entre Santa Engracia, Carranza y la glorieta de Bilbao. Es de trama ortogonal y edificación cerrada del siglo XIX, con abundancia de fachadas neomudéjares y modernistas. La plaza de Olavide, resultado del derribo de su antiguo mercado cubierto, funciona como centro del barrio.', '{}', 'Chamberí', 'Madrid', true),
  ('es', 'rios-rosas', 'Ríos Rosas', 'Ríos Rosas es el barrio de Chamberí situado entre José Abascal y Raimundo Fernández Villaverde, continuación al norte de Almagro. Sus calles son ortogonales y la edificación mezcla vivienda del ensanche con equipamiento institucional: la Escuela de Minas y su Museo Geominero, y los depósitos del Canal de Isabel II. Nuevos Ministerios queda en su extremo oriental.', '{"nuevos-ministerios-rios-rosas","nuevos-ministerios"}', 'Chamberí', 'Madrid', true),
  ('es', 'malasana', 'Malasaña', 'Malasaña es el nombre con el que se conoce el barrio de Universidad, en el distrito Centro, entre Fuencarral, Carranza, San Bernardo y la Gran Vía. Su trazado es anterior al ensanche: calles estrechas, manzanas irregulares y edificación de baja y media altura. La plaza del Dos de Mayo ocupa el solar del antiguo cuartel de Monteleón.', '{"malasana-universidad","universidad","dos-de-mayo"}', 'Centro', 'Madrid', true),
  ('es', 'chueca', 'Chueca', 'Chueca es el nombre popular del barrio de Justicia, en el distrito Centro, entre Fuencarral, la Gran Vía, Recoletos y Génova. Combina calles estrechas de trazado antiguo con el eje más señorial de Almirante y Barquillo. Es zona de comercio a pie de calle y hostelería densa, con el mercado de San Antón como referencia.', '{"chueca-justicia","justicia"}', 'Centro', 'Madrid', true),
  ('es', 'lavapies', 'Lavapiés', 'Lavapiés ocupa la parte alta del barrio de Embajadores, en el distrito Centro, entre Atocha, la calle de Embajadores y la ronda de Valencia. Su trazado es de origen medieval y en pendiente, con corralas todavía en pie. Alberga equipamientos culturales como Tabacalera y La Casa Encendida, y el Reina Sofía queda en su borde este.', '{"lavapies-embajadores","embajadores"}', 'Centro', 'Madrid', true),
  ('es', 'ibiza', 'Ibiza', 'Ibiza es un barrio del distrito de Retiro delimitado por Menéndez Pelayo, O''Donnell, Doctor Esquerdo y Sainz de Baranda. Da directamente al parque del Retiro por su lado oeste. La edificación combina manzana cerrada del ensanche con promociones de posguerra, es mayoritariamente residencial y tiene la calle de Ibiza como eje comercial.', '{}', 'Retiro', 'Madrid', true),
  ('es', 'nino-jesus', 'Niño Jesús', 'Niño Jesús es un barrio del distrito de Retiro situado al sur de Sainz de Baranda, junto al límite meridional del parque del Retiro. Toma su nombre del hospital infantil abierto en 1877 en la avenida de Menéndez Pelayo, el primero de España dedicado a la infancia. Es residencial y de densidad menor que los barrios contiguos.', '{}', 'Retiro', 'Madrid', true),
  ('es', 'estrella', 'Estrella', 'Estrella es un barrio del distrito de Retiro, al este de Doctor Esquerdo y al sur de O''Donnell. Se construyó en su mayor parte entre los años cuarenta y sesenta con bloques abiertos y colonias, de modo que abunda el espacio libre entre edificios. El hospital Gregorio Marañón queda junto a su borde noroeste.', '{}', 'Retiro', 'Madrid', true),
  ('es', 'somosaguas', 'Somosaguas', 'Somosaguas es una zona residencial del municipio de Pozuelo de Alarcón, al oeste de Madrid y contigua a la Casa de Campo. Está formada por urbanizaciones de vivienda unifamiliar con parcela y apenas tiene edificación en altura. El campus de Somosaguas de la Universidad Complutense, con las facultades de Ciencias Sociales, ocupa su extremo norte.', '{}', null, 'Pozuelo de Alarcón', true),
  ('es', 'prado-de-somosaguas', 'Prado de Somosaguas', 'Prado de Somosaguas es una urbanización del municipio de Pozuelo de Alarcón, contigua a Somosaguas por el oeste. Se desarrolló como área residencial de baja densidad, con viviendas unifamiliares y adosadas sobre calles de trazado curvo y sin tráfico de paso. Los servicios y el comercio del casco de Pozuelo quedan al norte.', '{}', null, 'Pozuelo de Alarcón', true),
  ('es', 'torrelodones', 'Torrelodones', 'Torrelodones es un municipio del noroeste de la Comunidad de Madrid, en el piedemonte de la sierra de Guadarrama y a unos veintinueve kilómetros de la capital. Se organiza en dos núcleos principales: el casco antiguo y la Colonia, surgida en el último tercio del siglo XIX alrededor de la estación de ferrocarril. Predomina la vivienda unifamiliar con parcela.', '{"centro-comercial-hospital","los-bomberos","torrelodones-colonia","la-colonia"}', null, 'Torrelodones', true)
on conflict (zone_key) do update set
  display_name = excluded.display_name,
  intro        = excluded.intro,
  aliases      = excluded.aliases,
  district     = excluded.district,
  municipality = excluded.municipality,
  updated_at   = now();

-- 4) Un alias no puede resolver a dos barrios distintos ni pisar un zone_key:
--    si ocurriera, el SmartLink mostraría el barrio equivocado. Se comprueba
--    aquí y la migración aborta antes de dejar datos ambiguos.
do $$
declare dup text;
begin
  select string_agg(a, ', ') into dup from (
    select unnest(aliases) a from neighborhoods group by 1 having count(*) > 1
  ) t;
  if dup is not null then
    raise exception 'Alias duplicados en neighborhoods: %', dup;
  end if;
  select string_agg(n.zone_key, ', ') into dup
  from neighborhoods n
  where exists (select 1 from neighborhoods m where m.id <> n.id and n.zone_key = any(m.aliases));
  if dup is not null then
    raise exception 'Alias que pisan un zone_key existente: %', dup;
  end if;
end $$;

-- 5) POIs curados. Mismo patrón idempotente que 0144: se borra el lote y se
--    reinserta, porque la tabla no tiene clave natural.
--
--    bbox_*: envolvente del polígono en OSM, sólo para los POIs que ocupan
--    superficie apreciable (parques, recintos, campus). Sin ella, un parque
--    se mide contra el centro de su polígono y una vivienda pegada a la verja
--    del Retiro salía a "18 min a pie". Los POIs puntuales la dejan a null.
alter table neighborhood_pois add column if not exists bbox_min_lat double precision;
alter table neighborhood_pois add column if not exists bbox_min_lng double precision;
alter table neighborhood_pois add column if not exists bbox_max_lat double precision;
alter table neighborhood_pois add column if not exists bbox_max_lng double precision;

delete from neighborhood_pois where verified_source like 'osm-2026-08%';
with n as (select id, zone_key from neighborhoods)
insert into neighborhood_pois (neighborhood_id, name, category, latitude, longitude, priority, travel_modes, verified_source,
                               bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng)
select n.id, p.name, p.category, p.lat, p.lng, p.priority, p.modes::text[], p.src,
       p.bmin_lat, p.bmin_lng, p.bmax_lat, p.bmax_lng
from n
join (values
  ('castellana', 'Museo Lázaro Galdiano', 'cultura', 40.436964, -3.685764, 10, '{"walk"}', 'osm-2026-08 way/135087935', null::double precision, null::double precision, null::double precision, null::double precision),
  ('castellana', 'Mercado de la Paz', 'gastronomia', 40.42718, -3.685755, 20, '{"walk"}', 'osm-2026-08 way/330451579', null::double precision, null::double precision, null::double precision, null::double precision),
  ('castellana', 'Calle Serrano', 'compras', 40.427925, -3.687378, 30, '{"walk"}', 'osm-2026-08 way/43405582', 40.4253904, -3.6878644, 40.430462, -3.6869094),
  ('castellana', 'Fundación Juan March', 'cultura', 40.431274, -3.681445, 40, '{"walk"}', 'osm-2026-08 way/320458766', null::double precision, null::double precision, null::double precision, null::double precision),
  ('castellana', 'Metro Gregorio Marañón', 'transporte', 40.437994, -3.691213, 50, '{"walk"}', 'osm-2026-08 node/5304690736', null::double precision, null::double precision, null::double precision, null::double precision),
  ('castellana', 'Parque del Retiro', 'parque', 40.414946, -3.683285, 60, '{"walk","drive"}', 'osm-2026-08 relation/13616929', 40.4082704, -3.6888201, 40.4214566, -3.6766055),
  ('lista', 'Metro Lista', 'transporte', 40.429397, -3.675399, 10, '{"walk"}', 'osm-2026-08 node/5302296733', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lista', 'Mercado de la Paz', 'gastronomia', 40.42718, -3.685755, 20, '{"walk"}', 'osm-2026-08 way/330451579', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lista', 'Calle Serrano', 'compras', 40.427925, -3.687378, 30, '{"walk"}', 'osm-2026-08 way/43405582', 40.4253904, -3.6878644, 40.430462, -3.6869094),
  ('lista', 'Museo Lázaro Galdiano', 'cultura', 40.436964, -3.685764, 40, '{"walk"}', 'osm-2026-08 way/135087935', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lista', 'Colegio Nuestra Señora del Pilar', 'educacion', 40.428271, -3.680787, 50, '{"walk"}', 'osm-2026-08 way/4651596', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lista', 'Parque del Retiro', 'parque', 40.414946, -3.683285, 60, '{"walk","drive"}', 'osm-2026-08 relation/13616929', 40.4082704, -3.6888201, 40.4214566, -3.6766055),
  ('goya', 'Parque del Retiro', 'parque', 40.414946, -3.683285, 10, '{"walk"}', 'osm-2026-08 relation/13616929', 40.4082704, -3.6888201, 40.4214566, -3.6766055),
  ('goya', 'Metro Goya', 'transporte', 40.424699, -3.6762, 20, '{"walk"}', 'osm-2026-08 node/5302296734', null::double precision, null::double precision, null::double precision, null::double precision),
  ('goya', 'Movistar Arena', 'deporte', 40.423862, -3.671788, 30, '{"walk"}', 'osm-2026-08 way/15808330', 40.4232247, -3.6725058, 40.4244785, -3.6711108),
  ('goya', 'El Corte Inglés de Goya', 'compras', 40.424335, -3.674757, 40, '{"walk"}', 'osm-2026-08 way/264533053', null::double precision, null::double precision, null::double precision, null::double precision),
  ('goya', 'Mercado de la Paz', 'gastronomia', 40.42718, -3.685755, 50, '{"walk"}', 'osm-2026-08 way/330451579', null::double precision, null::double precision, null::double precision, null::double precision),
  ('goya', 'Fábrica Nacional de Moneda y Timbre', 'cultura', 40.422692, -3.672149, 60, '{"walk"}', 'osm-2026-08 relation/13971053', 40.4222192, -3.6726747, 40.423154, -3.6690805),
  ('fuente-del-berro', 'Parque de la Fuente del Berro', 'parque', 40.425506, -3.660724, 10, '{"walk"}', 'osm-2026-08 way/210814085', 40.4213684, -3.6630129, 40.4295508, -3.659651),
  ('fuente-del-berro', 'Metro O''Donnell', 'transporte', 40.422202, -3.669063, 20, '{"walk"}', 'osm-2026-08 node/5305486982', null::double precision, null::double precision, null::double precision, null::double precision),
  ('fuente-del-berro', 'Plaza de Toros de Las Ventas', 'cultura', 40.432332, -3.663344, 30, '{"walk"}', 'osm-2026-08 way/23321768', 40.4314797, -3.6644091, 40.4331606, -3.6624659),
  ('fuente-del-berro', 'Movistar Arena', 'deporte', 40.423862, -3.671788, 40, '{"walk"}', 'osm-2026-08 way/15808330', 40.4232247, -3.6725058, 40.4244785, -3.6711108),
  ('fuente-del-berro', 'Parque del Retiro', 'parque', 40.414946, -3.683285, 50, '{"walk","drive"}', 'osm-2026-08 relation/13616929', 40.4082704, -3.6888201, 40.4214566, -3.6766055),
  ('guindalera', 'Plaza de Toros de Las Ventas', 'cultura', 40.432332, -3.663344, 10, '{"walk"}', 'osm-2026-08 way/23321768', 40.4314797, -3.6644091, 40.4331606, -3.6624659),
  ('guindalera', 'Metro Cartagena', 'transporte', 40.439394, -3.671796, 20, '{"walk"}', 'osm-2026-08 node/5304690734', null::double precision, null::double precision, null::double precision, null::double precision),
  ('guindalera', 'Parque de la Fuente del Berro', 'parque', 40.425506, -3.660724, 30, '{"walk"}', 'osm-2026-08 way/210814085', 40.4213684, -3.6630129, 40.4295508, -3.659651),
  ('guindalera', 'Metro Diego de León', 'transporte', 40.434474, -3.67472, 40, '{"walk"}', 'osm-2026-08 node/5302296732', null::double precision, null::double precision, null::double precision, null::double precision),
  ('guindalera', 'Hospital Universitario Gregorio Marañón', 'salud', 40.419688, -3.671136, 50, '{"walk","drive"}', 'osm-2026-08 way/262480721', 40.4180817, -3.6730115, 40.4212394, -3.6693353),
  ('el-viso', 'Metro República Argentina', 'transporte', 40.444318, -3.684639, 10, '{"walk"}', 'osm-2026-08 node/5305486981', null::double precision, null::double precision, null::double precision, null::double precision),
  ('el-viso', 'Auditorio Nacional de Música', 'cultura', 40.445983, -3.677678, 20, '{"walk"}', 'osm-2026-08 way/27125344', 40.4454678, -3.6780185, 40.4466055, -3.6773238),
  ('el-viso', 'Museo Lázaro Galdiano', 'cultura', 40.436964, -3.685764, 30, '{"walk"}', 'osm-2026-08 way/135087935', null::double precision, null::double precision, null::double precision, null::double precision),
  ('el-viso', 'Mercado de Chamartín', 'gastronomia', 40.457431, -3.678244, 40, '{"walk"}', 'osm-2026-08 way/154807360', null::double precision, null::double precision, null::double precision, null::double precision),
  ('el-viso', 'Estadio Santiago Bernabéu', 'deporte', 40.453044, -3.688197, 50, '{"walk"}', 'osm-2026-08 way/1507411898', 40.4520252, -3.6896611, 40.4540635, -3.6867628),
  ('el-viso', 'Parque de Berlín', 'parque', 40.450502, -3.67563, 60, '{"walk","drive"}', 'osm-2026-08 way/11476987', 40.4493174, -3.6773738, 40.4515201, -3.674146),
  ('hispanoamerica', 'Estadio Santiago Bernabéu', 'deporte', 40.453044, -3.688197, 10, '{"walk"}', 'osm-2026-08 way/1507411898', 40.4520252, -3.6896611, 40.4540635, -3.6867628),
  ('hispanoamerica', 'Auditorio Nacional de Música', 'cultura', 40.445983, -3.677678, 20, '{"walk"}', 'osm-2026-08 way/27125344', 40.4454678, -3.6780185, 40.4466055, -3.6773238),
  ('hispanoamerica', 'Parque de Berlín', 'parque', 40.450502, -3.67563, 30, '{"walk"}', 'osm-2026-08 way/11476987', 40.4493174, -3.6773738, 40.4515201, -3.674146),
  ('hispanoamerica', 'Mercado de Chamartín', 'gastronomia', 40.457431, -3.678244, 40, '{"walk"}', 'osm-2026-08 way/154807360', null::double precision, null::double precision, null::double precision, null::double precision),
  ('hispanoamerica', 'Metro Concha Espina', 'transporte', 40.451329, -3.677608, 50, '{"walk"}', 'osm-2026-08 node/5307477096', null::double precision, null::double precision, null::double precision, null::double precision),
  ('hispanoamerica', 'Estación de Chamartín', 'transporte', 40.472057, -3.682262, 60, '{"walk","drive"}', 'osm-2026-08 node/9821007500', null::double precision, null::double precision, null::double precision, null::double precision),
  ('nueva-espana', 'Parque de Berlín', 'parque', 40.450502, -3.67563, 10, '{"walk"}', 'osm-2026-08 way/11476987', 40.4493174, -3.6773738, 40.4515201, -3.674146),
  ('nueva-espana', 'Metro Colombia', 'transporte', 40.457116, -3.676961, 20, '{"walk"}', 'osm-2026-08 node/5302030275', null::double precision, null::double precision, null::double precision, null::double precision),
  ('nueva-espana', 'Mercado de Chamartín', 'gastronomia', 40.457431, -3.678244, 30, '{"walk"}', 'osm-2026-08 way/154807360', null::double precision, null::double precision, null::double precision, null::double precision),
  ('nueva-espana', 'Auditorio Nacional de Música', 'cultura', 40.445983, -3.677678, 40, '{"walk"}', 'osm-2026-08 way/27125344', 40.4454678, -3.6780185, 40.4466055, -3.6773238),
  ('nueva-espana', 'Estadio Santiago Bernabéu', 'deporte', 40.453044, -3.688197, 50, '{"walk","drive"}', 'osm-2026-08 way/1507411898', 40.4520252, -3.6896611, 40.4540635, -3.6867628),
  ('nueva-espana', 'Estación de Chamartín', 'transporte', 40.472057, -3.682262, 60, '{"walk","drive"}', 'osm-2026-08 node/9821007500', null::double precision, null::double precision, null::double precision, null::double precision),
  ('castillejos', 'Metro Cuzco', 'transporte', 40.459484, -3.690017, 10, '{"walk"}', 'osm-2026-08 node/5310126820', null::double precision, null::double precision, null::double precision, null::double precision),
  ('castillejos', 'Estadio Santiago Bernabéu', 'deporte', 40.453044, -3.688197, 20, '{"walk"}', 'osm-2026-08 way/1507411898', 40.4520252, -3.6896611, 40.4540635, -3.6867628),
  ('castillejos', 'Mercado de Maravillas', 'gastronomia', 40.449154, -3.702888, 30, '{"walk"}', 'osm-2026-08 way/30625862', 40.4485102, -3.7035007, 40.4498519, -3.7022273),
  ('castillejos', 'Nuevos Ministerios', 'transporte', 40.445842, -3.691699, 40, '{"walk"}', 'osm-2026-08 node/4998670036', null::double precision, null::double precision, null::double precision, null::double precision),
  ('castillejos', 'Mercado de Chamartín', 'gastronomia', 40.457431, -3.678244, 50, '{"walk","drive"}', 'osm-2026-08 way/154807360', null::double precision, null::double precision, null::double precision, null::double precision),
  ('trafalgar', 'Plaza de Olavide', 'gastronomia', 40.432771, -3.701034, 10, '{"walk"}', 'osm-2026-08 way/992735167', null::double precision, null::double precision, null::double precision, null::double precision),
  ('trafalgar', 'Mercado de Barceló', 'gastronomia', 40.426545, -3.698786, 20, '{"walk"}', 'osm-2026-08 way/309097672', null::double precision, null::double precision, null::double precision, null::double precision),
  ('trafalgar', 'Museo Sorolla', 'cultura', 40.435393, -3.692512, 30, '{"walk"}', 'osm-2026-08 node/1719813601', null::double precision, null::double precision, null::double precision, null::double precision),
  ('trafalgar', 'Metro Quevedo', 'transporte', 40.433181, -3.704493, 40, '{"walk"}', 'osm-2026-08 node/5303271995', null::double precision, null::double precision, null::double precision, null::double precision),
  ('trafalgar', 'Andén 0 · Estación de Chamberí', 'cultura', 40.432259, -3.69773, 50, '{"walk"}', 'osm-2026-08 node/936505939', null::double precision, null::double precision, null::double precision, null::double precision),
  ('trafalgar', 'Gran Vía', 'compras', 40.420733, -3.706657, 60, '{"walk","drive"}', 'osm-2026-08 way/519453589', null::double precision, null::double precision, null::double precision, null::double precision),
  ('rios-rosas', 'Metro Ríos Rosas', 'transporte', 40.441594, -3.701592, 10, '{"walk"}', 'osm-2026-08 node/5299314588', null::double precision, null::double precision, null::double precision, null::double precision),
  ('rios-rosas', 'Nuevos Ministerios', 'transporte', 40.445842, -3.691699, 20, '{"walk"}', 'osm-2026-08 node/4998670036', null::double precision, null::double precision, null::double precision, null::double precision),
  ('rios-rosas', 'Museo Geominero', 'cultura', 40.442136, -3.700327, 30, '{"walk"}', 'osm-2026-08 node/4409398566', null::double precision, null::double precision, null::double precision, null::double precision),
  ('rios-rosas', 'Depósito del Canal de Isabel II', 'cultura', 40.439477, -3.70136, 40, '{"walk"}', 'osm-2026-08 way/48238313', null::double precision, null::double precision, null::double precision, null::double precision),
  ('rios-rosas', 'Plaza de Olavide', 'gastronomia', 40.432771, -3.701034, 50, '{"walk"}', 'osm-2026-08 way/992735167', null::double precision, null::double precision, null::double precision, null::double precision),
  ('rios-rosas', 'Museo Sorolla', 'cultura', 40.435393, -3.692512, 60, '{"walk"}', 'osm-2026-08 node/1719813601', null::double precision, null::double precision, null::double precision, null::double precision),
  ('malasana', 'Plaza del Dos de Mayo', 'otro', 40.426968, -3.704092, 10, '{"walk"}', 'osm-2026-08 way/4110831', null::double precision, null::double precision, null::double precision, null::double precision),
  ('malasana', 'Mercado de San Ildefonso', 'gastronomia', 40.424183, -3.700876, 20, '{"walk"}', 'osm-2026-08 way/332194825', null::double precision, null::double precision, null::double precision, null::double precision),
  ('malasana', 'Metro Tribunal', 'transporte', 40.426242, -3.701094, 30, '{"walk"}', 'osm-2026-08 node/5299314583', null::double precision, null::double precision, null::double precision, null::double precision),
  ('malasana', 'Museo de Historia de Madrid', 'cultura', 40.42579, -3.70076, 40, '{"walk"}', 'osm-2026-08 node/12921081474', null::double precision, null::double precision, null::double precision, null::double precision),
  ('malasana', 'Centro Cultural Conde Duque', 'cultura', 40.427015, -3.710837, 50, '{"walk"}', 'osm-2026-08 node/1439703535', null::double precision, null::double precision, null::double precision, null::double precision),
  ('malasana', 'Gran Vía', 'compras', 40.420733, -3.706657, 60, '{"walk"}', 'osm-2026-08 way/519453589', null::double precision, null::double precision, null::double precision, null::double precision),
  ('chueca', 'Mercado de San Antón', 'gastronomia', 40.421941, -3.697583, 10, '{"walk"}', 'osm-2026-08 way/161858028', null::double precision, null::double precision, null::double precision, null::double precision),
  ('chueca', 'Plaza de Chueca', 'otro', 40.422713, -3.69761, 20, '{"walk"}', 'osm-2026-08 way/4291307', null::double precision, null::double precision, null::double precision, null::double precision),
  ('chueca', 'Metro Chueca', 'transporte', 40.42267, -3.697674, 30, '{"walk"}', 'osm-2026-08 node/5303127354', null::double precision, null::double precision, null::double precision, null::double precision),
  ('chueca', 'Museo Arqueológico Nacional', 'cultura', 40.423429, -3.688889, 40, '{"walk"}', 'osm-2026-08 node/255288522', null::double precision, null::double precision, null::double precision, null::double precision),
  ('chueca', 'Biblioteca Nacional de España', 'cultura', 40.423728, -3.689904, 50, '{"walk"}', 'osm-2026-08 node/167386167', null::double precision, null::double precision, null::double precision, null::double precision),
  ('chueca', 'Gran Vía', 'compras', 40.420733, -3.706657, 60, '{"walk"}', 'osm-2026-08 way/519453589', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lavapies', 'Metro Lavapiés', 'transporte', 40.408454, -3.700661, 10, '{"walk"}', 'osm-2026-08 node/5303173543', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lavapies', 'Mercado de San Fernando', 'gastronomia', 40.40767, -3.703667, 20, '{"walk"}', 'osm-2026-08 way/48761409', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lavapies', 'Museo Reina Sofía', 'cultura', 40.408049, -3.694422, 30, '{"walk"}', 'osm-2026-08 way/991444051', 40.4071605, -3.696041, 40.4089286, -3.693149),
  ('lavapies', 'La Casa Encendida', 'cultura', 40.40607, -3.699885, 40, '{"walk"}', 'osm-2026-08 way/48761444', null::double precision, null::double precision, null::double precision, null::double precision),
  ('lavapies', 'Tabacalera', 'cultura', 40.406324, -3.703056, 50, '{"walk"}', 'osm-2026-08 relation/3421762', 40.4057005, -3.7034316, 40.4069352, -3.7021129),
  ('lavapies', 'Estación de Atocha', 'transporte', 40.405684, -3.690019, 60, '{"walk","drive"}', 'osm-2026-08 node/7499028216', null::double precision, null::double precision, null::double precision, null::double precision),
  ('ibiza', 'Parque del Retiro', 'parque', 40.414946, -3.683285, 10, '{"walk"}', 'osm-2026-08 relation/13616929', 40.4082704, -3.6888201, 40.4214566, -3.6766055),
  ('ibiza', 'Metro Ibiza', 'transporte', 40.418366, -3.678137, 20, '{"walk"}', 'osm-2026-08 node/5307477095', null::double precision, null::double precision, null::double precision, null::double precision),
  ('ibiza', 'Puerta de Alcalá', 'cultura', 40.419984, -3.688726, 30, '{"walk"}', 'osm-2026-08 way/174805987', null::double precision, null::double precision, null::double precision, null::double precision),
  ('ibiza', 'Movistar Arena', 'deporte', 40.423862, -3.671788, 40, '{"walk"}', 'osm-2026-08 way/15808330', 40.4232247, -3.6725058, 40.4244785, -3.6711108),
  ('ibiza', 'Museo del Prado', 'cultura', 40.413792, -3.692041, 50, '{"walk","drive"}', 'osm-2026-08 relation/7726080', 40.4128535, -3.6927472, 40.4147856, -3.6904926),
  ('nino-jesus', 'Parque del Retiro', 'parque', 40.414946, -3.683285, 10, '{"walk"}', 'osm-2026-08 relation/13616929', 40.4082704, -3.6888201, 40.4214566, -3.6766055),
  ('nino-jesus', 'Hospital Infantil Niño Jesús', 'salud', 40.414852, -3.677356, 20, '{"walk"}', 'osm-2026-08 node/1439705598', null::double precision, null::double precision, null::double precision, null::double precision),
  ('nino-jesus', 'Metro Sainz de Baranda', 'transporte', 40.414396, -3.669673, 30, '{"walk"}', 'osm-2026-08 node/5305486983', null::double precision, null::double precision, null::double precision, null::double precision),
  ('nino-jesus', 'Real Jardín Botánico', 'parque', 40.412366, -3.692145, 40, '{"walk"}', 'osm-2026-08 node/9871956508', null::double precision, null::double precision, null::double precision, null::double precision),
  ('nino-jesus', 'Estación de Atocha', 'transporte', 40.405684, -3.690019, 50, '{"walk","drive"}', 'osm-2026-08 node/7499028216', null::double precision, null::double precision, null::double precision, null::double precision),
  ('estrella', 'Parque del Retiro', 'parque', 40.414946, -3.683285, 10, '{"walk"}', 'osm-2026-08 relation/13616929', 40.4082704, -3.6888201, 40.4214566, -3.6766055),
  ('estrella', 'Metro Sainz de Baranda', 'transporte', 40.414396, -3.669673, 20, '{"walk"}', 'osm-2026-08 node/5305486983', null::double precision, null::double precision, null::double precision, null::double precision),
  ('estrella', 'Hospital Universitario Gregorio Marañón', 'salud', 40.419688, -3.671136, 30, '{"walk"}', 'osm-2026-08 way/262480721', 40.4180817, -3.6730115, 40.4212394, -3.6693353),
  ('estrella', 'Movistar Arena', 'deporte', 40.423862, -3.671788, 40, '{"walk"}', 'osm-2026-08 way/15808330', 40.4232247, -3.6725058, 40.4244785, -3.6711108),
  ('estrella', 'Metro O''Donnell', 'transporte', 40.422202, -3.669063, 50, '{"walk"}', 'osm-2026-08 node/5305486982', null::double precision, null::double precision, null::double precision, null::double precision),
  ('somosaguas', 'Campus de Somosaguas (UCM)', 'educacion', 40.433444, -3.795142, 10, '{"walk","drive"}', 'osm-2026-08 node/5311950999', null::double precision, null::double precision, null::double precision, null::double precision),
  ('somosaguas', 'Casa de Campo', 'parque', 40.424191, -3.755858, 20, '{"drive"}', 'osm-2026-08 relation/1946885', 40.3992357, -3.7813887, 40.449071, -3.7227618),
  ('somosaguas', 'Club de Campo Villa de Madrid', 'deporte', 40.447448, -3.745398, 30, '{"drive"}', 'osm-2026-08 relation/14612', 40.4454132, -3.7477803, 40.4505663, -3.7430987),
  ('somosaguas', 'Estación de Pozuelo (Cercanías)', 'transporte', 40.447408, -3.800061, 40, '{"drive"}', 'osm-2026-08 node/5318415084', null::double precision, null::double precision, null::double precision, null::double precision),
  ('somosaguas', 'Zoco de Pozuelo', 'compras', 40.419663, -3.797476, 50, '{"drive"}', 'osm-2026-08 way/28327068', 40.4192191, -3.7981957, 40.4200564, -3.7967555),
  ('prado-de-somosaguas', 'Campus de Somosaguas (UCM)', 'educacion', 40.433444, -3.795142, 10, '{"drive"}', 'osm-2026-08 node/5311950999', null::double precision, null::double precision, null::double precision, null::double precision),
  ('prado-de-somosaguas', 'Zoco de Pozuelo', 'compras', 40.419663, -3.797476, 20, '{"drive"}', 'osm-2026-08 way/28327068', 40.4192191, -3.7981957, 40.4200564, -3.7967555),
  ('prado-de-somosaguas', 'Estación de Pozuelo (Cercanías)', 'transporte', 40.447408, -3.800061, 30, '{"drive"}', 'osm-2026-08 node/5318415084', null::double precision, null::double precision, null::double precision, null::double precision),
  ('prado-de-somosaguas', 'Casa de Campo', 'parque', 40.424191, -3.755858, 50, '{"drive"}', 'osm-2026-08 relation/1946885', 40.3992357, -3.7813887, 40.449071, -3.7227618),
  ('torrelodones', 'Centro Comercial Espacio Torrelodones', 'compras', 40.569194, -3.921166, 10, '{"drive"}', 'osm-2026-08 node/1994670507', null::double precision, null::double precision, null::double precision, null::double precision),
  ('torrelodones', 'Hospital HM Torrelodones', 'salud', 40.570555, -3.926011, 20, '{"drive"}', 'osm-2026-08 way/143437105', null::double precision, null::double precision, null::double precision, null::double precision),
  ('torrelodones', 'Parque Pradogrande', 'parque', 40.578187, -3.952231, 40, '{"walk","drive"}', 'osm-2026-08 node/1590221261', null::double precision, null::double precision, null::double precision, null::double precision),
  ('torrelodones', 'Parque JH', 'parque', 40.57656, -3.92531, 50, '{"walk","drive"}', 'osm-2026-08 way/643098137', 40.5757166, -3.9262004, 40.57737, -3.9242609),
  ('torrelodones', 'Casino Gran Madrid', 'otro', 40.565656, -3.914338, 60, '{"drive"}', 'osm-2026-08 way/550627000', 40.5649683, -3.9149127, 40.5663438, -3.9137488)
) as p(zone_key, name, category, lat, lng, priority, modes, src, bmin_lat, bmin_lng, bmax_lat, bmax_lng)
  on p.zone_key = n.zone_key;

-- 6) Cuatro propiedades cuyo 'zone' es literalmente "Madrid" y por tanto no
--    resuelve contra ningún barrio. El barrio se ha obtenido por geocodifi-
--    cación INVERSA de las coordenadas de cada una contra los límites
--    administrativos de OSM (no del texto libre del anuncio, que en BC-1209
--    decía "Bernabéu-Hispanoamérica" cuando el punto cae en El Viso).
--    Sólo se escribe 'subzone'; 'zone' se deja intacto.
update properties set subzone = 'El Viso'      where bc_reference = 'BC-1209' and coalesce(subzone,'') = '';
update properties set subzone = 'Castillejos'  where bc_reference = 'BC-1211' and coalesce(subzone,'') = '';
update properties set subzone = 'Lista'        where bc_reference = 'BC-1210' and coalesce(subzone,'') = '';
update properties set subzone = 'Goya'         where bc_reference = 'BC-1401' and coalesce(subzone,'') = '';
