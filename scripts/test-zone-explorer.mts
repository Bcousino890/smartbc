// BCP ZONE EXPLORER · tests de CONTRATO DE PRODUCTO (sin red, sin navegador).
//
// Prueban las reglas que deben cumplirse pase lo que pase con el proveedor:
// que un lugar descubierto en el basemap nunca se confunde con un POI curado
// por BCP, que no se fabrican ETAs, que no todo el mapa es pulsable, que se
// falla cerrado sin dato utilizable, que el estilo es de marca y sin clave, y
// que la analítica va por lista blanca.
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
  fromOsmFeature,
  categoryFromOsmFeature,
  isValidOrigin,
  CLICKABLE_POI_CLASSES,
} from "../lib/services/location/destination";
import { bcpLuxuryMadridStyle, CLICKABLE_LAYER_IDS, MAP_ATTRIBUTION } from "../lib/services/location/bcp-map-style";
import { latLngToWorldPixel } from "../lib/geo/tile-math";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 1) Proveedor y rollback ──
console.log("Elección de proveedor:");
{
  check("por defecto → MapLibre (sin clave ni facturación)",
    resolveMapProvider({}).provider === "maplibre");
  check("override 'osm-static' fuerza el mosaico anterior (rollback sin desplegar)",
    resolveMapProvider({ override: "osm-static" }).provider === "osm-static");
  check("override desconocido NO deja el módulo sin mapa: cae al mosaico",
    resolveMapProvider({ override: "google" }).provider === "osm-static");
  check("el motivo se explica siempre", resolveMapProvider({}).reason.length > 0);
}

// ── 2) BCP cura · el basemap ayuda a EXPLORAR: fuentes separadas ──
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

  const place = fromOsmFeature({
    id: 1234567,
    properties: { class: "restaurant", name: "Ten con Ten", rank: 3 },
    lat: 40.4271, lng: -3.6842,
  });
  check("feature del basemap → source osm_discovered", place?.source === "osm_discovered");
  check("un lugar descubierto NUNCA llega con ETA inventada", place?.eta === null);
  check("se clasifica en la categoría BCP correcta", place?.category === "gastronomia");
  check("los tres tipos de fuente son distinguibles",
    new Set([curated.source, uni.source, place!.source]).size === 3);
  check("los ids no colisionan entre fuentes",
    new Set([curated.id, uni.id, place!.id]).size === 3);
}

// ── 3) Fallar cerrado: sin dato utilizable, no se pinta nada ──
console.log("Se falla cerrado:");
{
  check("feature SIN nombre → null (no se abre una ficha vacía)",
    fromOsmFeature({ properties: { class: "restaurant" }, lat: 40.4, lng: -3.7 }) === null);
  check("categoría fuera de la lista blanca → null (no todo es pulsable)",
    fromOsmFeature({ properties: { class: "fire_hydrant", name: "Boca de riego" }, lat: 40.4, lng: -3.7 }) === null);
  check("feature sin coordenadas → null",
    fromOsmFeature({ properties: { class: "cafe", name: "X" } }) === null);
  check("coordenadas no finitas → null",
    fromOsmFeature({ properties: { class: "cafe", name: "X" }, lat: NaN, lng: -3.7 }) === null);
  check("origen sin coordenadas → inválido", !isValidOrigin(null, null));
  check("origen (0,0) → inválido (isla nula, dato basura)", !isValidOrigin(0, 0));
  check("origen fuera de rango → inválido", !isValidOrigin(91, 0) && !isValidOrigin(40, 181));
  check("origen de Madrid → válido", isValidOrigin(40.4265, -3.6866));
  check("origen de Chile → válido como punto (el guardarraíl de barrio es otro)",
    isValidOrigin(-33.2492, -70.6226));
}

// ── 4) Categorías del basemap → lenguaje visual de BCP ──
console.log("Categorías del basemap:");
{
  const cases: Array<[string, string | null]> = [
    ["restaurant", "gastronomia"], ["cafe", "gastronomia"],
    ["subway", "transporte"], ["railway", "transporte"],
    ["park", "parque"], ["museum", "cultura"],
    ["university", "educacion"], ["hospital", "salud"],
    ["fitness", "deporte"], ["supermarket", "compras"],
    ["fire_hydrant", null], ["bench", null],
  ];
  for (const [cls, expected] of cases) {
    check(`${cls} → ${expected ?? "no pulsable"}`, categoryFromOsmFeature({ class: cls }) === expected);
  }
  check("subclass también resuelve cuando class no basta",
    categoryFromOsmFeature({ class: "zzz", subclass: "cafe" }) === "gastronomia");
}

