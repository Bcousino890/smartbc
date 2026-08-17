import "server-only";

/**
 * Catálogo de zonas TAL Y COMO LAS NOMBRA FOTOCASA.
 *
 * No sirve la taxonomía canónica de `lib/madrid-zones.ts`: Fotocasa fusiona
 * barrios y les pone nombres propios, así que sus slugs NO son deducibles del
 * nombre oficial. Comprobado contra el portal (2026-08-17):
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
 * ── La clave es el "path" ────────────────────────────────────────────────────
 * Todo se identifica por el `segments` de Fotocasa: `localidad/zona`, p.ej.
 * `madrid-capital/centro` o `pozuelo-de-alarcon/somosaguas`. Hace falta porque
 * las zonas prime NO están todas dentro de Madrid capital: Pozuelo de Alarcón y
 * La Moraleja son localidades propias del portal, con sus propias zonas, y un
 * slug suelto ("centro") existe en varias a la vez.
 *
 * `approxListings` es una foto del número de anuncios EN ALQUILER el
 * 2026-08-17. Es orientativo — sólo se usa para ordenar y dar idea del tamaño
 * de cada zona en el panel; no se toma ninguna decisión con él.
 */

export type FotocasaZone = {
  /** `localidad/zona`, tal cual lo usa Fotocasa en la URL. */
  path: string;
  /** Nombre tal y como lo muestra Fotocasa. */
  label: string;
  approxListings: number;
};

export type FotocasaDistrict = FotocasaZone & { subZones: FotocasaZone[] };

export type FotocasaLocation = {
  /** Slug de la localidad (`madrid-capital`, `pozuelo-de-alarcon`…). */
  slug: string;
  label: string;
  approxListings: number;
  /** En Madrid capital son distritos; en Pozuelo/La Moraleja, zonas. */
  districts: FotocasaDistrict[];
};

