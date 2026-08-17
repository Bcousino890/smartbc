import "server-only";

/**
 * Catálogo de zonas TAL Y COMO LAS NOMBRA FOTOCASA.
 *
 * ⚠️ GENERADO — no editar a mano. Se rehace con:
 *     npm run fotocasa:zones -- <slug> [<slug>…]
 * y para añadir una ciudad basta con pasar su slug (el de la URL del portal).
 *
 * No sirve la taxonomía canónica de `lib/madrid-zones.ts`: Fotocasa fusiona
 * barrios y les pone nombres propios, así que sus slugs NO son deducibles del
 * nombre oficial. Comprobado contra el portal:
 *
 *   "Salamanca"      → 404   el slug real es `barrio-de-salamanca`
 *   "Justicia"       → 404   el slug real es `justicia-chueca`
 *   "Ibiza"          → 404   el slug real es `ibiza-de-madrid`
 *   "Cuatro Caminos" → 404   el slug real es `cuatro-caminos-azca`
 *
 * ── La clave es el "path" ────────────────────────────────────────────────────
 * Todo se identifica por el `segments` de Fotocasa: `localidad/zona`, p.ej.
 * `madrid-capital/centro` o `pozuelo-de-alarcon/somosaguas`. Hace falta porque
 * las zonas prime NO están todas dentro de Madrid capital, y porque un slug
 * suelto ("centro") existe en varias localidades a la vez.
 *
 * `approxListings` es una foto del número de anuncios EN ALQUILER el 2026-08-17.
 * Es orientativo — sólo se usa para ordenar y dar idea del tamaño de cada zona
 * en el panel; no se toma ninguna decisión con él.
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
  /** Slug de la localidad (`madrid-capital`, `barcelona-capital`…). */
  slug: string;
  label: string;
  approxListings: number;
  /** En Madrid capital son distritos; en municipios pequeños, zonas. */
  districts: FotocasaDistrict[];
};