// ── 5) El estilo propio: de marca, sin clave y sin vaciar el mapa ──
console.log("Estilo BCP Luxury Madrid:");
{
  const style: any = bcpLuxuryMadridStyle();
  check("estilo versión 8 válido para MapLibre", style.version === 8);
  check("usa OpenFreeMap como fuente vectorial",
    JSON.stringify(style.sources).includes("tiles.openfreemap.org"));
  check("sin clave de API en ninguna URL del estilo",
    !/[?&](key|api_?key|access_token)=/i.test(JSON.stringify(style)));
  const ids: string[] = style.layers.map((l: any) => l.id);
  check("las capas pulsables existen en el estilo",
    CLICKABLE_LAYER_IDS.every((l) => ids.includes(l)), ids.join(","));
  check("hay parques, agua y edificios (no es un mapa vacío)",
    ["park", "water", "building"].every((l) => ids.includes(l)));
  // Se comprueba el PRINCIPIO (el verde tira a verde y el agua a azul), no
  // un hex concreto: la paleta se ha revisado ya una vez y un test clavado a
  // "#dde5d0" solo obliga a editarlo sin vigilar nada.
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const paintOf = (id: string, key: string) =>
    String(style.layers.find((l: any) => l.id === id)?.paint?.[key] ?? "");
  const [pr, pg, pb] = hex(paintOf("park", "fill-color"));
  const [wr, , wb] = hex(paintOf("water", "fill-color"));
  check("NO es escala de grises: el parque tira a verde",
    pg > pr && pg > pb, paintOf("park", "fill-color"));
  check("NO es escala de grises: el agua tira a azul",
    wb > wr, paintOf("water", "fill-color"));
  // El viario principal tiene que despegarse del suelo: es lo que hace
  // legible una ciudad y lo que fallaba en la paleta "desert wash".
  const lum = (h: string) => hex(h).reduce((a, b) => a + b, 0) / 3;
  check("el viario principal contrasta con el suelo",
    lum(paintOf("road-major", "line-color")) - lum(paintOf("background", "background-color")) >= 8,
    `${paintOf("road-major", "line-color")} vs ${paintOf("background", "background-color")}`);
  check("los puntos de POI no aparecen antes de z15 (densidad contenida)",
    style.layers.filter((l: any) => l["source-layer"] === "poi").every((l: any) => l.minzoom >= 15));
  check("los RÓTULOS de POI esperan a z16: la vista de entrada no se llena de texto",
    style.layers.find((l: any) => l.id === "poi-label")?.minzoom >= 16);
  check("atribución de OpenFreeMap, OpenMapTiles y OSM presente",
    /OpenFreeMap/.test(MAP_ATTRIBUTION) && /OpenMapTiles/.test(MAP_ATTRIBUTION) && /OpenStreetMap/.test(MAP_ATTRIBUTION));
  // Convenio de zoom: MapLibre cuenta sobre teselas de 512px y nosotros sobre
  // las de 256. La equivalencia está MEDIDA en un navegador real (0.01º de
  // latitud = 612.3px en slippy z16 y en MapLibre z15); esto vigila que la
  // matemática de la que depende el overview siga dando ese número.
  const dy = (z: number) =>
    latLngToWorldPixel(40.43, -3.6883, z).y - latLngToWorldPixel(40.44, -3.6883, z).y;
  check("un nivel de slippy = doble de escala (base del offset de MapLibre)",
    Math.abs(dy(16) / dy(15) - 2) < 1e-9, String(dy(16) / dy(15)));
  check("slippy z16 mide los 612.3px que MapLibre da en z15",
    Math.abs(dy(16) - 612.28) < 0.1, dy(16).toFixed(2));

  check("la lista blanca de lo pulsable no está vacía",
    Object.keys(CLICKABLE_POI_CLASSES).length > 20);
}

// ── 6) Analítica: lista blanca, sin nombres libres ──
console.log("Analítica:");
{
  check("evento conocido pasa", isAllowedLocationEvent("map_discovered_place_select"));
  check("evento inventado NO pasa", !isAllowedLocationEvent("map_place_select"));
  check("texto libre NO pasa", !isAllowedLocationEvent("<script>"));
  check("cada fuente tiene su evento",
    selectEventFor("bcp_curated") === "map_curated_poi_select" &&
    selectEventFor("university") === "map_university_select" &&
    selectEventFor("osm_discovered") === "map_discovered_place_select");
  check("todos los eventos de la lista se validan a sí mismos",
    LOCATION_EVENTS.every((e) => isAllowedLocationEvent(e)));
}

// ── 7) MapLibre congelado en la v5 ──
console.log("Versión de MapLibre:");
{
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const v: string = req("maplibre-gl/package.json").version;
  // La v6 se distribuye solo como ESM y su web worker se construye con la URL
  // de la página bajo el bundling de Next: el mapa se monta y NO carga una
  // sola tesela. NO SUBIR A V6 sin resolver antes ese empaquetado.
  check(`v5 congelada (instalada ${v})`, v.startsWith("5."), v);
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