export const FOTOCASA_LOCATIONS: FotocasaLocation[] = [
  {
    slug: "madrid-capital",
    label: "Madrid capital",
    approxListings: 7072,
    districts: [
      {
        path: "madrid-capital/arganzuela",
        label: "Arganzuela",
        approxListings: 331,
        subZones: [
          { path: "madrid-capital/acacias", label: "Acacias", approxListings: 58 },
          { path: "madrid-capital/chopera", label: "Chopera", approxListings: 28 },
          { path: "madrid-capital/delicias", label: "Delicias", approxListings: 87 },
          { path: "madrid-capital/imperial", label: "Imperial", approxListings: 48 },
          { path: "madrid-capital/legazpi", label: "Legazpi", approxListings: 17 },
          { path: "madrid-capital/palos-de-moguer", label: "Palos de Moguer", approxListings: 93 },
        ],
      },
      {
        path: "madrid-capital/barajas",
        label: "Barajas",
        approxListings: 23,
        subZones: [
          { path: "madrid-capital/aeropuerto", label: "Aeropuerto", approxListings: 1 },
          { path: "madrid-capital/alameda-de-osuna", label: "Alameda de Osuna", approxListings: 3 },
          { path: "madrid-capital/casco-historico-de-barajas", label: "Casco Histórico de Barajas", approxListings: 15 },
          { path: "madrid-capital/corralejos-campo-de-las-naciones", label: "Corralejos - Campo de las Naciones", approxListings: 2 },
          { path: "madrid-capital/timon", label: "Timón", approxListings: 2 },
        ],
      },
      {
        path: "madrid-capital/barrio-de-salamanca",
        label: "Barrio de Salamanca",
        approxListings: 1046,
        subZones: [
          { path: "madrid-capital/castellana", label: "Castellana", approxListings: 195 },
          { path: "madrid-capital/fuente-del-berro", label: "Fuente del Berro", approxListings: 83 },
          { path: "madrid-capital/goya", label: "Goya", approxListings: 248 },
          { path: "madrid-capital/guindalera", label: "Guindalera", approxListings: 163 },
          { path: "madrid-capital/lista", label: "Lista", approxListings: 139 },
          { path: "madrid-capital/recoletos", label: "Recoletos", approxListings: 218 },
        ],
      },
      {
        path: "madrid-capital/carabanchel",
        label: "Carabanchel",
        approxListings: 123,
        subZones: [
          { path: "madrid-capital/abrantes", label: "Abrantes", approxListings: 6 },
          { path: "madrid-capital/buena-vista", label: "Buena Vista", approxListings: 10 },
          { path: "madrid-capital/comillas", label: "Comillas", approxListings: 16 },
          { path: "madrid-capital/opanel", label: "Opañel", approxListings: 18 },
          { path: "madrid-capital/pau-de-carabanchel", label: "PAU de Carabanchel", approxListings: 5 },
          { path: "madrid-capital/puerta-bonita", label: "Puerta Bonita", approxListings: 15 },
          { path: "madrid-capital/san-isidro", label: "San Isidro", approxListings: 33 },
          { path: "madrid-capital/vista-alegre", label: "Vista Alegre", approxListings: 20 },
        ],
      },
      {
        path: "madrid-capital/centro",
        label: "Centro",
        approxListings: 2001,
        subZones: [
          { path: "madrid-capital/cortes-huertas", label: "Cortes - Huertas", approxListings: 218 },
          { path: "madrid-capital/embajadores-lavapies", label: "Embajadores - Lavapiés", approxListings: 525 },
          { path: "madrid-capital/justicia-chueca", label: "Justicia - Chueca", approxListings: 274 },
          { path: "madrid-capital/palacio", label: "Palacio", approxListings: 323 },
          { path: "madrid-capital/sol", label: "Sol", approxListings: 227 },
          { path: "madrid-capital/universidad-malasana", label: "Universidad - Malasaña", approxListings: 433 },
        ],
      },
      {
        path: "madrid-capital/chamartin",
        label: "Chamartín",
        approxListings: 509,
        subZones: [
          { path: "madrid-capital/castilla", label: "Castilla", approxListings: 68 },
          { path: "madrid-capital/ciudad-jardin", label: "Ciudad Jardín", approxListings: 66 },
          { path: "madrid-capital/el-viso", label: "El Viso", approxListings: 81 },
          { path: "madrid-capital/hispanoamerica-bernabeu", label: "Hispanoamérica - Bernabéu", approxListings: 87 },
          { path: "madrid-capital/nueva-espana", label: "Nueva España", approxListings: 117 },
          { path: "madrid-capital/prosperidad", label: "Prosperidad", approxListings: 90 },
        ],
      },
      {
        path: "madrid-capital/chamberi",
        label: "Chamberí",
        approxListings: 734,
        subZones: [
          { path: "madrid-capital/almagro", label: "Almagro", approxListings: 162 },
          { path: "madrid-capital/arapiles", label: "Arapiles", approxListings: 90 },
          { path: "madrid-capital/gaztambide", label: "Gaztambide", approxListings: 86 },
          { path: "madrid-capital/rios-rosas-nuevos-ministerios", label: "Ríos Rosas - Nuevos Ministerios", approxListings: 164 },
          { path: "madrid-capital/trafalgar", label: "Trafalgar", approxListings: 188 },
          { path: "madrid-capital/vallehermoso", label: "Vallehermoso", approxListings: 44 },
        ],
      },
      {
        path: "madrid-capital/ciudad-lineal",
        label: "Ciudad Lineal",
        approxListings: 200,
        subZones: [
          { path: "madrid-capital/atalaya", label: "Atalaya", approxListings: 2 },
          { path: "madrid-capital/colina", label: "Colina", approxListings: 11 },
          { path: "madrid-capital/concepcion", label: "Concepción", approxListings: 24 },
          { path: "madrid-capital/costillares", label: "Costillares", approxListings: 11 },
          { path: "madrid-capital/pueblo-nuevo", label: "Pueblo Nuevo", approxListings: 46 },
          { path: "madrid-capital/quintana", label: "Quintana", approxListings: 21 },
          { path: "madrid-capital/san-juan-bautista", label: "San Juan Bautista", approxListings: 24 },
          { path: "madrid-capital/san-pascual", label: "San Pascual", approxListings: 20 },
          { path: "madrid-capital/ventas", label: "Ventas", approxListings: 41 },
        ],
      },
      {
        path: "madrid-capital/fuencarral-el-pardo",
        label: "Fuencarral - El Pardo",
        approxListings: 143,
        subZones: [
          { path: "madrid-capital/arroyo-del-fresno", label: "Arroyo del Fresno", approxListings: 4 },
          { path: "madrid-capital/el-pardo", label: "El Pardo", approxListings: 3 },
          { path: "madrid-capital/fuentelarreina", label: "Fuentelarreina", approxListings: 5 },
          { path: "madrid-capital/la-paz", label: "La Paz", approxListings: 19 },
          { path: "madrid-capital/las-tablas", label: "Las Tablas", approxListings: 17 },
          { path: "madrid-capital/mirasierra", label: "Mirasierra", approxListings: 5 },
          { path: "madrid-capital/montecarmelo", label: "Montecarmelo", approxListings: 7 },
          { path: "madrid-capital/penagrande", label: "Peñagrande", approxListings: 22 },
          { path: "madrid-capital/pilar", label: "Pilar", approxListings: 27 },
          { path: "madrid-capital/tres-olivos-valverde", label: "Tres Olivos - Valverde", approxListings: 34 },
        ],
      },
      {
        path: "madrid-capital/hortaleza",
        label: "Hortaleza",
        approxListings: 165,
        subZones: [
          { path: "madrid-capital/apostol-santiago", label: "Apóstol Santiago", approxListings: 6 },
          { path: "madrid-capital/canillas", label: "Canillas", approxListings: 16 },
          { path: "madrid-capital/conde-orgaz-piovera", label: "Conde Orgaz - Piovera", approxListings: 16 },
          { path: "madrid-capital/palomas", label: "Palomas", approxListings: 12 },
          { path: "madrid-capital/pinar-del-rey", label: "Pinar del Rey", approxListings: 47 },
          { path: "madrid-capital/sanchinarro", label: "Sanchinarro", approxListings: 19 },
          { path: "madrid-capital/valdebebas-valdefuentes", label: "Valdebebas - Valdefuentes", approxListings: 23 },
          { path: "madrid-capital/virgen-del-cortijo-manoteras", label: "Virgen del Cortijo - Manoteras", approxListings: 26 },
        ],
      },
      {
        path: "madrid-capital/latina",
        label: "Latina",
        approxListings: 115,
        subZones: [
          { path: "madrid-capital/aluche", label: "Aluche", approxListings: 24 },
          { path: "madrid-capital/campamento", label: "Campamento", approxListings: 3 },
          { path: "madrid-capital/cuatro-vientos", label: "Cuatro vientos", approxListings: 1 },
          { path: "madrid-capital/las-aguilas", label: "Las Águilas", approxListings: 12 },
          { path: "madrid-capital/los-carmenes", label: "Los Cármenes", approxListings: 7 },
          { path: "madrid-capital/lucero", label: "Lucero", approxListings: 21 },
          { path: "madrid-capital/puerta-del-angel", label: "Puerta del Ángel", approxListings: 47 },
        ],
      },
      {
        path: "madrid-capital/moncloa-aravaca",
        label: "Moncloa - Aravaca",
        approxListings: 287,
        subZones: [
          { path: "madrid-capital/aravaca", label: "Aravaca", approxListings: 32 },
          { path: "madrid-capital/arguelles", label: "Argüelles", approxListings: 134 },
          { path: "madrid-capital/casa-de-campo", label: "Casa de Campo", approxListings: 19 },
          { path: "madrid-capital/ciudad-universitaria", label: "Ciudad Universitaria", approxListings: 64 },
          { path: "madrid-capital/la-florida-el-plantio", label: "La Florida -  El  Plantío", approxListings: 10 },
          { path: "madrid-capital/valdemarin", label: "Valdemarín", approxListings: 8 },
          { path: "madrid-capital/valdezarza", label: "Valdezarza", approxListings: 20 },
        ],
      },
      {
        path: "madrid-capital/moratalaz",
        label: "Moratalaz",
        approxListings: 15,
        subZones: [
          { path: "madrid-capital/marroquina", label: "Marroquina", approxListings: 8 },
          { path: "madrid-capital/media-legua", label: "Media Legua", approxListings: 3 },
          { path: "madrid-capital/pavones", label: "Pavones", approxListings: 2 },
          { path: "madrid-capital/vinateros", label: "Vinateros", approxListings: 2 },
        ],
      },
      {
        path: "madrid-capital/puente-de-vallecas",
        label: "Puente de Vallecas",
        approxListings: 96,
        subZones: [
          { path: "madrid-capital/entrevias", label: "Entrevías", approxListings: 12 },
          { path: "madrid-capital/numancia", label: "Numancia", approxListings: 24 },
          { path: "madrid-capital/palomeras-bajas", label: "Palomeras Bajas", approxListings: 6 },
          { path: "madrid-capital/palomeras-sureste", label: "Palomeras Sureste", approxListings: 4 },
          { path: "madrid-capital/portazgo", label: "Portazgo", approxListings: 6 },
          { path: "madrid-capital/san-diego", label: "San Diego", approxListings: 44 },
        ],
      },
      {
        path: "madrid-capital/retiro",
        label: "Retiro",
        approxListings: 331,
        subZones: [
          { path: "madrid-capital/adelfas", label: "Adelfas", approxListings: 31 },
          { path: "madrid-capital/estrella", label: "Estrella", approxListings: 21 },
          { path: "madrid-capital/ibiza-de-madrid", label: "Ibiza de Madrid", approxListings: 117 },
          { path: "madrid-capital/jeronimos", label: "Jerónimos", approxListings: 66 },
          { path: "madrid-capital/nino-jesus", label: "Niño Jesús", approxListings: 32 },
          { path: "madrid-capital/pacifico", label: "Pacífico", approxListings: 64 },
        ],
      },
      {
        path: "madrid-capital/san-blas",
        label: "San Blas",
        approxListings: 79,
        subZones: [
          { path: "madrid-capital/amposta", label: "Amposta", approxListings: 1 },
          { path: "madrid-capital/arcos", label: "Arcos", approxListings: 2 },
          { path: "madrid-capital/canillejas", label: "Canillejas", approxListings: 7 },
          { path: "madrid-capital/hellin", label: "Hellín", approxListings: 1 },
          { path: "madrid-capital/rejas", label: "Rejas", approxListings: 26 },
          { path: "madrid-capital/rosas-musas", label: "Rosas - Musas", approxListings: 3 },
          { path: "madrid-capital/salvador", label: "Salvador", approxListings: 8 },
          { path: "madrid-capital/simancas", label: "Simancas", approxListings: 31 },
        ],
      },
      {
        path: "madrid-capital/tetuan",
        label: "Tetuán",
        approxListings: 556,
        subZones: [
          { path: "madrid-capital/almenara-ventilla", label: "Almenara -Ventilla", approxListings: 90 },
          { path: "madrid-capital/bellas-vistas", label: "Bellas Vistas", approxListings: 60 },
          { path: "madrid-capital/berruguete", label: "Berruguete", approxListings: 64 },
          { path: "madrid-capital/castillejos-cuzco", label: "Castillejos - Cuzco", approxListings: 78 },
          { path: "madrid-capital/cuatro-caminos-azca", label: "Cuatro Caminos - Azca", approxListings: 170 },
          { path: "madrid-capital/valdeacederas", label: "Valdeacederas", approxListings: 94 },
        ],
      },
      {
        path: "madrid-capital/usera",
        label: "Usera",
        approxListings: 94,
        subZones: [
          { path: "madrid-capital/almendrales", label: "Almendrales", approxListings: 33 },
          { path: "madrid-capital/moscardo", label: "Moscardó", approxListings: 27 },
          { path: "madrid-capital/orcasitas", label: "Orcasitas", approxListings: 3 },
          { path: "madrid-capital/orcasur-12-de-octubre", label: "Orcasur - 12 de Octubre", approxListings: 3 },
          { path: "madrid-capital/pradolongo", label: "Pradolongo", approxListings: 17 },
          { path: "madrid-capital/san-fermin", label: "San Fermín", approxListings: 5 },
          { path: "madrid-capital/zofio", label: "Zofio", approxListings: 6 },
        ],
      },
      {
        path: "madrid-capital/vicalvaro",
        label: "Vicálvaro",
        approxListings: 36,
        subZones: [
          { path: "madrid-capital/ambroz", label: "Ambroz", approxListings: 4 },
          { path: "madrid-capital/casco-historico-de-vicalvaro", label: "Casco histórico de Vicálvaro", approxListings: 4 },
          { path: "madrid-capital/el-canaveral", label: "El Cañaveral", approxListings: 18 },
          { path: "madrid-capital/los-berrocales", label: "Los Berrocales", approxListings: 1 },
          { path: "madrid-capital/valdebernardo-valderribas", label: "Valdebernardo - Valderribas", approxListings: 9 },
        ],
      },
      {
        path: "madrid-capital/villa-de-vallecas",
        label: "Villa de Vallecas",
        approxListings: 144,
        subZones: [
          { path: "madrid-capital/casco-historico-de-vallecas", label: "Casco Histórico de Vallecas", approxListings: 5 },
          { path: "madrid-capital/ensanche-de-vallecas-la-gavia", label: "Ensanche de Vallecas - La Gavia", approxListings: 137 },
          { path: "madrid-capital/santa-eugenia", label: "Santa Eugenia", approxListings: 1 },
          { path: "madrid-capital/valdecarros", label: "Valdecarros", approxListings: 1 },
        ],
      },
      {
        path: "madrid-capital/villaverde",
        label: "Villaverde",
        approxListings: 44,
        subZones: [
          { path: "madrid-capital/butarque", label: "Butarque", approxListings: 4 },
          { path: "madrid-capital/los-angeles", label: "Los Ángeles", approxListings: 8 },
          { path: "madrid-capital/los-rosales", label: "Los Rosales", approxListings: 5 },
          { path: "madrid-capital/san-cristobal", label: "San Cristóbal", approxListings: 6 },
          { path: "madrid-capital/villaverde-alto", label: "Villaverde Alto", approxListings: 21 },
        ],
      },
    ],
  },
  {
    slug: "pozuelo-de-alarcon",
    label: "Pozuelo de Alarcón",
    approxListings: 69,
    districts: [
      {
        path: "pozuelo-de-alarcon/avenida-europa",
        label: "Avenida Europa",
        approxListings: 16,
        subZones: [],
      },
      {
        path: "pozuelo-de-alarcon/estacion",
        label: "Estación",
        approxListings: 5,
        subZones: [],
      },
      {
        path: "pozuelo-de-alarcon/norte",
        label: "Norte",
        approxListings: 6,
        subZones: [],
      },
      {
        path: "pozuelo-de-alarcon/prado-de-somosaguas-la-finca",
        label: "Prado de Somosaguas - La Finca",
        approxListings: 14,
        subZones: [
          { path: "pozuelo-de-alarcon/la-finca", label: "La Finca", approxListings: 4 },
          { path: "pozuelo-de-alarcon/prado-de-somoaguas", label: "Prado de Somoaguas", approxListings: 10 },
        ],
      },
      {
        path: "pozuelo-de-alarcon/pueblo",
        label: "Pueblo",
        approxListings: 8,
        subZones: [],
      },
      {
        path: "pozuelo-de-alarcon/somosaguas",
        label: "Somosaguas",
        approxListings: 7,
        subZones: [],
      },
      {
        path: "pozuelo-de-alarcon/urbanizaciones",
        label: "Urbanizaciones",
        approxListings: 13,
        subZones: [
          { path: "pozuelo-de-alarcon/la-cabana", label: "La Cabaña", approxListings: 6 },
          { path: "pozuelo-de-alarcon/montealina", label: "Montealina", approxListings: 3 },
          { path: "pozuelo-de-alarcon/monteclaro", label: "Monteclaro", approxListings: 4 },
        ],
      },
    ],
  },
  {
    slug: "la-moraleja",
    label: "La Moraleja",
    approxListings: 42,
    districts: [
      {
        path: "la-moraleja/arroyo-de-la-vega",
        label: "Arroyo de la Vega",
        approxListings: 7,
        subZones: [],
      },
      {
        path: "la-moraleja/el-soto-de-la-moraleja",
        label: "El Soto de la Moraleja",
        approxListings: 9,
        subZones: [],
      },
      {
        path: "la-moraleja/encinar-de-los-reyes",
        label: "Encinar de los Reyes",
        approxListings: 7,
        subZones: [],
      },
      {
        path: "la-moraleja/urbanizacion-la-moraleja",
        label: "Urbanización La Moraleja",
        approxListings: 19,
        subZones: [],
      },
    ],
  },
];

