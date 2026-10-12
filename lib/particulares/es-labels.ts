// ─────────────────────────────────────────────────────────────────────────────
// Normaliza a ESPAÑOL los textos de un anuncio que llegan en inglés del portal.
//
// Por qué existe: a veces Idealista sirve la ficha en inglés (según el idioma
// con que la pide el relay de scraping) y en la BD acaban mezclados textos como
// «Flat / apartment for sale in Calle X», «4 bedrooms», «Second hand/good
// condition», «1st floor exterior», «North, West», «Terrace and balcony»…
// El dueño exige el CRM 100 % en español, así que TODO texto de anuncio pasa por
// aquí antes de pintarse (lista, ficha, buscador) y, además, un backfill
// (scripts/backfill-particulares-es.mts) deja la BD ya normalizada.
//
// Cómo está hecho (guiado por los datos reales de `particulares`, 2026-10-12,
// 88.192 filas / 983.401 características):
//   1. Diccionario EXACTO con los textos ingleses más frecuentes.
//   2. Patrones con captura para lo que lleva números o nombres propios
//      («N bedrooms», «Nth floor exterior», «Built in N», «… for sale in X»…).
//   3. Claves técnicas en snake_case que mandan Fotocasa / Pisos.com
//      («household_appliances», «air_conditioner»…).
//   Lo que no se reconoce se devuelve TAL CUAL (nunca se inventa una traducción)
//   y, si el log de desarrollo está activo, se cuenta para ampliar el diccionario.
//
// Garantías (las comprueba scripts/test-particulares-es-labels.mts):
//   · Idempotente: es(es(x)) === es(x). El español pasa INTACTO.
//   · Los nombres de calles/barrios NO se traducen: solo se reescribe el
//     «envoltorio» inglés («Flat / apartment for sale in» → «Piso en venta en»).
//   · Sin dependencias ni imports: se puede usar en cliente, servidor y scripts.
//
// Única excepción deliberada a «el español pasa intacto»: dos textos basura que
// el scraper de Idealista pega a la característica (el texto del enlace de
// ayuda): «Ocupada ilegalmente Qué se considera una vivienda ocupada» y
// «Nuda propiedad Qué es la nuda propiedad» → se recortan a lo primero.
// ─────────────────────────────────────────────────────────────────────────────

type S = string | null | undefined;

// ── Utilidades ───────────────────────────────────────────────────────────────

const ORD = "ª"; // «ª» (ordinal femenino): así lo escribe Idealista en español («1ª planta»)

/** Quita espacios sobrantes y saltos de línea raros; NO toca mayúsculas. */
const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Número inglés → español: «1,200» → «1.200», «62.5» → «62,5». Lo demás, intacto. */
function esNum(n: string): string {
  if (/^\d{1,3}(,\d{3})+$/.test(n)) return n.replace(/,/g, ".");
  if (/^\d+\.\d{1,2}$/.test(n)) return n.replace(".", ",");
  return n;
}

const plural = (n: string, one: string, many: string): string => `${n} ${n === "1" ? one : many}`;

// ── Registro de cadenas inglesas desconocidas (solo desarrollo / backfill) ──

let unknownLog: Map<string, number> | null =
  typeof process !== "undefined" && process.env?.ES_LABELS_LOG_UNKNOWN === "1" ? new Map() : null;

/** Activa/desactiva el registro de textos ingleses que el diccionario no conoce. */
export function enableUnknownEnglishLog(on = true): void {
  unknownLog = on ? (unknownLog ?? new Map()) : null;
}
/** Textos ingleses sin traducción vistos desde que se activó el registro, de más a menos frecuentes. */
export function getUnknownEnglishLog(): Array<[string, number]> {
  return unknownLog ? [...unknownLog.entries()].sort((a, b) => b[1] - a[1]) : [];
}
export function resetUnknownEnglishLog(): void {
  unknownLog?.clear();
}

// ── Diccionario exacto (clave en minúsculas, sin espacios dobles) ───────────