export const FOTOCASA_LOCATIONS: FotocasaLocation[] = [
  {
    slug: "madrid-capital",
    label: "Madrid",
    approxListings: 7051,
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
        approxListings: 1997,
        subZones: [
          { path: "madrid-capital/cortes-huertas", label: "Cortes - Huertas", approxListings: 218 },
          { path: "madrid-capital/embajadores-lavapies", label: "Embajadores - Lavapiés", approxListings: 524 },
          { path: "madrid-capital/justicia-chueca", label: "Justicia - Chueca", approxListings: 273 },
          { path: "madrid-capital/palacio", label: "Palacio", approxListings: 322 },
          { path: "madrid-capital/sol", label: "Sol", approxListings: 227 },
          { path: "madrid-capital/universidad-malasana", label: "Universidad - Malasaña", approxListings: 432 },
        ],
      },
      {
        path: "madrid-capital/chamartin",
        label: "Chamartín",
        approxListings: 511,
        subZones: [
          { path: "madrid-capital/castilla", label: "Castilla", approxListings: 68 },
          { path: "madrid-capital/ciudad-jardin", label: "Ciudad Jardín", approxListings: 66 },
          { path: "madrid-capital/el-viso", label: "El Viso", approxListings: 81 },
          { path: "madrid-capital/hispanoamerica-bernabeu", label: "Hispanoamérica - Bernabéu", approxListings: 88 },
          { path: "madrid-capital/nueva-espana", label: "Nueva España", approxListings: 117 },
          { path: "madrid-capital/prosperidad", label: "Prosperidad", approxListings: 91 },
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
        approxListings: 114,
        subZones: [
          { path: "madrid-capital/aluche", label: "Aluche", approxListings: 24 },
          { path: "madrid-capital/campamento", label: "Campamento", approxListings: 3 },
          { path: "madrid-capital/cuatro-vientos", label: "Cuatro vientos", approxListings: 1 },
          { path: "madrid-capital/las-aguilas", label: "Las Águilas", approxListings: 12 },
          { path: "madrid-capital/los-carmenes", label: "Los Cármenes", approxListings: 7 },
          { path: "madrid-capital/lucero", label: "Lucero", approxListings: 21 },
          { path: "madrid-capital/puerta-del-angel", label: "Puerta del Ángel", approxListings: 46 },
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
  {
    slug: "barcelona-capital",
    label: "Barcelona",
    approxListings: 3415,
    districts: [
      {
        path: "barcelona-capital/ciutat-vella",
        label: "Ciutat Vella",
        approxListings: 972,
        subZones: [
          { path: "barcelona-capital/barri-gotic", label: "Barri Gòtic", approxListings: 281 },
          { path: "barcelona-capital/el-raval", label: "El Raval", approxListings: 344 },
          { path: "barcelona-capital/la-barceloneta", label: "La Barceloneta", approxListings: 106 },
          { path: "barcelona-capital/sant-pere-sta-caterina-i-la-ribera", label: "Sant Pere, Sta. Caterina i la Ribera", approxListings: 241 },
        ],
      },
      {
        path: "barcelona-capital/eixample",
        label: "Eixample",
        approxListings: 1005,
        subZones: [
          { path: "barcelona-capital/dreta-de-l-eixample", label: "Dreta de l'Eixample", approxListings: 405 },
          { path: "barcelona-capital/fort-pienc", label: "Fort Pienc", approxListings: 99 },
          { path: "barcelona-capital/l-antiga-esquerra-de-l-eixample", label: "L'Antiga Esquerra de l'Eixample", approxListings: 162 },
          { path: "barcelona-capital/la-nova-esquerra-de-l-eixample", label: "La Nova Esquerra de l'Eixample", approxListings: 103 },
          { path: "barcelona-capital/sagrada-familia", label: "Sagrada Família", approxListings: 115 },
          { path: "barcelona-capital/sant-antoni", label: "Sant Antoni", approxListings: 121 },
        ],
      },
      {
        path: "barcelona-capital/gracia",
        label: "Gràcia",
        approxListings: 316,
        subZones: [
          { path: "barcelona-capital/el-camp-d-en-grassot-i-gracia-nova", label: "El Camp d'en Grassot i Gràcia Nova", approxListings: 38 },
          { path: "barcelona-capital/el-coll", label: "El Coll", approxListings: 13 },
          { path: "barcelona-capital/la-salut", label: "La Salut", approxListings: 35 },
          { path: "barcelona-capital/vallcarca-i-els-penitents", label: "Vallcarca i els Penitents", approxListings: 20 },
          { path: "barcelona-capital/vila-de-gracia", label: "Vila de Gràcia", approxListings: 210 },
        ],
      },
      {
        path: "barcelona-capital/horta-guinardo",
        label: "Horta - Guinardó",
        approxListings: 63,
        subZones: [
          { path: "barcelona-capital/can-baro", label: "Can Baró", approxListings: 10 },
          { path: "barcelona-capital/el-baix-guinardo", label: "El Baix Guinardó", approxListings: 16 },
          { path: "barcelona-capital/el-carmel", label: "El Carmel", approxListings: 12 },
          { path: "barcelona-capital/el-guinardo", label: "El Guinardó", approxListings: 10 },
          { path: "barcelona-capital/horta", label: "Horta", approxListings: 3 },
          { path: "barcelona-capital/la-clota", label: "La Clota", approxListings: 3 },
          { path: "barcelona-capital/la-font-d-en-fargues", label: "La Font d'en Fargues", approxListings: 3 },
          { path: "barcelona-capital/la-teixonera", label: "La Teixonera", approxListings: 6 },
        ],
      },
      {
        path: "barcelona-capital/les-corts",
        label: "Les Corts",
        approxListings: 96,
        subZones: [
          { path: "barcelona-capital/barri-de-les-corts", label: "Barri de les Corts", approxListings: 45 },
          { path: "barcelona-capital/la-maternitat-i-sant-ramon", label: "La Maternitat i Sant Ramon", approxListings: 16 },
          { path: "barcelona-capital/pedralbes", label: "Pedralbes", approxListings: 35 },
        ],
      },
      {
        path: "barcelona-capital/nou-barris",
        label: "Nou Barris",
        approxListings: 25,
        subZones: [
          { path: "barcelona-capital/el-turo-de-la-peira", label: "El Turó de la Peira", approxListings: 5 },
          { path: "barcelona-capital/la-guineueta", label: "La Guineueta", approxListings: 2 },
          { path: "barcelona-capital/la-prosperitat", label: "La Prosperitat", approxListings: 3 },
          { path: "barcelona-capital/les-roquetes", label: "Les Roquetes", approxListings: 2 },
          { path: "barcelona-capital/porta", label: "Porta", approxListings: 5 },
          { path: "barcelona-capital/verdum", label: "Verdum", approxListings: 3 },
          { path: "barcelona-capital/vilapicina-i-la-torre-llobeta", label: "Vilapicina i la Torre Llobeta", approxListings: 5 },
        ],
      },
      {
        path: "barcelona-capital/sant-andreu",
        label: "Sant Andreu",
        approxListings: 49,
        subZones: [
          { path: "barcelona-capital/el-bon-pastor", label: "El Bon Pastor", approxListings: 2 },
          { path: "barcelona-capital/el-congres-i-els-indians", label: "El Congrés i els Indians", approxListings: 2 },
          { path: "barcelona-capital/la-sagrera", label: "La Sagrera", approxListings: 6 },
          { path: "barcelona-capital/navas", label: "Navas", approxListings: 8 },
          { path: "barcelona-capital/sant-andreu-de-palomar", label: "Sant Andreu de Palomar", approxListings: 27 },
          { path: "barcelona-capital/trinitat-vella", label: "Trinitat Vella", approxListings: 4 },
        ],
      },
      {
        path: "barcelona-capital/sant-marti",
        label: "Sant Martí",
        approxListings: 283,
        subZones: [
          { path: "barcelona-capital/diagonal-mar-i-el-front-maritim-del-poblenou", label: "Diagonal Mar i el Front Marítim del Poblenou", approxListings: 32 },
          { path: "barcelona-capital/el-besos-i-el-maresme", label: "El Besós i el Maresme", approxListings: 58 },
          { path: "barcelona-capital/el-camp-de-l-arpa-del-clot", label: "El Camp de l'Arpa del Clot", approxListings: 19 },
          { path: "barcelona-capital/el-clot", label: "El Clot", approxListings: 21 },
          { path: "barcelona-capital/el-parc-i-la-llacuna-del-poblenou", label: "El Parc i la Llacuna del Poblenou", approxListings: 45 },
          { path: "barcelona-capital/el-poblenou", label: "El Poblenou", approxListings: 78 },
          { path: "barcelona-capital/la-verneda-i-la-pau", label: "La Verneda i la Pau", approxListings: 3 },
          { path: "barcelona-capital/la-vila-olimpica-del-poblenou", label: "La Vila Olímpica del Poblenou", approxListings: 4 },
          { path: "barcelona-capital/provencals-del-poblenou", label: "Provençals del Poblenou", approxListings: 20 },
          { path: "barcelona-capital/sant-marti-de-provencals", label: "Sant Martí de Provençals", approxListings: 2 },
        ],
      },
      {
        path: "barcelona-capital/sants-montjuic",
        label: "Sants - Montjuïc",
        approxListings: 234,
        subZones: [
          { path: "barcelona-capital/el-poble-sec-parc-de-montjuic", label: "El Poble Sec - Parc de Montjuïc", approxListings: 98 },
          { path: "barcelona-capital/hostafrancs", label: "Hostafrancs", approxListings: 34 },
          { path: "barcelona-capital/la-bordeta", label: "La Bordeta", approxListings: 8 },
          { path: "barcelona-capital/la-font-de-la-guatlla", label: "La Font de la Guatlla", approxListings: 6 },
          { path: "barcelona-capital/la-marina-del-port", label: "La Marina del Port", approxListings: 7 },
          { path: "barcelona-capital/la-marina-del-prat-vermell", label: "La Marina del Prat Vermell", approxListings: 5 },
          { path: "barcelona-capital/sants", label: "Sants", approxListings: 54 },
          { path: "barcelona-capital/sants-badal", label: "Sants-Badal", approxListings: 22 },
        ],
      },
      {
        path: "barcelona-capital/sarria-sant-gervasi",
        label: "Sarrià - Sant Gervasi",
        approxListings: 372,
        subZones: [
          { path: "barcelona-capital/el-putget-i-el-farro", label: "El Putget i el Farró", approxListings: 66 },
          { path: "barcelona-capital/les-tres-torres", label: "Les Tres Torres", approxListings: 22 },
          { path: "barcelona-capital/sant-gervasi-i-la-bonanova", label: "Sant Gervasi i la Bonanova", approxListings: 34 },
          { path: "barcelona-capital/sant-gervasi-galvany", label: "Sant Gervasi- Galvany", approxListings: 173 },
          { path: "barcelona-capital/sarria", label: "Sarrià", approxListings: 55 },
          { path: "barcelona-capital/vallvidrera-tibidabo-les-planes", label: "Vallvidrera - Tibidabo - Les Planes", approxListings: 22 },
        ],
      },
    ],
  },
  {
    slug: "valencia-capital",
    label: "Valencia",
    approxListings: 2871,
    districts: [
      {
        path: "valencia-capital/algiros",
        label: "Algirós",
        approxListings: 212,
        subZones: [
          { path: "valencia-capital/ciutat-jardi", label: "Ciutat Jardí", approxListings: 68 },
          { path: "valencia-capital/l-amistat", label: "L'Amistat", approxListings: 22 },
          { path: "valencia-capital/l-illa-perduda", label: "L'Illa Perduda", approxListings: 21 },
          { path: "valencia-capital/la-bega-baixa-plaza-xuquer", label: "La Bega Baixa - Plaza Xúquer", approxListings: 74 },
          { path: "valencia-capital/la-carrasca", label: "La Carrasca", approxListings: 27 },
        ],
      },
      {
        path: "valencia-capital/benicalap",
        label: "Benicalap",
        approxListings: 93,
        subZones: [
          { path: "valencia-capital/barrio-de-benicalap", label: "Barrio de Benicalap", approxListings: 76 },
          { path: "valencia-capital/ciutat-fallera", label: "Ciutat Fallera", approxListings: 6 },
          { path: "valencia-capital/nou-benicalap", label: "Nou Benicalap", approxListings: 11 },
        ],
      },
      {
        path: "valencia-capital/benimaclet",
        label: "Benimaclet",
        approxListings: 63,
        subZones: [
          { path: "valencia-capital/barrio-de-benimaclet", label: "Barrio de Benimaclet", approxListings: 58 },
          { path: "valencia-capital/cami-de-vera", label: "Camí de Vera", approxListings: 5 },
        ],
      },
      {
        path: "valencia-capital/camins-al-grau",
        label: "Camins al Grau",
        approxListings: 224,
        subZones: [
          { path: "valencia-capital/aiora", label: "Aiora", approxListings: 95 },
          { path: "valencia-capital/albors", label: "Albors", approxListings: 57 },
          { path: "valencia-capital/cami-fondo", label: "Camí Fondo", approxListings: 11 },
          { path: "valencia-capital/la-creu-del-grau", label: "La Creu del Grau", approxListings: 27 },
          { path: "valencia-capital/penya-roja-avda-francia", label: "Penya - Roja - Avda. Francia", approxListings: 34 },
        ],
      },
      {
        path: "valencia-capital/campanar",
        label: "Campanar",
        approxListings: 72,
        subZones: [
          { path: "valencia-capital/barrio-de-campanar", label: "Barrio de Campanar", approxListings: 18 },
          { path: "valencia-capital/el-calvari", label: "El Calvari", approxListings: 6 },
          { path: "valencia-capital/les-tendetes-avenida-burjassot", label: "Les Tendetes - Avenida Burjassot", approxListings: 16 },
          { path: "valencia-capital/nou-campanar", label: "Nou Campanar", approxListings: 4 },
          { path: "valencia-capital/sant-pau", label: "Sant Pau", approxListings: 28 },
        ],
      },
      {
        path: "valencia-capital/ciutat-vella",
        label: "Ciutat Vella",
        approxListings: 517,
        subZones: [
          { path: "valencia-capital/el-carme", label: "El Carme", approxListings: 123 },
          { path: "valencia-capital/el-mercat", label: "El Mercat", approxListings: 103 },
          { path: "valencia-capital/el-pilar", label: "El Pilar", approxListings: 75 },
          { path: "valencia-capital/la-seu", label: "La Seu", approxListings: 43 },
          { path: "valencia-capital/la-xerea", label: "La Xerea", approxListings: 62 },
          { path: "valencia-capital/sant-francesc", label: "Sant Francesc", approxListings: 111 },
        ],
      },
      {
        path: "valencia-capital/el-pla-del-real",
        label: "El Pla del Real",
        approxListings: 123,
        subZones: [
          { path: "valencia-capital/ciutat-universitaria", label: "Ciutat Universitària", approxListings: 5 },
          { path: "valencia-capital/exposicio", label: "Exposició", approxListings: 33 },
          { path: "valencia-capital/jaume-roig", label: "Jaume Roig", approxListings: 13 },
          { path: "valencia-capital/mestalla", label: "Mestalla", approxListings: 72 },
        ],
      },
      {
        path: "valencia-capital/extramurs",
        label: "Extramurs",
        approxListings: 207,
        subZones: [
          { path: "valencia-capital/arrancapins", label: "Arrancapins", approxListings: 78 },
          { path: "valencia-capital/el-botanic", label: "El Botànic", approxListings: 50 },
          { path: "valencia-capital/la-petxina", label: "La Petxina", approxListings: 37 },
          { path: "valencia-capital/la-roqueta", label: "La Roqueta", approxListings: 42 },
        ],
      },
      {
        path: "valencia-capital/jesus",
        label: "Jesús",
        approxListings: 54,
        subZones: [
          { path: "valencia-capital/cami-reial", label: "Camí Reial", approxListings: 3 },
          { path: "valencia-capital/l-hort-de-senabre", label: "L'Hort de Senabre", approxListings: 8 },
          { path: "valencia-capital/la-creu-coberta", label: "La Creu Coberta", approxListings: 5 },
          { path: "valencia-capital/la-raiosa", label: "La Raïosa", approxListings: 33 },
          { path: "valencia-capital/sant-marcelli", label: "Sant Marcel.lí", approxListings: 5 },
        ],
      },
      {
        path: "valencia-capital/l-eixample",
        label: "L'Eixample",
        approxListings: 263,
        subZones: [
          { path: "valencia-capital/el-pla-del-remei", label: "El Pla del Remei", approxListings: 43 },
          { path: "valencia-capital/gran-via", label: "Gran Via", approxListings: 57 },
          { path: "valencia-capital/russafa", label: "Russafa", approxListings: 163 },
        ],
      },
      {
        path: "valencia-capital/l-olivereta",
        label: "L'Olivereta",
        approxListings: 65,
        subZones: [
          { path: "valencia-capital/la-fontsanta", label: "La Fontsanta", approxListings: 1 },
          { path: "valencia-capital/la-llum", label: "La Llum", approxListings: 1 },
          { path: "valencia-capital/nou-moles", label: "Nou Moles", approxListings: 43 },
          { path: "valencia-capital/soternes", label: "Soternes", approxListings: 5 },
          { path: "valencia-capital/tres-forques", label: "Tres Forques", approxListings: 15 },
        ],
      },
      {
        path: "valencia-capital/la-saidia",
        label: "La Saïdia",
        approxListings: 101,
        subZones: [
          { path: "valencia-capital/marxalenes", label: "Marxalenes", approxListings: 18 },
          { path: "valencia-capital/morvedre", label: "Morvedre", approxListings: 32 },
          { path: "valencia-capital/sant-antoni", label: "Sant Antoni", approxListings: 14 },
          { path: "valencia-capital/tormos", label: "Tormos", approxListings: 6 },
          { path: "valencia-capital/trinitat", label: "Trinitat", approxListings: 31 },
        ],
      },
      {
        path: "valencia-capital/patraix",
        label: "Patraix",
        approxListings: 66,
        subZones: [
          { path: "valencia-capital/barrio-de-patraix", label: "Barrio de Patraix", approxListings: 38 },
          { path: "valencia-capital/favara", label: "Favara", approxListings: 5 },
          { path: "valencia-capital/safranar", label: "Safranar", approxListings: 6 },
          { path: "valencia-capital/sant-isidre", label: "Sant Isidre", approxListings: 3 },
          { path: "valencia-capital/vara-de-quart", label: "Vara de Quart", approxListings: 14 },
        ],
      },
      {
        path: "valencia-capital/poblats-maritims",
        label: "Poblats Marítims",
        approxListings: 456,
        subZones: [
          { path: "valencia-capital/betero", label: "Beteró", approxListings: 31 },
          { path: "valencia-capital/el-cabanyal-el-canyamelar", label: "El Cabanyal - El Canyamelar", approxListings: 259 },
          { path: "valencia-capital/el-grau", label: "El Grau", approxListings: 66 },
          { path: "valencia-capital/la-malva-rosa", label: "La Malva-rosa", approxListings: 76 },
          { path: "valencia-capital/natzaret", label: "Natzaret", approxListings: 24 },
        ],
      },
      {
        path: "valencia-capital/pobles-de-l-oest",
        label: "Pobles de l'Oest",
        approxListings: 13,
        subZones: [
          { path: "valencia-capital/beniferri", label: "Beniferri", approxListings: 2 },
          { path: "valencia-capital/benimamet", label: "Benimàmet", approxListings: 11 },
        ],
      },
      {
        path: "valencia-capital/pobles-del-nord",
        label: "Pobles del Nord",
        approxListings: 6,
        subZones: [
          { path: "valencia-capital/benifaraig", label: "Benifaraig", approxListings: 4 },
          { path: "valencia-capital/massarrojos", label: "Massarrojos", approxListings: 1 },
          { path: "valencia-capital/poble-nou", label: "Poble Nou", approxListings: 1 },
        ],
      },
      {
        path: "valencia-capital/pobles-del-sud",
        label: "Pobles del Sud",
        approxListings: 72,
        subZones: [
          { path: "valencia-capital/el-castellar-i-l-oliverar", label: "El Castellar i l'Oliverar", approxListings: 2 },
          { path: "valencia-capital/el-forn-d-alcedo", label: "El Forn d'Alcedo", approxListings: 1 },
          { path: "valencia-capital/el-palmar", label: "El Palmar", approxListings: 2 },
          { path: "valencia-capital/el-perellonet", label: "El Perellonet", approxListings: 35 },
          { path: "valencia-capital/el-saler", label: "El Saler", approxListings: 21 },
          { path: "valencia-capital/faitanar", label: "Faitanar", approxListings: 5 },
          { path: "valencia-capital/la-torre", label: "La Torre", approxListings: 1 },
          { path: "valencia-capital/pinedo", label: "Pinedo", approxListings: 5 },
        ],
      },
      {
        path: "valencia-capital/quatre-carreres",
        label: "Quatre Carreres",
        approxListings: 198,
        subZones: [
          { path: "valencia-capital/ciutat-de-les-ciencies-i-de-les-arts-justicia", label: "Ciutat de les Ciències i de les Arts - Justicia", approxListings: 33 },
          { path: "valencia-capital/en-corts-doctor-waksman", label: "En Corts - Doctor Waksman", approxListings: 54 },
          { path: "valencia-capital/fonteta-de-sant-lluis", label: "Fonteta de Sant Lluís", approxListings: 5 },
          { path: "valencia-capital/la-punta", label: "La Punta", approxListings: 11 },
          { path: "valencia-capital/malilla", label: "Malilla", approxListings: 21 },
          { path: "valencia-capital/mont-olivet", label: "Mont-Olivet", approxListings: 57 },
          { path: "valencia-capital/na-rovella-hermanos-maristas", label: "Na Rovella - Hermanos Maristas", approxListings: 17 },
        ],
      },
      {
        path: "valencia-capital/rascanya",
        label: "Rascanya",
        approxListings: 66,
        subZones: [
          { path: "valencia-capital/els-orriols", label: "Els Orriols", approxListings: 14 },
          { path: "valencia-capital/sant-llorenc-zona-alfahuir", label: "Sant Llorenç - Zona Alfahuir", approxListings: 21 },
          { path: "valencia-capital/torrefiel", label: "Torrefiel", approxListings: 31 },
        ],
      },
    ],
  },
  {
    slug: "malaga-capital",
    label: "Málaga",
    approxListings: 854,
    districts: [
      {
        path: "malaga-capital/bailen-miraflores",
        label: "Bailén - Miraflores",
        approxListings: 48,
        subZones: [
          { path: "malaga-capital/la-florida-parque-norte", label: "La Florida - Parque Norte", approxListings: 10 },
          { path: "malaga-capital/los-castillejos-la-trinidad", label: "Los Castillejos - La Trinidad", approxListings: 17 },
          { path: "malaga-capital/parque-victoria-eugenia", label: "Parque Victoria Eugenia", approxListings: 6 },
          { path: "malaga-capital/san-alberto-la-alcubilla-florisol", label: "San Alberto - La Alcubilla - Florisol", approxListings: 5 },
          { path: "malaga-capital/suarez", label: "Suárez", approxListings: 10 },
        ],
      },
      {
        path: "malaga-capital/campanillas",
        label: "Campanillas",
        approxListings: 5,
        subZones: [],
      },
      {
        path: "malaga-capital/carretera-de-cadiz",
        label: "Carretera de Cádiz",
        approxListings: 118,
        subZones: [
          { path: "malaga-capital/giron-las-delicias", label: "Girón - Las Delicias", approxListings: 13 },
          { path: "malaga-capital/la-luz-el-torcal", label: "La Luz - El Torcal", approxListings: 18 },
          { path: "malaga-capital/la-princesa", label: "La Princesa", approxListings: 3 },
          { path: "malaga-capital/los-guindos-parque-mediterraneo-santa-paula", label: "Los Guindos - Parque Mediterráneo - Santa Paula", approxListings: 9 },
          { path: "malaga-capital/martin-carpena-torre-del-rio", label: "Martín Carpena - Torre del Río", approxListings: 17 },
          { path: "malaga-capital/parque-ayala-jardin-de-la-abadia-huelin", label: "Parque Ayala - Jardín de la Abadía - Huelín", approxListings: 38 },
          { path: "malaga-capital/paseo-maritimo-oeste-pacifico", label: "Paseo Marítimo Oeste - Pacífico", approxListings: 10 },
          { path: "malaga-capital/puerta-blanca", label: "Puerta Blanca", approxListings: 10 },
        ],
      },
      {
        path: "malaga-capital/centro",
        label: "Centro",
        approxListings: 350,
        subZones: [
          { path: "malaga-capital/centro-historico", label: "Centro Histórico", approxListings: 80 },
          { path: "malaga-capital/conde-de-urena", label: "Conde de Ureña", approxListings: 4 },
          { path: "malaga-capital/cristo-de-la-epidemia", label: "Cristo de la Epidemia", approxListings: 23 },
          { path: "malaga-capital/el-ejido", label: "El Ejido", approxListings: 13 },
          { path: "malaga-capital/el-molinillo-capuchinos", label: "El Molinillo - Capuchinos", approxListings: 13 },
          { path: "malaga-capital/ensanche-centro-puerto", label: "Ensanche Centro - Puerto", approxListings: 16 },
          { path: "malaga-capital/gibralfaro", label: "Gibralfaro", approxListings: 3 },
          { path: "malaga-capital/la-goleta-san-felipe-neri", label: "La Goleta - San Felipe Neri", approxListings: 34 },
          { path: "malaga-capital/la-malagueta-monte-sancha", label: "La Malagueta - Monte Sancha", approxListings: 31 },
          { path: "malaga-capital/la-merced", label: "La Merced", approxListings: 22 },
          { path: "malaga-capital/la-trinidad", label: "La Trinidad", approxListings: 24 },
          { path: "malaga-capital/la-victoria", label: "La Victoria", approxListings: 30 },
          { path: "malaga-capital/olletas-sierra-blanquilla", label: "Olletas - Sierra Blanquilla", approxListings: 20 },
          { path: "malaga-capital/perchel-norte", label: "Perchel Norte", approxListings: 14 },
          { path: "malaga-capital/perchel-sur-plaza-de-toros-vieja", label: "Perchel Sur - Plaza de Toros Vieja", approxListings: 23 },
        ],
      },
      {
        path: "malaga-capital/churriana",
        label: "Churriana",
        approxListings: 20,
        subZones: [
          { path: "malaga-capital/churriana-el-pizarrillo-la-noria-guadalsol", label: "Churriana - El Pizarrillo - La Noria-Guadalsol", approxListings: 8 },
          { path: "malaga-capital/cortijo-de-maza-finca-monsalvez-el-olivar", label: "Cortijo de Maza - Finca Monsalvez - El Olivar", approxListings: 5 },
          { path: "malaga-capital/guadalmar", label: "Guadalmar", approxListings: 7 },
        ],
      },
      {
        path: "malaga-capital/ciudad-jardin",
        label: "Ciudad Jardín",
        approxListings: 14,
        subZones: [
          { path: "malaga-capital/alegria-de-la-huerta-jardin-de-malaga", label: "Alegría de la Huerta- Jardín de Málaga", approxListings: 6 },
          { path: "malaga-capital/barrio-de-ciudad-jardin", label: "Barrio de Ciudad Jardín", approxListings: 4 },
          { path: "malaga-capital/mangas-verdes-las-flores-parque-del-sur", label: "Mangas Verdes - Las Flores - Parque del Sur", approxListings: 4 },
        ],
      },
      {
        path: "malaga-capital/cruz-de-humilladero",
        label: "Cruz de Humilladero",
        approxListings: 110,
        subZones: [
          { path: "malaga-capital/camino-de-antequera", label: "Camino de Antequera", approxListings: 13 },
          { path: "malaga-capital/carranque-haza-cuevas", label: "Carranque - Haza Cuevas", approxListings: 35 },
          { path: "malaga-capital/distrito-zeta-recinto-ferial-cortijo-de-torres", label: "Distrito Zeta - Recinto Ferial Cortijo de Torres", approxListings: 1 },
          { path: "malaga-capital/la-union-cruz-de-humilladero-los-tilos", label: "La Unión - Cruz de Humilladero - Los Tilos", approxListings: 41 },
          { path: "malaga-capital/portada-alta-pol-crta-de-cartama", label: "Portada Alta - Pol. Crta. De Cártama", approxListings: 7 },
          { path: "malaga-capital/santa-cristina-san-rafael", label: "Santa Cristina - San Rafael", approxListings: 13 },
        ],
      },
      {
        path: "malaga-capital/este",
        label: "Este",
        approxListings: 64,
        subZones: [
          { path: "malaga-capital/cerrado-de-calderon-hacienda-paredes", label: "Cerrado de Calderón - Hacienda Paredes", approxListings: 5 },
          { path: "malaga-capital/el-candado", label: "El Candado", approxListings: 2 },
          { path: "malaga-capital/el-palo", label: "El Palo", approxListings: 14 },
          { path: "malaga-capital/jarazmin", label: "Jarazmín", approxListings: 1 },
          { path: "malaga-capital/limonar", label: "Limonar", approxListings: 13 },
          { path: "malaga-capital/mayorazgo", label: "Mayorazgo", approxListings: 1 },
          { path: "malaga-capital/miraflores-del-palo", label: "Miraflores del Palo", approxListings: 1 },
          { path: "malaga-capital/olias", label: "Olías", approxListings: 1 },
          { path: "malaga-capital/parque-clavero", label: "Parque Clavero", approxListings: 5 },
          { path: "malaga-capital/pedregalejo-morlaco", label: "Pedregalejo - Morlaco", approxListings: 18 },
          { path: "malaga-capital/pinares-de-san-anton", label: "Pinares de San Antón", approxListings: 3 },
        ],
      },
      {
        path: "malaga-capital/martiricos-la-roca",
        label: "Martiricos - La Roca",
        approxListings: 22,
        subZones: [
          { path: "malaga-capital/martiricos-la-roca-la-rosaleda", label: "Martiricos - La Roca - La Rosaleda", approxListings: 21 },
          { path: "malaga-capital/palma-palmilla", label: "Palma - Palmilla", approxListings: 1 },
        ],
      },
      {
        path: "malaga-capital/puerto-de-la-torre-atabal",
        label: "Puerto de la Torre - Atabal",
        approxListings: 18,
        subZones: [
          { path: "malaga-capital/el-atabal", label: "El Atabal", approxListings: 4 },
          { path: "malaga-capital/el-cortijuelo", label: "El Cortijuelo", approxListings: 1 },
          { path: "malaga-capital/fuente-alegre-el-chaparral-los-morales", label: "Fuente Alegre - El Chaparral - Los Morales", approxListings: 6 },
          { path: "malaga-capital/los-almendros-el-limonero-el-tomillar", label: "Los Almendros - El Limonero - El Tomillar", approxListings: 3 },
          { path: "malaga-capital/santa-isabel", label: "Santa Isabel", approxListings: 4 },
        ],
      },
      {
        path: "malaga-capital/residencial-jardin-botanico",
        label: "Residencial Jardín Botánico",
        approxListings: 1,
        subZones: [],
      },
      {
        path: "malaga-capital/teatinos-universidad",
        label: "Teatinos - Universidad",
        approxListings: 84,
        subZones: [
          { path: "malaga-capital/cortijo-alto", label: "Cortijo Alto", approxListings: 6 },
          { path: "malaga-capital/el-consul-ciudad-universitaria-el-romeral", label: "El Cónsul - Ciudad Universitaria - El Romeral", approxListings: 44 },
          { path: "malaga-capital/el-tejar-hacienda-bizcochero", label: "El Tejar - Hacienda Bizcochero", approxListings: 27 },
          { path: "malaga-capital/teatinos", label: "Teatinos", approxListings: 7 },
        ],
      },
    ],
  },
  {
    slug: "marbella",
    label: "Marbella",
    approxListings: 962,
    districts: [
      {
        path: "marbella/elviria-cabopino",
        label: "Elviria - Cabopino",
        approxListings: 96,
        subZones: [
          { path: "marbella/cabopino-artola", label: "Cabopino - Artola", approxListings: 16 },
          { path: "marbella/elviria", label: "Elviria", approxListings: 16 },
          { path: "marbella/hacienda-las-chapas", label: "Hacienda Las Chapas", approxListings: 6 },
          { path: "marbella/marbesa", label: "Marbesa", approxListings: 17 },
          { path: "marbella/real-de-zaragoza", label: "Real de Zaragoza", approxListings: 4 },
          { path: "marbella/reserva-de-marbella", label: "Reserva de Marbella", approxListings: 14 },
          { path: "marbella/romana-playa", label: "Romana Playa", approxListings: 13 },
          { path: "marbella/santa-maria", label: "Santa María", approxListings: 10 },
        ],
      },
      {
        path: "marbella/las-chapas-el-rosario",
        label: "Las Chapas - El Rosario",
        approxListings: 42,
        subZones: [
          { path: "marbella/costabella", label: "Costabella", approxListings: 9 },
          { path: "marbella/el-rosario-ricmar", label: "El Rosario - Ricmar", approxListings: 10 },
          { path: "marbella/las-chapas-alicate-playa", label: "Las Chapas - Alicate Playa", approxListings: 17 },
          { path: "marbella/santa-clara", label: "Santa Clara", approxListings: 6 },
        ],
      },
      {
        path: "marbella/marbella-centro",
        label: "Marbella Centro",
        approxListings: 112,
        subZones: [
          { path: "marbella/casco-antiguo", label: "Casco Antiguo", approxListings: 29 },
          { path: "marbella/divina-pastora", label: "Divina Pastora", approxListings: 3 },
          { path: "marbella/huerta-belon-calvario", label: "Huerta Belón - Calvario", approxListings: 4 },
          { path: "marbella/la-merced", label: "La Merced", approxListings: 1 },
          { path: "marbella/la-patera", label: "La Patera", approxListings: 2 },
          { path: "marbella/los-jardines-de-marbella-la-ermita", label: "Los Jardines de Marbella - La Ermita", approxListings: 10 },
          { path: "marbella/playa-bajadilla-puertos", label: "Playa Bajadilla - Puertos", approxListings: 29 },
          { path: "marbella/playa-de-la-fontanilla", label: "Playa de la Fontanilla", approxListings: 10 },
          { path: "marbella/ricardo-soriano", label: "Ricardo Soriano", approxListings: 19 },
          { path: "marbella/torrecilla-la-canada", label: "Torrecilla - La Cañada", approxListings: 1 },
          { path: "marbella/valdeolletas-las-cancelas-xarblanca", label: "Valdeolletas - Las Cancelas - Xarblanca", approxListings: 4 },
        ],
      },
      {
        path: "marbella/milla-de-oro",
        label: "Milla de Oro",
        approxListings: 169,
        subZones: [
          { path: "marbella/la-carolina-guadalpin", label: "La Carolina - Guadalpín", approxListings: 38 },
          { path: "marbella/las-lomas-de-rio-verde", label: "Las Lomas de Río Verde", approxListings: 20 },
          { path: "marbella/lomas-de-marbella-club", label: "Lomas de Marbella Club", approxListings: 30 },
          { path: "marbella/nagueles-alto", label: "Nagüeles Alto", approxListings: 23 },
          { path: "marbella/puente-romano", label: "Puente Romano", approxListings: 15 },
          { path: "marbella/sierra-blanca", label: "Sierra Blanca", approxListings: 43 },
        ],
      },
      {
        path: "marbella/nueva-andalucia",
        label: "Nueva Andalucía",
        approxListings: 391,
        subZones: [
          { path: "marbella/aloha", label: "Aloha", approxListings: 25 },
          { path: "marbella/la-dama-de-noche-la-alzambra", label: "La Dama de Noche - La Alzambra", approxListings: 38 },
          { path: "marbella/las-brisas", label: "Las Brisas", approxListings: 34 },
          { path: "marbella/los-naranjos", label: "Los Naranjos", approxListings: 65 },
          { path: "marbella/nueva-andalucia-centro", label: "Nueva Andalucía centro", approxListings: 64 },
          { path: "marbella/puerto-banus", label: "Puerto Banús", approxListings: 116 },
          { path: "marbella/rodeo-alto-guadaiza-la-campana", label: "Rodeo Alto - Guadaiza - La Campana", approxListings: 49 },
        ],
      },
      {
        path: "marbella/rio-real-los-monteros",
        label: "Rïo Real - Los Monteros",
        approxListings: 68,
        subZones: [
          { path: "marbella/alto-de-los-monteros", label: "Alto de los Monteros", approxListings: 12 },
          { path: "marbella/bahia-de-marbella", label: "Bahía de Marbella", approxListings: 20 },
          { path: "marbella/bello-horizonte-lindasol", label: "Bello Horizonte - Lindasol", approxListings: 6 },
          { path: "marbella/los-monteros", label: "Los Monteros", approxListings: 2 },
          { path: "marbella/rio-real", label: "Río Real", approxListings: 28 },
        ],
      },
      {
        path: "marbella/san-pedro-de-alcantara",
        label: "San Pedro de Alcántara",
        approxListings: 84,
        subZones: [
          { path: "marbella/guadalmina-alta", label: "Guadalmina Alta", approxListings: 21 },
          { path: "marbella/guadalmina-baja", label: "Guadalmina Baja", approxListings: 16 },
          { path: "marbella/nueva-alcantara", label: "Nueva Alcántara", approxListings: 27 },
          { path: "marbella/san-pedro-de-alcantara-pueblo", label: "San Pedro de Alcántara pueblo", approxListings: 20 },
        ],
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
