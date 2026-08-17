import "server-only";

/**
 * Catálogo de zonas de Madrid capital TAL Y COMO LAS NOMBRA FOTOCASA.
 *
 * No sirve la taxonomía canónica de `lib/madrid-zones.ts`: Fotocasa fusiona
 * barrios y les pone nombres propios, así que sus slugs NO son deducibles del
 * nombre oficial. Comprobado contra el portal (2026-08-16):
 *
 *   "Salamanca"      → 404   el slug real es `barrio-de-salamanca`
 *   "Justicia"       → 404   el slug real es `justicia-chueca`
 *   "Ibiza"          → 404   el slug real es `ibiza-de-madrid`
 *   "Cuatro Caminos" → 404   el slug real es `cuatro-caminos-azca`
 *
 * Por eso el catálogo está VOLCADO del propio buscador (el bloque
 * `initialSearch.result.geographicSearch` del HTML de una búsqueda) en vez de
 * escrito a mano. Si Fotocasa reorganiza zonas, se vuelve a volcar de ahí.
 *
 * `approxListings` es una foto del número de anuncios EN ALQUILER el
 * 2026-08-16. Es orientativo — sólo se usa para ordenar y para dar una idea
 * del tamaño de cada zona en el panel; no se toma ninguna decisión con él.
 */

export type FotocasaZone = {
  /** Slug que va en la URL de búsqueda. */
  slug: string;
  /** Nombre tal y como lo muestra Fotocasa. */
  label: string;
  /** Distrito al que pertenece (null si el propio elemento es el distrito). */
  district: string | null;
  approxListings: number;
};

export type FotocasaDistrict = FotocasaZone & { subZones: FotocasaZone[] };