const EXACT: Record<string, string> = {
  // Estado / tipo de promoción
  "second hand/good condition": "Segunda mano/buen estado",
  "second hand/needs renovating": "Segunda mano/para reformar",
  "second hand/to be renovated": "Segunda mano/para reformar",
  "second hand/to renovate": "Segunda mano/para reformar",
  "second hand/renovated": "Segunda mano/reformado",
  "new housing development": "Promoción de obra nueva",
  "new development": "Promoción de obra nueva",
  "new build": "Promoción de obra nueva",
  "good condition": "Buen estado",
  "needs renovating": "Para reformar",
  "to be renovated": "Para reformar",
  "renovated": "Reformado",
  // Ascensor
  "with lift": "Con ascensor",
  "with elevator": "Con ascensor",
  "no lift": "Sin ascensor",
  "without lift": "Sin ascensor",
  "without elevator": "Sin ascensor",
  // Equipamiento
  "fitted wardrobes": "Armarios empotrados",
  "air conditioning": "Aire acondicionado",
  "terrace": "Terraza",
  "balcony": "Balcón",
  "terrace and balcony": "Terraza y balcón",
  "garden": "Jardín",
  "swimming pool": "Piscina",
  "storage room": "Trastero",
  "fireplace": "Chimenea",
  "green areas": "Zonas verdes",
  "parking space included in the price": "Plaza de garaje incluida en el precio",
  "furnished and with equipped kitchen": "Amueblado y cocina equipada",
  "fully equipped kitchen and unfurnished house": "Cocina equipada y casa sin amueblar",
  "non equipped kitchen and unfurnished house": "Cocina sin equipar y casa sin amueblar",
  "non-equipped kitchen and unfurnished house": "Cocina sin equipar y casa sin amueblar",
  "furnished": "Amueblado",
  "unfurnished": "Sin amueblar",
  // Calefacción
  "individual heating": "Calefacción individual",
  "central heating": "Calefacción central",
  "no heating": "No dispone de calefacción",
  // Situación
  "rented, with tenants": "Alquilada, con inquilinos",
  "illegally occupied": "Ocupada ilegalmente",
  "illegally occupied what is considered an occupied property?": "Ocupada ilegalmente",
  "bare ownership": "Nuda propiedad",
  "bare ownership what is bare ownership?": "Nuda propiedad",
  // Accesibilidad
  "only outdoor access is adapted for people with reduced mobility": "Solo acceso exterior adaptado para personas con movilidad reducida",
  "only the interior of the property is adapted for people with reduced mobility": "Solo interior de la vivienda adaptado para personas con movilidad reducida",
  "access and property adapted for people with reduced mobility": "Acceso y vivienda adaptados para personas con movilidad reducida",
  // Tipologías (aparecen como característica suelta)
  "detached house": "Casa o chalet independiente",
  "terraced house": "Chalet adosado",
  "semi-detached house": "Chalet pareado",
  "semidetached house": "Chalet pareado",
  "house": "Casa o chalet",
  "country house": "Casa rural",
  "village house": "Casa de pueblo",
  "estate": "Finca rústica",
  "rural manor": "Caserón",
  // Certificado energético
  "energy certificate in process": "En trámite",
  "in process": "En trámite",
  "exempt": "Exento",
  "not indicated": "No indicado",
  "consumption:": "Consumo:",
  "emissions:": "Emisiones:",
  // Basura de enlace de ayuda que pega el scraper (ver cabecera: único cambio en español)
  "ocupada ilegalmente qué se considera una vivienda ocupada": "Ocupada ilegalmente",
  "nuda propiedad qué es la nuda propiedad": "Nuda propiedad",
  "qué se considera una vivienda ocupada": "Ocupada ilegalmente",
  "qué es la nuda propiedad": "Nuda propiedad",
  // Claves técnicas de Fotocasa / Pisos.com (snake_case, siempre en inglés)
  cabinets: "Armarios empotrados",
  household_appliances: "Electrodomésticos",
  air_conditioner: "Aire acondicionado",
  elevator: "Con ascensor",
  interior_elevator: "Ascensor interior",
  parquet: "Parqué",
  community_expenses_included: "Gastos de comunidad incluidos",
  ensuite_bathroom: "Baño en suite",
  guest_bathroom: "Aseo de invitados",
  laundry: "Lavadero",
  laundry_room: "Lavadero",
  video_intercom: "Videoportero",
  storage_room: "Trastero",
  yard: "Patio",
  less_than_two_months_deposit: "Fianza de menos de dos meses",
  community_zone: "Zona comunitaria",
  community_pool: "Piscina comunitaria",
  community_parking: "Garaje comunitario",
  private_garden: "Jardín privado",
  swimming_pool: "Piscina",
  parking: "Garaje",
  childrens_zone: "Zona infantil",
  sport_area: "Zona deportiva",
  armored_door: "Puerta blindada",
  porter_service: "Servicio de portería",
  kitchen_office: "Cocina office",
  not_furnished: "Sin amueblar",
  room_for_service: "Habitación de servicio",
  fitness_center: "Gimnasio",
  pets_allowed: "Admite mascotas",
  designer_furniture: "Mobiliario de diseño",
  covered_porch: "Porche cubierto",
  environmental_music: "Hilo musical",
  tennis_court: "Pista de tenis",
  fridge: "Frigorífico",
  washing_machine: "Lavadora",
  microwave: "Microondas",
  oven: "Horno",
  tv: "Televisión",
  internet: "Internet",
  alarm: "Alarma",
  cellar: "Bodega",
  jacuzzi: "Jacuzzi",
  sauna: "Sauna",
};
// Claves sueltas que existen también en español con otro uso (no se tocan en minúscula
// salvo que vengan del catálogo técnico): «parking», «internet», «sauna», «jacuzzi»,
// «alarm»… ya están en EXACT porque en los datos reales solo las manda el catálogo de
// Fotocasa. Devolver «Garaje» para «parking» es inocuo si algún anuncio lo escribe a mano.

