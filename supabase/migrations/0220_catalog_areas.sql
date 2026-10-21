-- ============================================================================
-- 0220 · BCP-01: registro de zonas con identidad estable y confirmación de la
-- zona de cada vivienda.
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (spec.md §4, DA22–DA24, DA37; plan.md PR2).
--
-- Qué añade:
--   · catalog_areas: los 21 distritos de Madrid y sus barrios con identidad
--     estable («madrid/salamanca/recoletos»), generados de lib/catalogs/
--     areas.ts (scripts/sql/gen-catalog-areas.mts). Nombres populares (Chueca,
--     Malasaña, Huertas) apuntan a su barrio oficial; los casi-duplicados de
--     la taxonomía son alias (términos) de uno solo.
--   · catalog_property_areas: la zona que CONFIRMA el dueño para una vivienda
--     (o «sin zona verificada»), con la huella de los datos de ubicación de la
--     ficha en ese momento. Si la ficha cambia, la confirmación deja de valer
--     y el gestor pide revisarla. La clasificación automática es solo una
--     sugerencia del gestor (TS) y nunca se publica sola (DA37).
--   · catalog_internal_snapshot: añade «area» al elemento solo con una
--     confirmación vigente del dueño del catálogo. Sin confirmaciones, la
--     instantánea y su huella no cambian.
--
-- Nunca escribe en properties. Independiente de los grupos de la HOME (0207)
-- y de los criterios de búsqueda (catalog_zone_terms, 0195).
-- Permisos (E1): RLS sin políticas, solo service_role.
-- Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0220.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS catalog_areas (
  id           text PRIMARY KEY,
  level        text NOT NULL,
  name         text NOT NULL,
  district_id  text REFERENCES catalog_areas(id),
  official_id  text REFERENCES catalog_areas(id),
  terms        text[] NOT NULL DEFAULT '{}',
  CONSTRAINT catalog_areas_level_ok CHECK (level IN ('distrito', 'barrio')),
  CONSTRAINT catalog_areas_district_ok CHECK ((level = 'distrito') = (district_id IS NULL))
);
ALTER TABLE catalog_areas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_areas FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_areas TO service_role;