export const FOTOCASA_MADRID_DISTRICTS: FotocasaDistrict[] = [
  {
    slug: "arganzuela",
    label: "Arganzuela",
    district: null,
    approxListings: 331,
    subZones: [
      { slug: "acacias", label: "Acacias", district: "Arganzuela", approxListings: 58 },
      { slug: "chopera", label: "Chopera", district: "Arganzuela", approxListings: 28 },
      { slug: "delicias", label: "Delicias", district: "Arganzuela", approxListings: 87 },
      { slug: "imperial", label: "Imperial", district: "Arganzuela", approxListings: 48 },
      { slug: "legazpi", label: "Legazpi", district: "Arganzuela", approxListings: 17 },
      { slug: "palos-de-moguer", label: "Palos de Moguer", district: "Arganzuela", approxListings: 93 },
    ],
  },
  {
    slug: "barajas",
    label: "Barajas",
    district: null,
    approxListings: 23,
    subZones: [
      { slug: "aeropuerto", label: "Aeropuerto", district: "Barajas", approxListings: 1 },
      { slug: "alameda-de-osuna", label: "Alameda de Osuna", district: "Barajas", approxListings: 3 },
      { slug: "casco-historico-de-barajas", label: "Casco Histórico de Barajas", district: "Barajas", approxListings: 15 },
      { slug: "corralejos-campo-de-las-naciones", label: "Corralejos - Campo de las Naciones", district: "Barajas", approxListings: 2 },
      { slug: "timon", label: "Timón", district: "Barajas", approxListings: 2 },
    ],
  },
  {
    slug: "barrio-de-salamanca",
    label: "Barrio de Salamanca",
    district: null,
    approxListings: 1046,
    subZones: [
      { slug: "castellana", label: "Castellana", district: "Barrio de Salamanca", approxListings: 195 },
      { slug: "fuente-del-berro", label: "Fuente del Berro", district: "Barrio de Salamanca", approxListings: 83 },
      { slug: "goya", label: "Goya", district: "Barrio de Salamanca", approxListings: 248 },
      { slug: "guindalera", label: "Guindalera", district: "Barrio de Salamanca", approxListings: 163 },
      { slug: "lista", label: "Lista", district: "Barrio de Salamanca", approxListings: 139 },
      { slug: "recoletos", label: "Recoletos", district: "Barrio de Salamanca", approxListings: 218 },
    ],
  },
  {
    slug: "carabanchel",
    label: "Carabanchel",
    district: null,
    approxListings: 123,
    subZones: [
      { slug: "abrantes", label: "Abrantes", district: "Carabanchel", approxListings: 6 },
      { slug: "buena-vista", label: "Buena Vista", district: "Carabanchel", approxListings: 10 },
      { slug: "comillas", label: "Comillas", district: "Carabanchel", approxListings: 16 },
      { slug: "opanel", label: "Opañel", district: "Carabanchel", approxListings: 18 },
      { slug: "pau-de-carabanchel", label: "PAU de Carabanchel", district: "Carabanchel", approxListings: 5 },
      { slug: "puerta-bonita", label: "Puerta Bonita", district: "Carabanchel", approxListings: 15 },
      { slug: "san-isidro", label: "San Isidro", district: "Carabanchel", approxListings: 33 },
      { slug: "vista-alegre", label: "Vista Alegre", district: "Carabanchel", approxListings: 20 },
    ],
  },
  {
    slug: "centro",
    label: "Centro",
    district: null,
    approxListings: 2001,
    subZones: [
      { slug: "cortes-huertas", label: "Cortes - Huertas", district: "Centro", approxListings: 218 },
      { slug: "embajadores-lavapies", label: "Embajadores - Lavapiés", district: "Centro", approxListings: 525 },
      { slug: "justicia-chueca", label: "Justicia - Chueca", district: "Centro", approxListings: 274 },
      { slug: "palacio", label: "Palacio", district: "Centro", approxListings: 323 },
      { slug: "sol", label: "Sol", district: "Centro", approxListings: 227 },
      { slug: "universidad-malasana", label: "Universidad - Malasaña", district: "Centro", approxListings: 433 },
    ],
  },
  {
    slug: "chamartin",
    label: "Chamartín",
    district: null,
    approxListings: 509,
    subZones: [
      { slug: "castilla", label: "Castilla", district: "Chamartín", approxListings: 68 },
      { slug: "ciudad-jardin", label: "Ciudad Jardín", district: "Chamartín", approxListings: 66 },
      { slug: "el-viso", label: "El Viso", district: "Chamartín", approxListings: 81 },
      { slug: "hispanoamerica-bernabeu", label: "Hispanoamérica - Bernabéu", district: "Chamartín", approxListings: 87 },
      { slug: "nueva-espana", label: "Nueva España", district: "Chamartín", approxListings: 117 },
      { slug: "prosperidad", label: "Prosperidad", district: "Chamartín", approxListings: 90 },
    ],
  },
  {
    slug: "chamberi",
    label: "Chamberí",
    district: null,
    approxListings: 734,
    subZones: [
      { slug: "almagro", label: "Almagro", district: "Chamberí", approxListings: 162 },
      { slug: "arapiles", label: "Arapiles", district: "Chamberí", approxListings: 90 },
      { slug: "gaztambide", label: "Gaztambide", district: "Chamberí", approxListings: 86 },
      { slug: "rios-rosas-nuevos-ministerios", label: "Ríos Rosas - Nuevos Ministerios", district: "Chamberí", approxListings: 164 },
      { slug: "trafalgar", label: "Trafalgar", district: "Chamberí", approxListings: 188 },
      { slug: "vallehermoso", label: "Vallehermoso", district: "Chamberí", approxListings: 44 },
    ],
  },
  {
    slug: "ciudad-lineal",
    label: "Ciudad Lineal",
    district: null,
    approxListings: 200,
    subZones: [
      { slug: "atalaya", label: "Atalaya", district: "Ciudad Lineal", approxListings: 2 },
      { slug: "colina", label: "Colina", district: "Ciudad Lineal", approxListings: 11 },
      { slug: "concepcion", label: "Concepción", district: "Ciudad Lineal", approxListings: 24 },
      { slug: "costillares", label: "Costillares", district: "Ciudad Lineal", approxListings: 11 },
      { slug: "pueblo-nuevo", label: "Pueblo Nuevo", district: "Ciudad Lineal", approxListings: 46 },
      { slug: "quintana", label: "Quintana", district: "Ciudad Lineal", approxListings: 21 },
      { slug: "san-juan-bautista", label: "San Juan Bautista", district: "Ciudad Lineal", approxListings: 24 },
      { slug: "san-pascual", label: "San Pascual", district: "Ciudad Lineal", approxListings: 20 },
      { slug: "ventas", label: "Ventas", district: "Ciudad Lineal", approxListings: 41 },
    ],
  },
  {
    slug: "fuencarral-el-pardo",
    label: "Fuencarral - El Pardo",
    district: null,
    approxListings: 143,
    subZones: [
      { slug: "arroyo-del-fresno", label: "Arroyo del Fresno", district: "Fuencarral - El Pardo", approxListings: 4 },
      { slug: "el-pardo", label: "El Pardo", district: "Fuencarral - El Pardo", approxListings: 3 },
      { slug: "fuentelarreina", label: "Fuentelarreina", district: "Fuencarral - El Pardo", approxListings: 5 },
      { slug: "la-paz", label: "La Paz", district: "Fuencarral - El Pardo", approxListings: 19 },
      { slug: "las-tablas", label: "Las Tablas", district: "Fuencarral - El Pardo", approxListings: 17 },
      { slug: "mirasierra", label: "Mirasierra", district: "Fuencarral - El Pardo", approxListings: 5 },
      { slug: "montecarmelo", label: "Montecarmelo", district: "Fuencarral - El Pardo", approxListings: 7 },
      { slug: "penagrande", label: "Peñagrande", district: "Fuencarral - El Pardo", approxListings: 22 },
      { slug: "pilar", label: "Pilar", district: "Fuencarral - El Pardo", approxListings: 27 },
      { slug: "tres-olivos-valverde", label: "Tres Olivos - Valverde", district: "Fuencarral - El Pardo", approxListings: 34 },
    ],
  },
  {
    slug: "hortaleza",
    label: "Hortaleza",
    district: null,
    approxListings: 165,
    subZones: [
      { slug: "apostol-santiago", label: "Apóstol Santiago", district: "Hortaleza", approxListings: 6 },
      { slug: "canillas", label: "Canillas", district: "Hortaleza", approxListings: 16 },
      { slug: "conde-orgaz-piovera", label: "Conde Orgaz - Piovera", district: "Hortaleza", approxListings: 16 },
      { slug: "palomas", label: "Palomas", district: "Hortaleza", approxListings: 12 },
      { slug: "pinar-del-rey", label: "Pinar del Rey", district: "Hortaleza", approxListings: 47 },
      { slug: "sanchinarro", label: "Sanchinarro", district: "Hortaleza", approxListings: 19 },
      { slug: "valdebebas-valdefuentes", label: "Valdebebas - Valdefuentes", district: "Hortaleza", approxListings: 23 },
      { slug: "virgen-del-cortijo-manoteras", label: "Virgen del Cortijo - Manoteras", district: "Hortaleza", approxListings: 26 },
    ],
  },
  {
    slug: "latina",
    label: "Latina",
    district: null,
    approxListings: 115,
    subZones: [
      { slug: "aluche", label: "Aluche", district: "Latina", approxListings: 24 },
      { slug: "campamento", label: "Campamento", district: "Latina", approxListings: 3 },
      { slug: "cuatro-vientos", label: "Cuatro vientos", district: "Latina", approxListings: 1 },
      { slug: "las-aguilas", label: "Las Águilas", district: "Latina", approxListings: 12 },
      { slug: "los-carmenes", label: "Los Cármenes", district: "Latina", approxListings: 7 },
      { slug: "lucero", label: "Lucero", district: "Latina", approxListings: 21 },
      { slug: "puerta-del-angel", label: "Puerta del Ángel", district: "Latina", approxListings: 47 },
    ],
  },
  {
    slug: "moncloa-aravaca",
    label: "Moncloa - Aravaca",
    district: null,
    approxListings: 287,
    subZones: [
      { slug: "aravaca", label: "Aravaca", district: "Moncloa - Aravaca", approxListings: 32 },
      { slug: "arguelles", label: "Argüelles", district: "Moncloa - Aravaca", approxListings: 134 },
      { slug: "casa-de-campo", label: "Casa de Campo", district: "Moncloa - Aravaca", approxListings: 19 },
      { slug: "ciudad-universitaria", label: "Ciudad Universitaria", district: "Moncloa - Aravaca", approxListings: 64 },
      { slug: "la-florida-el-plantio", label: "La Florida -  El  Plantío", district: "Moncloa - Aravaca", approxListings: 10 },
      { slug: "valdemarin", label: "Valdemarín", district: "Moncloa - Aravaca", approxListings: 8 },
      { slug: "valdezarza", label: "Valdezarza", district: "Moncloa - Aravaca", approxListings: 20 },
    ],
  },
  {
    slug: "moratalaz",
    label: "Moratalaz",
    district: null,
    approxListings: 15,
    subZones: [
      { slug: "marroquina", label: "Marroquina", district: "Moratalaz", approxListings: 8 },
      { slug: "media-legua", label: "Media Legua", district: "Moratalaz", approxListings: 3 },
      { slug: "pavones", label: "Pavones", district: "Moratalaz", approxListings: 2 },
      { slug: "vinateros", label: "Vinateros", district: "Moratalaz", approxListings: 2 },
    ],
  },
  {
    slug: "puente-de-vallecas",
    label: "Puente de Vallecas",
    district: null,
    approxListings: 96,
    subZones: [
      { slug: "entrevias", label: "Entrevías", district: "Puente de Vallecas", approxListings: 12 },
      { slug: "numancia", label: "Numancia", district: "Puente de Vallecas", approxListings: 24 },
      { slug: "palomeras-bajas", label: "Palomeras Bajas", district: "Puente de Vallecas", approxListings: 6 },
      { slug: "palomeras-sureste", label: "Palomeras Sureste", district: "Puente de Vallecas", approxListings: 4 },
      { slug: "portazgo", label: "Portazgo", district: "Puente de Vallecas", approxListings: 6 },
      { slug: "san-diego", label: "San Diego", district: "Puente de Vallecas", approxListings: 44 },
    ],
  },
  {
    slug: "retiro",
    label: "Retiro",
    district: null,
    approxListings: 331,
    subZones: [
      { slug: "adelfas", label: "Adelfas", district: "Retiro", approxListings: 31 },
      { slug: "estrella", label: "Estrella", district: "Retiro", approxListings: 21 },
      { slug: "ibiza-de-madrid", label: "Ibiza de Madrid", district: "Retiro", approxListings: 117 },
      { slug: "jeronimos", label: "Jerónimos", district: "Retiro", approxListings: 66 },
      { slug: "nino-jesus", label: "Niño Jesús", district: "Retiro", approxListings: 32 },
      { slug: "pacifico", label: "Pacífico", district: "Retiro", approxListings: 64 },
    ],
  },
  {
    slug: "san-blas",
    label: "San Blas",
    district: null,
    approxListings: 79,
    subZones: [
      { slug: "amposta", label: "Amposta", district: "San Blas", approxListings: 1 },
      { slug: "arcos", label: "Arcos", district: "San Blas", approxListings: 2 },
      { slug: "canillejas", label: "Canillejas", district: "San Blas", approxListings: 7 },
      { slug: "hellin", label: "Hellín", district: "San Blas", approxListings: 1 },
      { slug: "rejas", label: "Rejas", district: "San Blas", approxListings: 26 },
      { slug: "rosas-musas", label: "Rosas - Musas", district: "San Blas", approxListings: 3 },
      { slug: "salvador", label: "Salvador", district: "San Blas", approxListings: 8 },
      { slug: "simancas", label: "Simancas", district: "San Blas", approxListings: 31 },
    ],
  },
  {
    slug: "tetuan",
    label: "Tetuán",
    district: null,
    approxListings: 556,
    subZones: [
      { slug: "almenara-ventilla", label: "Almenara -Ventilla", district: "Tetuán", approxListings: 90 },
      { slug: "bellas-vistas", label: "Bellas Vistas", district: "Tetuán", approxListings: 60 },
      { slug: "berruguete", label: "Berruguete", district: "Tetuán", approxListings: 64 },
      { slug: "castillejos-cuzco", label: "Castillejos - Cuzco", district: "Tetuán", approxListings: 78 },
      { slug: "cuatro-caminos-azca", label: "Cuatro Caminos - Azca", district: "Tetuán", approxListings: 170 },
      { slug: "valdeacederas", label: "Valdeacederas", district: "Tetuán", approxListings: 94 },
    ],
  },
  {
    slug: "usera",
    label: "Usera",
    district: null,
    approxListings: 94,
    subZones: [
      { slug: "almendrales", label: "Almendrales", district: "Usera", approxListings: 33 },
      { slug: "moscardo", label: "Moscardó", district: "Usera", approxListings: 27 },
      { slug: "orcasitas", label: "Orcasitas", district: "Usera", approxListings: 3 },
      { slug: "orcasur-12-de-octubre", label: "Orcasur - 12 de Octubre", district: "Usera", approxListings: 3 },
      { slug: "pradolongo", label: "Pradolongo", district: "Usera", approxListings: 17 },
      { slug: "san-fermin", label: "San Fermín", district: "Usera", approxListings: 5 },
      { slug: "zofio", label: "Zofio", district: "Usera", approxListings: 6 },
    ],
  },
  {
    slug: "vicalvaro",
    label: "Vicálvaro",
    district: null,
    approxListings: 36,
    subZones: [
      { slug: "ambroz", label: "Ambroz", district: "Vicálvaro", approxListings: 4 },
      { slug: "casco-historico-de-vicalvaro", label: "Casco histórico de Vicálvaro", district: "Vicálvaro", approxListings: 4 },
      { slug: "el-canaveral", label: "El Cañaveral", district: "Vicálvaro", approxListings: 18 },
      { slug: "los-berrocales", label: "Los Berrocales", district: "Vicálvaro", approxListings: 1 },
      { slug: "valdebernardo-valderribas", label: "Valdebernardo - Valderribas", district: "Vicálvaro", approxListings: 9 },
    ],
  },
  {
    slug: "villa-de-vallecas",
    label: "Villa de Vallecas",
    district: null,
    approxListings: 144,
    subZones: [
      { slug: "casco-historico-de-vallecas", label: "Casco Histórico de Vallecas", district: "Villa de Vallecas", approxListings: 5 },
      { slug: "ensanche-de-vallecas-la-gavia", label: "Ensanche de Vallecas - La Gavia", district: "Villa de Vallecas", approxListings: 137 },
      { slug: "santa-eugenia", label: "Santa Eugenia", district: "Villa de Vallecas", approxListings: 1 },
      { slug: "valdecarros", label: "Valdecarros", district: "Villa de Vallecas", approxListings: 1 },
    ],
  },
  {
    slug: "villaverde",
    label: "Villaverde",
    district: null,
    approxListings: 44,
    subZones: [
      { slug: "butarque", label: "Butarque", district: "Villaverde", approxListings: 4 },
      { slug: "los-angeles", label: "Los Ángeles", district: "Villaverde", approxListings: 8 },
      { slug: "los-rosales", label: "Los Rosales", district: "Villaverde", approxListings: 5 },
      { slug: "san-cristobal", label: "San Cristóbal", district: "Villaverde", approxListings: 6 },
      { slug: "villaverde-alto", label: "Villaverde Alto", district: "Villaverde", approxListings: 21 },
    ],
  },
];