// ── Tipologías para el título «X for sale/rent in Y» ────────────────────────

/** Tipología inglesa (minúsculas) → sustantivo español (minúsculas, salvo propios). */
const PROPERTY_TYPE: Record<string, string> = {
  "flat / apartment": "piso",
  "flat/apartment": "piso",
  flat: "piso",
  apartment: "apartamento",
  studio: "estudio",
  "studio flat": "estudio",
  penthouse: "ático",
  duplex: "dúplex",
  triplex: "tríplex",
  loft: "loft",
  "detached house": "casa o chalet independiente",
  "terraced house": "chalet adosado",
  "semi-detached house": "chalet pareado",
  "semidetached house": "chalet pareado",
  house: "casa o chalet",
  chalet: "chalet",
  villa: "villa",
  bungalow: "bungalow",
  "country house": "casa rural",
  "village house": "casa de pueblo",
  "rural manor": "caserón",
  estate: "finca rústica",
  "country estate": "finca rústica",
  "masía": "masía",
  masia: "masía",
  cortijo: "cortijo",
  plot: "terreno",
  land: "terreno",
  "building plot": "terreno",
  garage: "garaje",
  "garage space": "garaje",
  "parking space": "garaje",
  "commercial premises": "local comercial",
  "commercial property": "local comercial",
  "retail premises": "local comercial",
  shop: "local comercial",
  office: "oficina",
  building: "edificio",
  warehouse: "nave",
  "industrial warehouse": "nave",
  "storage room": "trastero",
};

const TYPE_ALT = Object.keys(PROPERTY_TYPE)
  .sort((a, b) => b.length - a.length)
  .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

// «Flat / apartment for sale in Calle X» · «Studio to rent in Chamberí» · «Penthouse for rent»
const RE_ADDRESS_TITLE = new RegExp(`^(${TYPE_ALT})\\s+(?:for|to)\\s+(sale|rent|let)(?:\\s+in\\s+(.+))?$`, "i");

const upperFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function translateAddressTitle(s: string): string | null {
  const m = RE_ADDRESS_TITLE.exec(s);
  if (!m) return null;
  const noun = PROPERTY_TYPE[m[1].toLowerCase().replace(/\s+/g, " ")];
  if (!noun) return null;
  const rest = m[3] ? ` en ${m[3].trim()}` : "";
  // Mismo patrón que usa Idealista en español: «Piso en venta en X» / «Alquiler de piso en X».
  return /^sale$/i.test(m[2]) ? `${upperFirst(noun)} en venta${rest}` : `Alquiler de ${noun}${rest}`;
}

// ── Planta ───────────────────────────────────────────────────────────────────

const POSITION: Record<string, string> = { exterior: " exterior", interior: " interior" };

function floorSuffix(raw: string | undefined): string {
  return raw ? (POSITION[raw.toLowerCase()] ?? "") : "";
}

function translateFloor(s: string): string | null {
  let m: RegExpExecArray | null;
  // «1st floor exterior» · «2nd floor» · «11th floor interior»
  if ((m = /^(\d+)(?:st|nd|rd|th) floor(?:\s+(exterior|interior))?$/i.exec(s))) return `${m[1]}${ORD} planta${floorSuffix(m[2])}`;
  // «Ground floor exterior» → «Bajo exterior» (así lo llama Idealista en español)
  if ((m = /^(?:ground floor|ground)(?:\s+(exterior|interior))?$/i.exec(s))) return `Bajo${floorSuffix(m[1])}`;
  if ((m = /^mezzanine(?:\s+(exterior|interior))?$/i.exec(s))) return `Entreplanta${floorSuffix(m[1])}`;
  if ((m = /^semi-?basement(?:\s+(exterior|interior))?$/i.exec(s))) return `Semi-sótano${floorSuffix(m[1])}`;
  if ((m = /^basement(?:\s+(exterior|interior))?$/i.exec(s))) return `Sótano${floorSuffix(m[1])}`;
  if ((m = /^top floor(?:\s+(exterior|interior))?$/i.exec(s))) return `Última planta${floorSuffix(m[1])}`;
  // «Floor -1 interior» → «Planta -1 interior»
  if ((m = /^floor\s+(-?\d+)(?:\s+(exterior|interior))?$/i.exec(s))) return `Planta ${m[1]}${floorSuffix(m[2])}`;
  return null;
}

// ── Orientación ──────────────────────────────────────────────────────────────

const COMPASS: Record<string, string> = {
  north: "norte",
  south: "sur",
  east: "este",
  west: "oeste",
  northeast: "noreste",
  "north-east": "noreste",
  northwest: "noroeste",
  "north-west": "noroeste",
  southeast: "sureste",
  "south-east": "sureste",
  southwest: "suroeste",
  "south-west": "suroeste",
};

/** «South, East» → «sur, este». null si algún término no es un punto cardinal. */
function translateCompassList(list: string): string | null {
  const parts = list.split(/\s*,\s*|\s+and\s+/i).filter(Boolean);
  if (parts.length === 0) return null;
  const out: string[] = [];
  for (const p of parts) {
    const w = COMPASS[p.trim().toLowerCase()];
    if (!w) return null;
    out.push(w);
  }
  return out.join(", ");
}

function translateOrientation(s: string, bare: boolean): string | null {
  // «Orientation South, East» (característica) → «Orientación sur, este»
  const m = /^orientation:?\s+(.+)$/i.exec(s);
  if (m) {
    const l = translateCompassList(m[1]);
    return l ? `Orientación ${l}` : null;
  }
  // Columna `orientation` en inglés: «South, East» → «Orientación sur, este»
  // (el formato que ya usa la columna en español). Solo en el contexto de orientación:
  // una característica suelta «East» no se toca.
  if (bare) {
    const l = translateCompassList(s);
    return l ? `Orientación ${l}` : null;
  }
  return null;
}

// ── Calefacción ──────────────────────────────────────────────────────────────