/**
 * Zonas activas por defecto: el área prime en la que trabaja la agencia. Se usa
 * la primera vez, mientras no haya nada guardado en `app_settings`.
 */
export const FOTOCASA_DEFAULT_ZONES = [
  "madrid-capital/barrio-de-salamanca",
  "madrid-capital/centro",
  "madrid-capital/chamberi",
  "madrid-capital/ibiza-de-madrid",
  "madrid-capital/el-viso",
  "pozuelo-de-alarcon/todas-las-zonas",
  "la-moraleja/todas-las-zonas",
];

/** Path que representa una localidad ENTERA. */
export function wholeLocationPath(locationSlug: string): string {
  return `${locationSlug}/todas-las-zonas`;
}

/** Parte un path en localidad y zona. */
export function splitZonePath(path: string): { location: string; zone: string } {
  const i = path.indexOf("/");
  if (i === -1) return { location: "madrid-capital", zone: path };
  return { location: path.slice(0, i), zone: path.slice(i + 1) };
}

/**
 * Acepta los paths guardados antes de que existieran las localidades, cuando
 * sólo se scrapeaba Madrid capital y se guardaba el slug suelto ("centro").
 */
export function normalizeZonePath(raw: string): string {
  return raw.includes("/") ? raw : `madrid-capital/${raw}`;
}