/**
 * Zonas activas por defecto: el área prime en la que trabaja la agencia. Se usa
 * la primera vez, mientras no haya nada guardado en `app_settings`.
 */
export const FOTOCASA_DEFAULT_ZONES = [
  "barrio-de-salamanca",
  "justicia-chueca",
  "ibiza-de-madrid",
  "almagro",
  "el-viso",
];

/** Todas las zonas (distritos y barrios) indexadas por slug. */
export const FOTOCASA_ZONES_BY_SLUG: Map<string, FotocasaZone> = new Map();
for (const district of FOTOCASA_MADRID_DISTRICTS) {
  FOTOCASA_ZONES_BY_SLUG.set(district.slug, district);
  for (const sub of district.subZones) FOTOCASA_ZONES_BY_SLUG.set(sub.slug, sub);
}

/** ¿Existe la zona en el catálogo? Evita pedir URLs que darían 404. */
export function isKnownFotocasaZone(slug: string): boolean {
  return FOTOCASA_ZONES_BY_SLUG.has(slug);
}

/** Nombre legible de una zona ("Goya"), o el propio slug si no se conoce. */
export function fotocasaZoneLabel(slug: string): string {
  return FOTOCASA_ZONES_BY_SLUG.get(slug)?.label ?? slug;
}

/**
 * Quita zonas redundantes: si está seleccionado el distrito entero, sus barrios
 * sobran (la búsqueda del distrito ya los incluye) y scrapearlos sería pagar
 * dos veces el mismo proxy.
 */
export function dedupeFotocasaZones(slugs: string[]): string[] {
  const selected = new Set(slugs.filter(isKnownFotocasaZone));
  for (const district of FOTOCASA_MADRID_DISTRICTS) {
    if (!selected.has(district.slug)) continue;
    for (const sub of district.subZones) selected.delete(sub.slug);
  }
  return [...selected];
}