const FUEL: Record<string, string> = {
  "natural gas": "Gas natural",
  electric: "Eléctrica",
  electricity: "Eléctrica",
  gas: "Gas",
  "propane/butane gas": "Gas propano/butano",
  "propane gas": "Gas propano",
  "butane gas": "Gas butano",
  "fuel oil": "Gasoil",
  diesel: "Gasoil",
  "air conditioning/heat pump": "Bomba de frío/calor",
  "heat pump": "Bomba de frío/calor",
  coal: "Carbón",
  biomass: "Biomasa",
  solar: "Solar",
  geothermal: "Geotérmica",
  aerothermal: "Aerotermia",
};

function translateHeating(s: string): string | null {
  const m = /^(individual heating|central heating|no heating)(?::\s*(.+))?$/i.exec(s);
  if (!m) return null;
  const head = EXACT[m[1].toLowerCase()];
  if (!m[2]) return head ?? null;
  const fuel = FUEL[m[2].trim().toLowerCase()];
  return fuel ? `${head}: ${fuel}` : null;
}

// ── Patrones con números ─────────────────────────────────────────────────────

const AREA = "(?:m²|m2|sq\\.? ?m|sqm)";
const NUM = "(\\d+(?:[.,]\\d+)*)";

function translateNumeric(s: string): string | null {
  let m: RegExpExecArray | null;
  // «3 bedrooms» · «1 bedroom» · «No bedroom»
  if ((m = /^(\d+) bedrooms?$/i.exec(s))) return plural(m[1], "habitación", "habitaciones");
  if (/^no bedrooms?$/i.test(s)) return "Sin habitación";
  if ((m = /^(\d+) bathrooms?$/i.exec(s))) return plural(m[1], "baño", "baños");
  if (/^no bathrooms?$/i.test(s)) return "Sin baños";
  // «3 floors» → «3 plantas» (nº de plantas de un chalet)
  if ((m = /^(\d+) floors?$/i.exec(s))) return plural(m[1], "planta", "plantas");
  // «60 m² built» · «60 m² built, 50 m² floor area»
  if ((m = new RegExp(`^${NUM}\\s*${AREA}\\s+built(?:,\\s*${NUM}\\s*${AREA}\\s+(?:floor area|usable|useful|net))?$`, "i").exec(s))) {
    return m[2] ? `${esNum(m[1])} m² construidos, ${esNum(m[2])} m² útiles` : `${esNum(m[1])} m² construidos`;
  }
  if ((m = new RegExp(`^${NUM}\\s*${AREA}\\s+(?:floor area|usable|useful)$`, "i").exec(s))) return `${esNum(m[1])} m² útiles`;
  if ((m = /^built in (\d{4})$/i.exec(s))) return `Construido en ${m[1]}`;
  if ((m = new RegExp(`^(?:land )?plot of ${NUM}\\s*${AREA}$`, "i").exec(s))) return `Parcela de ${esNum(m[1])} m²`;
  // «Parking space for an additional € 15,000» · «… € 90/month»
  if ((m = /^parking space for an additional € ?(\d+(?:[.,]\d+)*)(\/month)?$/i.exec(s))) {
    return m[2] ? `Plaza de garaje por ${esNum(m[1])} €/mes adicionales` : `Plaza de garaje por ${esNum(m[1])} € adicionales`;
  }
  // Certificado energético: «123 kWh/m² year» · «45 kg CO2/m² year»
  if ((m = /^(\d+(?:[.,]\d+)?) (kWh\/m²|kg CO2?\/m²) year$/i.exec(s))) return `${esNum(m[1])} ${m[2]} año`;
  // «Consumption: 123 kWh/m² year» (con o sin salto de línea tras los dos puntos)
  if ((m = /^(consumption|emissions):\s*(.*)$/i.exec(s))) {
    const head = /^consumption$/i.test(m[1]) ? "Consumo:" : "Emisiones:";
    const tail = m[2] ? translateNumeric(m[2]) : "";
    if (tail === null) return null;
    return tail ? `${head} ${tail}` : head;
  }
  return null;
}

// ── Núcleo: traduce una cadena cualquiera ───────────────────────────────────