const ZONES_BY_PATH = new Map<string, FotocasaZone>();
for (const location of FOTOCASA_LOCATIONS) {
  ZONES_BY_PATH.set(wholeLocationPath(location.slug), {
    path: wholeLocationPath(location.slug),
    label: location.label,
    approxListings: location.approxListings,
  });
  for (const district of location.districts) {
    ZONES_BY_PATH.set(district.path, district);
    for (const sub of district.subZones) ZONES_BY_PATH.set(sub.path, sub);
  }
}

/** ¿Existe la zona en el catálogo? Evita pedir URLs que darían 404. */
export function isKnownFotocasaZone(path: string): boolean {
  return ZONES_BY_PATH.has(normalizeZonePath(path));
}

/** Nombre legible ("Goya"), o el propio path si no se conoce. */
export function fotocasaZoneLabel(path: string): string {
  return ZONES_BY_PATH.get(normalizeZonePath(path))?.label ?? path;
}

/**
 * Quita zonas redundantes: si está seleccionada la localidad entera sobran sus
 * distritos, y si está el distrito sobran sus barrios (la búsqueda del padre ya
 * los incluye y recorrerlos aparte sería pagar dos veces el mismo proxy).
 */
export function dedupeFotocasaZones(paths: string[]): string[] {
  const selected = new Set(paths.map(normalizeZonePath).filter(isKnownFotocasaZone));
  for (const location of FOTOCASA_LOCATIONS) {
    const whole = wholeLocationPath(location.slug);
    for (const district of location.districts) {
      if (selected.has(whole)) selected.delete(district.path);
      if (selected.has(whole) || selected.has(district.path)) {
        for (const sub of district.subZones) selected.delete(sub.path);
      }
    }
  }
  return [...selected];
}