INSERT INTO catalog_areas (id, level, name, district_id, official_id, terms) VALUES
  ('madrid/arganzuela', 'distrito', 'Arganzuela', NULL, NULL, ARRAY['arganzuela']::text[]),
  ('madrid/arganzuela/acacias', 'barrio', 'Acacias', 'madrid/arganzuela', NULL, ARRAY['acacias']::text[]),
  ('madrid/arganzuela/atocha', 'barrio', 'Atocha', 'madrid/arganzuela', NULL, ARRAY['atocha']::text[]),
  ('madrid/arganzuela/chopera', 'barrio', 'Chopera', 'madrid/arganzuela', NULL, ARRAY['chopera']::text[]),
  ('madrid/arganzuela/delicias', 'barrio', 'Delicias', 'madrid/arganzuela', NULL, ARRAY['delicias']::text[]),
  ('madrid/arganzuela/imperial', 'barrio', 'Imperial', 'madrid/arganzuela', NULL, ARRAY['imperial']::text[]),
  ('madrid/arganzuela/legazpi', 'barrio', 'Legazpi', 'madrid/arganzuela', NULL, ARRAY['legazpi']::text[]),
  ('madrid/arganzuela/palos-de-moguer', 'barrio', 'Palos de Moguer', 'madrid/arganzuela', NULL, ARRAY['palos de moguer', 'palos de la frontera']::text[]),
  ('madrid/barajas', 'distrito', 'Barajas', NULL, NULL, ARRAY['barajas']::text[]),
  ('madrid/barajas/aeropuerto', 'barrio', 'Aeropuerto', 'madrid/barajas', NULL, ARRAY['aeropuerto']::text[]),
  ('madrid/barajas/alameda-de-osuna', 'barrio', 'Alameda de Osuna', 'madrid/barajas', NULL, ARRAY['alameda de osuna']::text[]),
  ('madrid/barajas/casco-historico-de-barajas', 'barrio', 'Casco Histórico de Barajas', 'madrid/barajas', NULL, ARRAY['casco historico de barajas']::text[]),
  ('madrid/barajas/corralejos', 'barrio', 'Corralejos', 'madrid/barajas', NULL, ARRAY['corralejos']::text[]),
  ('madrid/barajas/timon', 'barrio', 'Timón', 'madrid/barajas', NULL, ARRAY['timon']::text[]),
  ('madrid/carabanchel', 'distrito', 'Carabanchel', NULL, NULL, ARRAY['carabanchel']::text[]),
  ('madrid/carabanchel/abrantes', 'barrio', 'Abrantes', 'madrid/carabanchel', NULL, ARRAY['abrantes']::text[]),
  ('madrid/carabanchel/buenavista', 'barrio', 'Buenavista', 'madrid/carabanchel', NULL, ARRAY['buenavista']::text[]),
  ('madrid/carabanchel/comillas', 'barrio', 'Comillas', 'madrid/carabanchel', NULL, ARRAY['comillas']::text[]),
  ('madrid/carabanchel/opanel', 'barrio', 'Opañel', 'madrid/carabanchel', NULL, ARRAY['opanel']::text[]),
  ('madrid/carabanchel/puerta-bonita', 'barrio', 'Puerta Bonita', 'madrid/carabanchel', NULL, ARRAY['puerta bonita']::text[]),
  ('madrid/carabanchel/san-isidro', 'barrio', 'San Isidro', 'madrid/carabanchel', NULL, ARRAY['san isidro']::text[]),
  ('madrid/carabanchel/vista-alegre', 'barrio', 'Vista Alegre', 'madrid/carabanchel', NULL, ARRAY['vista alegre']::text[]),
  ('madrid/centro', 'distrito', 'Centro', NULL, NULL, ARRAY['centro']::text[]),
  ('madrid/centro/chueca', 'barrio', 'Chueca', 'madrid/centro', 'madrid/centro/justicia', ARRAY['chueca']::text[]),
  ('madrid/centro/cortes', 'barrio', 'Cortes', 'madrid/centro', NULL, ARRAY['cortes']::text[]),
  ('madrid/centro/embajadores', 'barrio', 'Embajadores', 'madrid/centro', NULL, ARRAY['embajadores']::text[]),
  ('madrid/centro/huertas', 'barrio', 'Huertas', 'madrid/centro', 'madrid/centro/cortes', ARRAY['huertas']::text[]),
  ('madrid/centro/justicia', 'barrio', 'Justicia', 'madrid/centro', NULL, ARRAY['justicia']::text[]),
  ('madrid/centro/la-latina', 'barrio', 'La Latina', 'madrid/centro', NULL, ARRAY['la latina']::text[]),
  ('madrid/centro/lavapies', 'barrio', 'Lavapiés', 'madrid/centro', NULL, ARRAY['lavapies']::text[]),
  ('madrid/centro/malasana', 'barrio', 'Malasaña', 'madrid/centro', 'madrid/centro/universidad', ARRAY['malasana']::text[]),
  ('madrid/centro/palacio', 'barrio', 'Palacio', 'madrid/centro', NULL, ARRAY['palacio']::text[]),
  ('madrid/centro/sol', 'barrio', 'Sol', 'madrid/centro', NULL, ARRAY['sol']::text[]),
  ('madrid/centro/universidad', 'barrio', 'Universidad', 'madrid/centro', NULL, ARRAY['universidad']::text[]),
  ('madrid/chamartin', 'distrito', 'Chamartín', NULL, NULL, ARRAY['chamartin']::text[]),
  ('madrid/chamartin/castilla', 'barrio', 'Castilla', 'madrid/chamartin', NULL, ARRAY['castilla']::text[]),
  ('madrid/chamartin/ciudad-jardin', 'barrio', 'Ciudad Jardín', 'madrid/chamartin', NULL, ARRAY['ciudad jardin']::text[]),
  ('madrid/chamartin/el-viso', 'barrio', 'El Viso', 'madrid/chamartin', NULL, ARRAY['el viso']::text[]),
  ('madrid/chamartin/hispanoamerica', 'barrio', 'Hispanoamérica', 'madrid/chamartin', NULL, ARRAY['hispanoamerica']::text[]),
  ('madrid/chamartin/nueva-espana', 'barrio', 'Nueva España', 'madrid/chamartin', NULL, ARRAY['nueva espana']::text[]),
  ('madrid/chamartin/prosperidad', 'barrio', 'Prosperidad', 'madrid/chamartin', NULL, ARRAY['prosperidad']::text[]),
  ('madrid/chamberi', 'distrito', 'Chamberí', NULL, NULL, ARRAY['chamberi']::text[]),
  ('madrid/chamberi/almagro', 'barrio', 'Almagro', 'madrid/chamberi', NULL, ARRAY['almagro']::text[]),
  ('madrid/chamberi/arapiles', 'barrio', 'Arapiles', 'madrid/chamberi', NULL, ARRAY['arapiles']::text[]),
  ('madrid/chamberi/gaztambide', 'barrio', 'Gaztambide', 'madrid/chamberi', NULL, ARRAY['gaztambide']::text[]),
  ('madrid/chamberi/rios-rosas', 'barrio', 'Ríos Rosas', 'madrid/chamberi', NULL, ARRAY['rios rosas']::text[]),
  ('madrid/chamberi/trafalgar', 'barrio', 'Trafalgar', 'madrid/chamberi', NULL, ARRAY['trafalgar']::text[]),
  ('madrid/chamberi/vallehermoso', 'barrio', 'Vallehermoso', 'madrid/chamberi', NULL, ARRAY['vallehermoso']::text[]),
  ('madrid/ciudad-lineal', 'distrito', 'Ciudad Lineal', NULL, NULL, ARRAY['ciudad lineal']::text[]),
  ('madrid/ciudad-lineal/atalaya', 'barrio', 'Atalaya', 'madrid/ciudad-lineal', NULL, ARRAY['atalaya']::text[]),
  ('madrid/ciudad-lineal/colina', 'barrio', 'Colina', 'madrid/ciudad-lineal', NULL, ARRAY['colina']::text[]),
  ('madrid/ciudad-lineal/concepcion', 'barrio', 'Concepción', 'madrid/ciudad-lineal', NULL, ARRAY['concepcion']::text[]),
  ('madrid/ciudad-lineal/costillares', 'barrio', 'Costillares', 'madrid/ciudad-lineal', NULL, ARRAY['costillares']::text[]),
  ('madrid/ciudad-lineal/pueblo-nuevo', 'barrio', 'Pueblo Nuevo', 'madrid/ciudad-lineal', NULL, ARRAY['pueblo nuevo']::text[]),
  ('madrid/ciudad-lineal/quintana', 'barrio', 'Quintana', 'madrid/ciudad-lineal', NULL, ARRAY['quintana']::text[]),
  ('madrid/ciudad-lineal/san-juan-bautista', 'barrio', 'San Juan Bautista', 'madrid/ciudad-lineal', NULL, ARRAY['san juan bautista']::text[]),
  ('madrid/ciudad-lineal/san-pascual', 'barrio', 'San Pascual', 'madrid/ciudad-lineal', NULL, ARRAY['san pascual']::text[]),
  ('madrid/ciudad-lineal/ventas', 'barrio', 'Ventas', 'madrid/ciudad-lineal', NULL, ARRAY['ventas']::text[]),
  ('madrid/fuencarral-el-pardo', 'distrito', 'Fuencarral-El Pardo', NULL, NULL, ARRAY['fuencarral-el pardo']::text[]),
  ('madrid/fuencarral-el-pardo/arroyofresno', 'barrio', 'Arroyofresno', 'madrid/fuencarral-el-pardo', NULL, ARRAY['arroyofresno']::text[]),
  ('madrid/fuencarral-el-pardo/barrio-del-pilar', 'barrio', 'Barrio del Pilar', 'madrid/fuencarral-el-pardo', NULL, ARRAY['barrio del pilar']::text[]),
  ('madrid/fuencarral-el-pardo/el-goloso', 'barrio', 'El Goloso', 'madrid/fuencarral-el-pardo', NULL, ARRAY['el goloso']::text[]),
  ('madrid/fuencarral-el-pardo/el-pardo', 'barrio', 'El Pardo', 'madrid/fuencarral-el-pardo', NULL, ARRAY['el pardo']::text[]),
  ('madrid/fuencarral-el-pardo/fuentelarreina', 'barrio', 'Fuentelarreina', 'madrid/fuencarral-el-pardo', NULL, ARRAY['fuentelarreina']::text[]),
  ('madrid/fuencarral-el-pardo/la-paz', 'barrio', 'La Paz', 'madrid/fuencarral-el-pardo', NULL, ARRAY['la paz']::text[]),
  ('madrid/fuencarral-el-pardo/las-tablas', 'barrio', 'Las Tablas', 'madrid/fuencarral-el-pardo', NULL, ARRAY['las tablas']::text[]),
  ('madrid/fuencarral-el-pardo/mirasierra', 'barrio', 'Mirasierra', 'madrid/fuencarral-el-pardo', NULL, ARRAY['mirasierra']::text[]),
  ('madrid/fuencarral-el-pardo/montecarmelo', 'barrio', 'Montecarmelo', 'madrid/fuencarral-el-pardo', NULL, ARRAY['montecarmelo']::text[]),
  ('madrid/fuencarral-el-pardo/penagrande', 'barrio', 'Peñagrande', 'madrid/fuencarral-el-pardo', NULL, ARRAY['penagrande']::text[]),
  ('madrid/fuencarral-el-pardo/tres-olivos', 'barrio', 'Tres Olivos', 'madrid/fuencarral-el-pardo', NULL, ARRAY['tres olivos']::text[]),
  ('madrid/fuencarral-el-pardo/valverde', 'barrio', 'Valverde', 'madrid/fuencarral-el-pardo', NULL, ARRAY['valverde']::text[]),
  ('madrid/hortaleza', 'distrito', 'Hortaleza', NULL, NULL, ARRAY['hortaleza']::text[]),
  ('madrid/hortaleza/apostol-santiago', 'barrio', 'Apóstol Santiago', 'madrid/hortaleza', NULL, ARRAY['apostol santiago']::text[]),
  ('madrid/hortaleza/canillas', 'barrio', 'Canillas', 'madrid/hortaleza', NULL, ARRAY['canillas']::text[]),
  ('madrid/hortaleza/palomas', 'barrio', 'Palomas', 'madrid/hortaleza', NULL, ARRAY['palomas']::text[]),
  ('madrid/hortaleza/pinar-del-rey', 'barrio', 'Pinar del Rey', 'madrid/hortaleza', NULL, ARRAY['pinar del rey']::text[]),
  ('madrid/hortaleza/piovera', 'barrio', 'Piovera', 'madrid/hortaleza', NULL, ARRAY['piovera']::text[]),
  ('madrid/hortaleza/sanchinarro', 'barrio', 'Sanchinarro', 'madrid/hortaleza', NULL, ARRAY['sanchinarro']::text[]),
  ('madrid/hortaleza/valdebebas', 'barrio', 'Valdebebas', 'madrid/hortaleza', NULL, ARRAY['valdebebas']::text[]),
  ('madrid/hortaleza/valdefuentes', 'barrio', 'Valdefuentes', 'madrid/hortaleza', NULL, ARRAY['valdefuentes']::text[]),
  ('madrid/latina', 'distrito', 'Latina', NULL, NULL, ARRAY['latina']::text[]),
  ('madrid/latina/aluche', 'barrio', 'Aluche', 'madrid/latina', NULL, ARRAY['aluche']::text[]),
  ('madrid/latina/campamento', 'barrio', 'Campamento', 'madrid/latina', NULL, ARRAY['campamento']::text[]),
  ('madrid/latina/cuatro-vientos', 'barrio', 'Cuatro Vientos', 'madrid/latina', NULL, ARRAY['cuatro vientos']::text[]),
  ('madrid/latina/las-aguilas', 'barrio', 'Las Águilas', 'madrid/latina', NULL, ARRAY['las aguilas', 'aguilas']::text[]),
  ('madrid/latina/los-carmenes', 'barrio', 'Los Cármenes', 'madrid/latina', NULL, ARRAY['los carmenes']::text[]),
  ('madrid/latina/lucero', 'barrio', 'Lucero', 'madrid/latina', NULL, ARRAY['lucero']::text[]),
  ('madrid/latina/puerta-del-angel', 'barrio', 'Puerta del Ángel', 'madrid/latina', NULL, ARRAY['puerta del angel']::text[]),
  ('madrid/moncloa-aravaca', 'distrito', 'Moncloa-Aravaca', NULL, NULL, ARRAY['moncloa-aravaca']::text[]),
  ('madrid/moncloa-aravaca/aravaca', 'barrio', 'Aravaca', 'madrid/moncloa-aravaca', NULL, ARRAY['aravaca']::text[]),
  ('madrid/moncloa-aravaca/arguelles', 'barrio', 'Argüelles', 'madrid/moncloa-aravaca', NULL, ARRAY['arguelles']::text[]),
  ('madrid/moncloa-aravaca/casa-de-campo', 'barrio', 'Casa de Campo', 'madrid/moncloa-aravaca', NULL, ARRAY['casa de campo']::text[]),
  ('madrid/moncloa-aravaca/ciudad-universitaria', 'barrio', 'Ciudad Universitaria', 'madrid/moncloa-aravaca', NULL, ARRAY['ciudad universitaria']::text[]),
  ('madrid/moncloa-aravaca/el-plantio', 'barrio', 'El Plantío', 'madrid/moncloa-aravaca', NULL, ARRAY['el plantio']::text[]),
  ('madrid/moncloa-aravaca/valdemarin', 'barrio', 'Valdemarín', 'madrid/moncloa-aravaca', NULL, ARRAY['valdemarin']::text[]),
  ('madrid/moncloa-aravaca/valdezarza', 'barrio', 'Valdezarza', 'madrid/moncloa-aravaca', NULL, ARRAY['valdezarza']::text[]),
  ('madrid/moratalaz', 'distrito', 'Moratalaz', NULL, NULL, ARRAY['moratalaz']::text[]),
  ('madrid/moratalaz/fontarron', 'barrio', 'Fontarrón', 'madrid/moratalaz', NULL, ARRAY['fontarron']::text[]),
  ('madrid/moratalaz/horcajo', 'barrio', 'Horcajo', 'madrid/moratalaz', NULL, ARRAY['horcajo']::text[]),
  ('madrid/moratalaz/marroquina', 'barrio', 'Marroquina', 'madrid/moratalaz', NULL, ARRAY['marroquina']::text[]),
  ('madrid/moratalaz/media-legua', 'barrio', 'Media Legua', 'madrid/moratalaz', NULL, ARRAY['media legua']::text[]),
  ('madrid/moratalaz/pavones', 'barrio', 'Pavones', 'madrid/moratalaz', NULL, ARRAY['pavones']::text[]),
  ('madrid/moratalaz/vinateros', 'barrio', 'Vinateros', 'madrid/moratalaz', NULL, ARRAY['vinateros']::text[]),
  ('madrid/puente-de-vallecas', 'distrito', 'Puente de Vallecas', NULL, NULL, ARRAY['puente de vallecas']::text[]),
  ('madrid/puente-de-vallecas/entrevias', 'barrio', 'Entrevías', 'madrid/puente-de-vallecas', NULL, ARRAY['entrevias']::text[]),
  ('madrid/puente-de-vallecas/numancia', 'barrio', 'Numancia', 'madrid/puente-de-vallecas', NULL, ARRAY['numancia']::text[]),
  ('madrid/puente-de-vallecas/palomeras-bajas', 'barrio', 'Palomeras Bajas', 'madrid/puente-de-vallecas', NULL, ARRAY['palomeras bajas']::text[]),
  ('madrid/puente-de-vallecas/palomeras-sureste', 'barrio', 'Palomeras Sureste', 'madrid/puente-de-vallecas', NULL, ARRAY['palomeras sureste']::text[]),
  ('madrid/puente-de-vallecas/portazgo', 'barrio', 'Portazgo', 'madrid/puente-de-vallecas', NULL, ARRAY['portazgo']::text[]),
  ('madrid/puente-de-vallecas/san-diego', 'barrio', 'San Diego', 'madrid/puente-de-vallecas', NULL, ARRAY['san diego']::text[]),
  ('madrid/retiro', 'distrito', 'Retiro', NULL, NULL, ARRAY['retiro']::text[]),
  ('madrid/retiro/adelfas', 'barrio', 'Adelfas', 'madrid/retiro', NULL, ARRAY['adelfas']::text[]),
  ('madrid/retiro/estrella', 'barrio', 'Estrella', 'madrid/retiro', NULL, ARRAY['estrella']::text[]),
  ('madrid/retiro/ibiza', 'barrio', 'Ibiza', 'madrid/retiro', NULL, ARRAY['ibiza']::text[]),
  ('madrid/retiro/jeronimos', 'barrio', 'Jerónimos', 'madrid/retiro', NULL, ARRAY['jeronimos']::text[]),
  ('madrid/retiro/nino-jesus', 'barrio', 'Niño Jesús', 'madrid/retiro', NULL, ARRAY['nino jesus']::text[]),
  ('madrid/retiro/pacifico', 'barrio', 'Pacífico', 'madrid/retiro', NULL, ARRAY['pacifico']::text[]),
  ('madrid/salamanca', 'distrito', 'Salamanca', NULL, NULL, ARRAY['salamanca']::text[]),
  ('madrid/salamanca/castellana', 'barrio', 'Castellana', 'madrid/salamanca', NULL, ARRAY['castellana']::text[]),
  ('madrid/salamanca/fuente-del-berro', 'barrio', 'Fuente del Berro', 'madrid/salamanca', NULL, ARRAY['fuente del berro']::text[]),
  ('madrid/salamanca/goya', 'barrio', 'Goya', 'madrid/salamanca', NULL, ARRAY['goya']::text[]),
  ('madrid/salamanca/guindalera', 'barrio', 'Guindalera', 'madrid/salamanca', NULL, ARRAY['guindalera']::text[]),
  ('madrid/salamanca/lista', 'barrio', 'Lista', 'madrid/salamanca', NULL, ARRAY['lista']::text[]),
  ('madrid/salamanca/recoletos', 'barrio', 'Recoletos', 'madrid/salamanca', NULL, ARRAY['recoletos']::text[]),
  ('madrid/san-blas-canillejas', 'distrito', 'San Blas-Canillejas', NULL, NULL, ARRAY['san blas-canillejas']::text[]),
  ('madrid/san-blas-canillejas/amposta', 'barrio', 'Amposta', 'madrid/san-blas-canillejas', NULL, ARRAY['amposta']::text[]),
  ('madrid/san-blas-canillejas/arcos', 'barrio', 'Arcos', 'madrid/san-blas-canillejas', NULL, ARRAY['arcos']::text[]),
  ('madrid/san-blas-canillejas/canillejas', 'barrio', 'Canillejas', 'madrid/san-blas-canillejas', NULL, ARRAY['canillejas']::text[]),
  ('madrid/san-blas-canillejas/hellin', 'barrio', 'Hellín', 'madrid/san-blas-canillejas', NULL, ARRAY['hellin']::text[]),
  ('madrid/san-blas-canillejas/rejas', 'barrio', 'Rejas', 'madrid/san-blas-canillejas', NULL, ARRAY['rejas']::text[]),
  ('madrid/san-blas-canillejas/rosas', 'barrio', 'Rosas', 'madrid/san-blas-canillejas', NULL, ARRAY['rosas']::text[]),
  ('madrid/san-blas-canillejas/salvador', 'barrio', 'Salvador', 'madrid/san-blas-canillejas', NULL, ARRAY['salvador']::text[]),
  ('madrid/san-blas-canillejas/simancas', 'barrio', 'Simancas', 'madrid/san-blas-canillejas', NULL, ARRAY['simancas']::text[]),
  ('madrid/tetuan', 'distrito', 'Tetuán', NULL, NULL, ARRAY['tetuan']::text[]),
  ('madrid/tetuan/almenara', 'barrio', 'Almenara', 'madrid/tetuan', NULL, ARRAY['almenara']::text[]),
  ('madrid/tetuan/bellas-vistas', 'barrio', 'Bellas Vistas', 'madrid/tetuan', NULL, ARRAY['bellas vistas']::text[]),
  ('madrid/tetuan/berruguete', 'barrio', 'Berruguete', 'madrid/tetuan', NULL, ARRAY['berruguete']::text[]),
  ('madrid/tetuan/castillejos', 'barrio', 'Castillejos', 'madrid/tetuan', NULL, ARRAY['castillejos']::text[]),
  ('madrid/tetuan/cuatro-caminos', 'barrio', 'Cuatro Caminos', 'madrid/tetuan', NULL, ARRAY['cuatro caminos']::text[]),
  ('madrid/tetuan/valdeacederas', 'barrio', 'Valdeacederas', 'madrid/tetuan', NULL, ARRAY['valdeacederas']::text[]),
  ('madrid/tetuan/ventilla', 'barrio', 'Ventilla', 'madrid/tetuan', NULL, ARRAY['ventilla']::text[]),
  ('madrid/usera', 'distrito', 'Usera', NULL, NULL, ARRAY['usera']::text[]),
  ('madrid/usera/almendrales', 'barrio', 'Almendrales', 'madrid/usera', NULL, ARRAY['almendrales']::text[]),
  ('madrid/usera/moscardo', 'barrio', 'Moscardó', 'madrid/usera', NULL, ARRAY['moscardo']::text[]),
  ('madrid/usera/orcasitas', 'barrio', 'Orcasitas', 'madrid/usera', NULL, ARRAY['orcasitas']::text[]),
  ('madrid/usera/orcasur', 'barrio', 'Orcasur', 'madrid/usera', NULL, ARRAY['orcasur']::text[]),
  ('madrid/usera/pradolongo', 'barrio', 'Pradolongo', 'madrid/usera', NULL, ARRAY['pradolongo']::text[]),
  ('madrid/usera/san-fermin', 'barrio', 'San Fermín', 'madrid/usera', NULL, ARRAY['san fermin']::text[]),
  ('madrid/usera/zofio', 'barrio', 'Zofío', 'madrid/usera', NULL, ARRAY['zofio']::text[]),
  ('madrid/vicalvaro', 'distrito', 'Vicálvaro', NULL, NULL, ARRAY['vicalvaro']::text[]),
  ('madrid/vicalvaro/ambroz', 'barrio', 'Ambroz', 'madrid/vicalvaro', NULL, ARRAY['ambroz']::text[]),
  ('madrid/vicalvaro/casco-historico-de-vicalvaro', 'barrio', 'Casco Histórico de Vicálvaro', 'madrid/vicalvaro', NULL, ARRAY['casco historico de vicalvaro']::text[]),
  ('madrid/vicalvaro/el-canaveral', 'barrio', 'El Cañaveral', 'madrid/vicalvaro', NULL, ARRAY['el canaveral']::text[]),
  ('madrid/vicalvaro/valdebernardo', 'barrio', 'Valdebernardo', 'madrid/vicalvaro', NULL, ARRAY['valdebernardo']::text[]),
  ('madrid/vicalvaro/valderrivas', 'barrio', 'Valderrivas', 'madrid/vicalvaro', NULL, ARRAY['valderrivas']::text[]),
  ('madrid/villa-de-vallecas', 'distrito', 'Villa de Vallecas', NULL, NULL, ARRAY['villa de vallecas']::text[]),
  ('madrid/villa-de-vallecas/casco-historico-de-vallecas', 'barrio', 'Casco Histórico de Vallecas', 'madrid/villa-de-vallecas', NULL, ARRAY['casco historico de vallecas']::text[]),
  ('madrid/villa-de-vallecas/ensanche-de-vallecas', 'barrio', 'Ensanche de Vallecas', 'madrid/villa-de-vallecas', NULL, ARRAY['ensanche de vallecas']::text[]),
  ('madrid/villa-de-vallecas/santa-eugenia', 'barrio', 'Santa Eugenia', 'madrid/villa-de-vallecas', NULL, ARRAY['santa eugenia']::text[]),
  ('madrid/villaverde', 'distrito', 'Villaverde', NULL, NULL, ARRAY['villaverde']::text[]),
  ('madrid/villaverde/butarque', 'barrio', 'Butarque', 'madrid/villaverde', NULL, ARRAY['butarque']::text[]),
  ('madrid/villaverde/los-angeles', 'barrio', 'Los Ángeles', 'madrid/villaverde', NULL, ARRAY['los angeles']::text[]),
  ('madrid/villaverde/los-rosales', 'barrio', 'Los Rosales', 'madrid/villaverde', NULL, ARRAY['los rosales']::text[]),
  ('madrid/villaverde/san-andres', 'barrio', 'San Andrés', 'madrid/villaverde', NULL, ARRAY['san andres']::text[]),
  ('madrid/villaverde/san-cristobal', 'barrio', 'San Cristóbal', 'madrid/villaverde', NULL, ARRAY['san cristobal']::text[])