type Ctx = "any" | "orientation";

/**
 * Devuelve la traducción si la cadena es un texto inglés conocido; `null` si no
 * se reconoce (puede ser español o inglés desconocido: el llamador decide).
 */
function translateKnown(raw: string, ctx: Ctx = "any"): string | null {
  const s = clean(raw);
  if (!s) return null;
  const key = s.toLowerCase();

  // El punto final no cambia el sentido («…reduced mobility.» aparece así en la BD).
  const exact = EXACT[key] ?? EXACT[key.replace(/\.$/, "")];
  if (exact !== undefined) return exact;

  return (
    translateAddressTitle(s) ??
    translateNumeric(s) ??
    translateFloor(s) ??
    translateOrientation(s, ctx === "orientation") ??
    translateHeating(s)
  );
}

// Caché por cadena: las mismas ~300 características se repiten cientos de miles de veces.
const CACHE = new Map<string, string>();
const CACHE_MAX = 8000;

function translate(raw: string, ctx: Ctx = "any"): string {
  const ckey = ctx === "any" ? raw : `${ctx}\u0000${raw}`;
  const hit = CACHE.get(ckey);
  if (hit !== undefined) return hit;

  const known = translateKnown(raw, ctx);
  let out: string;
  if (known !== null) {
    out = known;
  } else {
    out = raw; // desconocido: tal cual, sin inventar
    if (unknownLog && looksEnglish(raw)) unknownLog.set(raw, (unknownLog.get(raw) ?? 0) + 1);
  }
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(ckey, out);
  return out;
}

// ── API pública (contrato fijo: NO cambiar firmas) ──────────────────────────

/** Título/dirección del anuncio: «Flat / apartment for sale in Calle X» → «Piso en venta en Calle X». */
export const esAddress = (s: S): string => (s ? translate(s) : "");
/** Una característica: «Terrace and balcony» → «Terraza y balcón». */
export const esFeature = (s: S): string => (s ? translate(s) : "");
export const esFeatures = (l: S[] | null | undefined): string[] =>
  (Array.isArray(l) ? l : []).map((x) => (typeof x === "string" ? esFeature(x) : "")).filter(Boolean);
/** Planta: «1st floor exterior» → «1ª planta exterior» (igual que escribe Idealista en español). */
export const esFloor = (s: S): string => (s ? translate(s) : "");
/** Estado: «Second hand/good condition» → «Segunda mano/buen estado». */
export const esCondition = (s: S): string => (s ? translate(s) : "");
/** Orientación: «North, West» → «Orientación norte, oeste» (mismo formato que la columna en español). */
export const esOrientation = (s: S): string => (s ? translate(s, "orientation") : "");
/** Texto libre de cualquier otro campo (certificado energético, etc.). */
export const esText = (s: S): string => (s ? translate(s) : "");

// ── Detector de inglés ──────────────────────────────────────────────────────

// Palabras que en español NO existen (o no se usan en un anuncio) y delatan inglés.
const EN_WORDS = new Set(
  (
    "the and with for sale rent let bedroom bedrooms bathroom bathrooms floor floors flat apartment penthouse house " +
    "lift heating kitchen furnished unfurnished wardrobes terrace balcony garden swimming pool storage built year " +
    "orientation condition second hand good needs renovating renovated tenants rented mobility reduced people adapted " +
    "access property equipped included price space ground basement mezzanine north south east west this that is are " +
    "has have from your you of to in on at located fully modern bright spacious large views near close all it its " +
    "new housing development occupied illegally ownership detached terraced semi village country estate manor " +
    "consumption emissions certificate process exempt additional month plot land area usable"
  ).split(" "),
);
// Palabras muy españolas (funcionales y del dominio) que descartan que sea inglés.
const ES_WORDS = new Set(
  (
    "el la los las de del y con sin en una un es por para que se al su sus lo como más muy piso planta habitaciones " +
    "habitación baño baños calle avenida plaza paseo venta alquiler ascensor terraza jardín piscina garaje trastero " +
    "cocina salón reformado exterior interior orientación calefacción construido amueblado segunda mano estado " +
    "obra nueva ático dúplex estudio chalet casa vivienda zona barrio madrid"
  ).split(" "),
);
const ES_DIACRITICS = /[áéíóúñü¿¡]/i;

