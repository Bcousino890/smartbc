// BCP ZONE EXPLORER · tests de CONTRATO DE PRODUCTO (sin red, sin credenciales).
//
// Prueban las reglas que deben cumplirse pase lo que pase con el proveedor:
// que sin credenciales no se puede encender Google, que un sitio descubierto
// en Google nunca se confunde con un POI curado por BCP, que no se fabrican
// ETAs, que se falla cerrado sin coordenadas válidas y que la analítica va
// por lista blanca.
//
// npm run test:zone

import {
  resolveMapProvider,
  isAllowedLocationEvent,
  selectEventFor,
  LOCATION_EVENTS,
} from "../lib/services/location/provider";
import {
  fromCuratedPoi,
  fromUniversity,
  fromGooglePlace,
  categoryFromGoogleTypes,
  isValidOrigin,
  PLACE_DETAIL_FIELDS,
} from "../lib/services/location/destination";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 1) El flag se auto-protege ──
console.log("Elección de proveedor:");
{
  check("sin credenciales → OSM (no hay forma de encender Google por descuido)",
    resolveMapProvider({}).provider === "osm");
  check("solo clave, sin Map ID → OSM (el estilo de marca vive en el Map ID)",
    resolveMapProvider({ apiKey: "k" }).provider === "osm");
  check("solo Map ID, sin clave → OSM",
    resolveMapProvider({ mapId: "m" }).provider === "osm");
  check("clave + Map ID → Google",
    resolveMapProvider({ apiKey: "k", mapId: "m" }).provider === "google");
  check("override 'osm' fuerza OSM aunque haya credenciales (rollback sin desplegar)",
    resolveMapProvider({ apiKey: "k", mapId: "m", override: "osm" }).provider === "osm");
  check("override desconocido NO enciende Google",
    resolveMapProvider({ apiKey: "k", mapId: "m", override: "maplibre" }).provider === "osm");
  check("cadenas vacías cuentan como ausencia",
    resolveMapProvider({ apiKey: "  ", mapId: "" }).provider === "osm");
  check("el motivo se explica siempre", resolveMapProvider({}).reason.length > 0);
}

// ── 2) BCP cura · Google ayuda a explorar: fuentes separadas ──
console.log("Fuentes de destino:");
{
  const curated = fromCuratedPoi({
    name: "Parque del Retiro", category: "parque", minutes: 14, mode: "walk",
    latitude: 40.4153, longitude: -3.6845,
  });
  check("POI curado → source bcp_curated", curated.source === "bcp_curated");
  check("POI curado conserva su ETA verificada y la marca aproximada",
    curated.eta?.minutes === 14 && curated.eta?.approximate === true);

  const uni = fromUniversity({
    name: "IE", category: "educacion", minutes: 9, mode: "drive",
    latitude: 40.4756, longitude: -3.6893, campusLabel: "IE Tower",
  });
  check("universidad → source university, categoría educacion",
    uni.source === "university" && uni.category === "educacion");
  check("la sede viaja como subtítulo", uni.subtitle === "IE Tower");

  const place = fromGooglePlace({
    id: "ChIJxyz", displayName: "Ten con Ten", formattedAddress: "Calle de Ayala 6, Madrid",
    location: { lat: 40.4271, lng: -3.6842 }, types: ["restaurant", "food"],
  });
  check("sitio de Google → source google_place", place?.source === "google_place");
  check("un sitio de Google NUNCA llega con ETA inventada", place?.eta === null);
  check("la dirección de Google se conserva", place?.address === "Calle de Ayala 6, Madrid");
  check("los tres tipos de fuente son distinguibles",
    new Set([curated.source, uni.source, place!.source]).size === 3);
  check("los ids no colisionan entre fuentes",
    new Set([curated.id, uni.id, place!.id]).size === 3);
}

// ── 3) Fallar cerrado: sin dato utilizable, no se pinta nada ──
console.log("Se falla cerrado:");
{
  check("sitio sin coordenadas → null (ni marcador ni distancia inventada)",
    fromGooglePlace({ displayName: "X", location: null }) === null);
  check("sitio con coordenadas no finitas → null",
    fromGooglePlace({ displayName: "X", location: { lat: NaN, lng: 0 } }) === null);
  check("sitio sin nombre → null",
    fromGooglePlace({ displayName: "  ", location: { lat: 40.4, lng: -3.7 } }) === null);
  check("origen sin coordenadas → inválido", !isValidOrigin(null, null));
  check("origen (0,0) → inválido (isla nula, dato basura)", !isValidOrigin(0, 0));
  check("origen fuera de rango → inválido", !isValidOrigin(91, 0) && !isValidOrigin(40, 181));
  check("origen de Madrid → válido", isValidOrigin(40.4265, -3.6866));
  // La propiedad chilena sigue siendo un origen VÁLIDO: lo que nunca puede
  // pasar es que se le asigne un barrio de Madrid, y de eso se encarga la
  // capa de barrios, no el mapa.
  check("origen de Chile → válido como punto (el guardarraíl de barrio es otro)",
    isValidOrigin(-33.2492, -70.6226));
}

// ── 4) Categorías de Google → lenguaje visual de BCP ──
console.log("Categorías:");
{
  const cases: Array<[string[], string]> = [
    [["restaurant"], "gastronomia"],
    [["cafe", "food"], "gastronomia"],
    [["subway_station"], "transporte"],
    [["park"], "parque"],
    [["museum"], "cultura"],
    [["university"], "educacion"],
    [["hospital"], "salud"],
    [["gym"], "deporte"],
    [["shopping_mall"], "compras"],
    [["locksmith"], "otro"],
    [[], "otro"],
  ];
  for (const [types, expected] of cases) {
    check(`${JSON.stringify(types)} → ${expected}`, categoryFromGoogleTypes(types) === expected);
  }
}

// ── 5) Coste: la lista de campos de Place Details es corta y consciente ──
console.log("Campos de Place Details:");
{
  check("lista blanca declarada", PLACE_DETAIL_FIELDS.length > 0);
  check("no se piden campos caros que la ficha no usa",
    !PLACE_DETAIL_FIELDS.some((f) => /photo|review|opening|rating|price/i.test(f)),
    PLACE_DETAIL_FIELDS.join(","));
  check("se pide lo que la ficha SÍ pinta",
    ["displayName", "formattedAddress", "location"].every((f) => (PLACE_DETAIL_FIELDS as readonly string[]).includes(f)));
}

// ── 6) Analítica: lista blanca, sin nombres libres ──
console.log("Analítica:");
{
  check("evento conocido pasa", isAllowedLocationEvent("map_place_select"));
  check("evento inventado NO pasa", !isAllowedLocationEvent("map_place_select_v2"));
  check("texto libre NO pasa", !isAllowedLocationEvent("<script>"));
  check("cada fuente tiene su evento",
    selectEventFor("bcp_curated") === "map_curated_poi_select" &&
    selectEventFor("university") === "map_university_select" &&
    selectEventFor("google_place") === "map_place_select");
  check("todos los eventos de la lista se validan a sí mismos",
    LOCATION_EVENTS.every((e) => isAllowedLocationEvent(e)));
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