ON CONFLICT (id) DO UPDATE SET level = EXCLUDED.level, name = EXCLUDED.name, district_id = EXCLUDED.district_id, official_id = EXCLUDED.official_id, terms = EXCLUDED.terms;

CREATE TABLE IF NOT EXISTS catalog_property_areas (
  owner_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id  uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- Zona confirmada; NULL = «sin zona verificada» (la persona dijo que no).
  area_id      text        REFERENCES catalog_areas(id),
  input_sig    text        NOT NULL,
  decided_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, property_id)
);
ALTER TABLE catalog_property_areas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_property_areas FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_property_areas TO service_role;

-- Huella de los datos de ubicación de la ficha (zona, barrio y dirección).
CREATE OR REPLACE FUNCTION catalog_area_input_sig(p_property uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT md5(catalog_fold(p.zone) || chr(1) || catalog_fold(p.subzone) || chr(1) || catalog_fold(p.address))
    FROM properties p WHERE p.id = p_property
$$;

-- Confirma la zona de una vivienda (o «sin zona verificada» con p_area NULL).
CREATE OR REPLACE FUNCTION catalog_area_confirm(p_actor uuid, p_property uuid, p_area text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sig text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_sig := catalog_area_input_sig(p_property);
  IF v_sig IS NULL THEN RAISE EXCEPTION 'property_not_found'; END IF;
  IF p_area IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_areas WHERE id = p_area) THEN
    RAISE EXCEPTION 'area_not_found';
  END IF;
  INSERT INTO catalog_property_areas (owner_id, property_id, area_id, input_sig, decided_by, decided_at)
  VALUES (p_actor, p_property, p_area, v_sig, p_actor, now())
  ON CONFLICT (owner_id, property_id) DO UPDATE
     SET area_id = EXCLUDED.area_id, input_sig = EXCLUDED.input_sig, decided_by = EXCLUDED.decided_by, decided_at = now();
END
$$;

-- Quita la confirmación (vuelve a la sugerencia y a la zona de la ficha).
CREATE OR REPLACE FUNCTION catalog_area_clear(p_actor uuid, p_property uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM catalog_property_areas WHERE owner_id = p_actor AND property_id = p_property;
END
$$;

-- Confirmaciones del dueño para unas viviendas, con si siguen vigentes.
CREATE OR REPLACE FUNCTION catalog_area_decisions(p_actor uuid, p_properties uuid[])
RETURNS TABLE (property_id uuid, area_id text, still_current boolean, decided_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT d.property_id, d.area_id, d.input_sig = catalog_area_input_sig(d.property_id), d.decided_at
      FROM catalog_property_areas d
     WHERE d.owner_id = p_actor AND d.property_id = ANY (coalesce(p_properties, '{}'));
END
$$;

-- Instantánea interna: igual que 0217 + la zona confirmada.
CREATE OR REPLACE FUNCTION catalog_internal_snapshot(p_catalog uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'title',      c.title,
    'intro',      c.intro,
    'created_at', c.created_at,
    'status',     c.status,
    'owner_name', (SELECT pr.full_name FROM profiles pr WHERE pr.id = c.owner_id),
    'contact', jsonb_build_object(
      'name',  c.contact_name,
      'phone', c.contact_phone,
      'role',  c.contact_role
    ),
    'items', it.items
  ) || CASE WHEN c.cover_property_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('cover', jsonb_build_object(
    -- Clave pública de la vivienda elegida, solo si está en la lista.
    'key', (SELECT e->>'key' FROM jsonb_array_elements(it.items) e
             WHERE e->>'key' = coalesce(
               (SELECT ci.public_key FROM catalog_items ci WHERE ci.catalog_id = c.id AND ci.property_id = c.cover_property_id),
               left(md5(c.key_salt || c.cover_property_id::text), 16))
             LIMIT 1),
    -- Identificador opaco de la foto elegida (si sigue existiendo y es suya).
    'photo', (SELECT md5(ph.url) FROM property_photos ph
               WHERE ph.id = c.cover_photo_id AND ph.property_id = c.cover_property_id)
  )) END
  FROM catalogs c
  CROSS JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
             catalog_item_json(l.property_id, l.public_key)
             || coalesce(tx.j, '{}'::jsonb)
             || coalesce(st.j, '{}'::jsonb)
             || coalesce(phx.j, '{}'::jsonb)
             || coalesce(ttl.j, '{}'::jsonb)
             || coalesce(ar.j, '{}'::jsonb)
             ORDER BY l.o1, l.o2), '[]'::jsonb) AS items
      FROM (
        SELECT s.property_id, s.public_key, s.ord AS o1, NULL::uuid AS o2
          FROM catalog_select(c.id, c.criteria) s
         WHERE c.mode = 'auto'
        UNION ALL
        SELECT ci.property_id, ci.public_key, ci.position::bigint, ci.id
          FROM catalog_items ci
          JOIN properties p ON p.id = ci.property_id
         WHERE c.mode <> 'auto'
           AND ci.catalog_id = c.id
           AND p.archived_at IS NULL
           AND p.status::text NOT IN ('sold', 'archived')
      ) l
      -- Texto del catálogo: solo si está publicado y su fuente no cambió.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('text', jsonb_build_object('b', t.pub_body, 'l', t.pub_lead, 'h', to_jsonb(t.pub_highlights))) AS j
          FROM catalog_texts t
         WHERE t.catalog_id = c.id AND t.property_id = l.property_id
           AND (t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL)
           AND t.pub_source_hash = catalog_source_hash(l.property_id)
      ) tx ON true
      -- Historia aprobada (solo lectura; su vigencia se comprueba en TS).
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('story', jsonb_build_object(
                 'h',  v.source_hash,
                 'p',  CASE WHEN v.prelude_status = 'approved' THEN v.prelude END,
                 'ph', CASE WHEN v.prelude_status = 'approved' THEN v.prelude_headline END,
                 'b',  bl.blocks)) AS j
          FROM property_story_versions v
          CROSS JOIN LATERAL (
            SELECT jsonb_agg(jsonb_build_object('c', b.chapter, 't', b.copy) ORDER BY b.position, b.id) AS blocks
              FROM property_story_blocks b
             WHERE b.version_id = v.id AND b.status = 'approved' AND btrim(b.copy) <> ''
          ) bl
         WHERE v.property_id = l.property_id AND v.status = 'approved' AND bl.blocks IS NOT NULL
         LIMIT 1
      ) st ON true
      -- E3: ajustes de fotos de ESTE catálogo (solo de fotos que existen).
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('pp', jsonb_build_object(
                 'x', coalesce(jsonb_agg(catalog_photo_key(pp.photo_id) ORDER BY catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'exclude'), '[]'::jsonb),
                 'o', (array_agg(catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'opening'))[1])) AS j
          FROM catalog_photo_prefs pp
          JOIN property_photos ph ON ph.id = pp.photo_id AND ph.property_id = pp.property_id
         WHERE pp.catalog_id = c.id AND pp.property_id = l.property_id
        HAVING count(*) > 0
      ) phx ON true
      -- 0217: título propio publicado de ESTE catálogo (sin condición de
      -- vigencia: los cambios de la ficha no lo retiran).
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('title', t.pub_title) AS j
          FROM catalog_texts t
         WHERE t.catalog_id = c.id AND t.property_id = l.property_id AND t.pub_title IS NOT NULL
      ) ttl ON true
      -- 0220: zona CONFIRMADA por el dueño del catálogo, solo mientras los
      -- datos de ubicación de la ficha no hayan cambiado. Sin confirmación,
      -- nada (el lector usa la zona de la ficha, como antes). Con «sin zona
      -- verificada» (area_id nulo), nombre nulo: el lector dice «El barrio».
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('area', jsonb_build_object('name', a.name, 'level', a.level)) AS j
          FROM catalog_property_areas d
          LEFT JOIN catalog_areas a ON a.id = d.area_id
         WHERE d.owner_id = c.owner_id AND d.property_id = l.property_id
           AND d.input_sig = catalog_area_input_sig(l.property_id)
      ) ar ON true
    -- OFFSET 0: evita que el planificador calcule la lista dos veces (Y5).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;


REVOKE ALL ON FUNCTION catalog_area_input_sig(uuid)                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_confirm(uuid, uuid, text)      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_clear(uuid, uuid)              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_decisions(uuid, uuid[])        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)             FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_area_input_sig(uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_confirm(uuid, uuid, text)   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_clear(uuid, uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_decisions(uuid, uuid[])     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)          TO service_role;

COMMIT;