/**
 * ¿Parece un texto en inglés? Primero prueba el diccionario (si lo sabe traducir,
 * es inglés seguro); si no, usa una heurística de palabras (inglesas frente a
 * españolas y tildes/«ñ»). Pensado para decidir qué filas hay que normalizar y para
 * medir la cobertura; no es un detector de idioma general.
 */
export function looksEnglish(s: S): boolean {
  if (!s || typeof s !== "string") return false;
  const text = clean(s);
  if (!text) return false;
  // Si ya es una traducción reconocible, es inglés (y ya lo sabemos traducir).
  const known = translateKnown(text, "orientation");
  if (known !== null && known !== text) return true;

  const tokens = text.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
  if (tokens.length === 0) return false;
  let en = 0;
  let es = ES_DIACRITICS.test(text) ? 2 : 0;
  for (const t of tokens) {
    if (EN_WORDS.has(t)) en++;
    if (ES_WORDS.has(t)) es++;
  }
  if (en === 0) return false;
  // Textos cortos (una característica): basta una palabra inglesa sin ninguna española.
  if (tokens.length <= 8) return es === 0 || en > es * 2;
  // Textos largos (descripciones): el inglés tiene que dominar con claridad.
  return en >= 3 && en > es * 1.5;
}

// ── Normalización de una fila completa ──────────────────────────────────────

/** Campos de texto de una fila de `particulares` que pueden llegar en inglés. */
export const ES_TEXT_COLUMNS = ["address", "floor", "condition", "orientation", "energy_consumption", "energy_emissions"] as const;

type RowLike = Record<string, unknown>;

/**
 * Qué columnas de la fila cambiarían al normalizar a español, y con qué valor.
 * `null` si la fila ya está en español (no hay nada que escribir). Lo usan el
 * backfill (UPDATE solo de lo que cambia) y `normalizeRowToSpanish`.
 */
export function diffRowToSpanish(row: RowLike): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  const addr = row.address;
  if (typeof addr === "string" && addr) {
    const t = esAddress(addr);
    if (t !== addr) patch.address = t;
  }
  const floor = row.floor;
  if (typeof floor === "string" && floor) {
    const t = esFloor(floor);
    if (t !== floor) patch.floor = t;
  }
  const cond = row.condition;
  if (typeof cond === "string" && cond) {
    const t = esCondition(cond);
    if (t !== cond) patch.condition = t;
  }
  const ori = row.orientation;
  if (typeof ori === "string" && ori) {
    const t = esOrientation(ori);
    if (t !== ori) patch.orientation = t;
  }
  for (const k of ["energy_consumption", "energy_emissions"] as const) {
    const v = row[k];
    if (typeof v === "string" && v) {
      const t = esText(v);
      if (t !== v) patch[k] = t;
    }
  }

  const feats = row.features;
  if (Array.isArray(feats)) {
    // Se conserva el orden y los elementos no-texto; solo cambia lo que traduce
    // (a diferencia de esFeatures, que además descarta vacíos para pintar).
    let changed = false;
    const out = feats.map((f) => {
      if (typeof f !== "string") return f;
      const t = esFeature(f);
      if (t !== f) changed = true;
      return t;
    });
    // Dos características inglesas distintas pueden acabar en la misma española
    // («Terrace» y «terrace»): se quitan duplicados exactos para no pintarlas dos veces.
    if (changed) patch.features = out.filter((v, i) => typeof v !== "string" || out.indexOf(v) === i);
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** Copia de la fila con address/features/floor/condition/orientation/energía en español. */
export function normalizeRowToSpanish<T extends RowLike>(row: T): T {
  const patch = diffRowToSpanish(row);
  return patch ? ({ ...row, ...patch } as T) : row;
}
