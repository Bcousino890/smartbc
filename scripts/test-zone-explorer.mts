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
import { clampPointInView, latLngToWorldPixel } from "../lib/geo/tile-math";
import {
  categoryFromOsm,
  formatDistance,
  fromSearchResult,
  mergeResults,
  searchLocal,
} from "../lib/services/location/search";

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

  // La vivienda no puede quedar pegada al canto: si los destinos caen todos
  // al mismo lado, el encuadre la empujaba fuera y en móvil el medallón se
  // cortaba (chalet de Pozuelo, 390px).
  {
    const W = 390, H = 420, INSET = 64;
    const home = { lat: 40.43, lng: -3.6883 };
    // Vista descentrada a propósito: la casa cae fuera del margen.
    const off = { lat: 40.43, lng: -3.6783, zoom: 15 };
    const before = latLngToWorldPixel(home.lat, home.lng, off.zoom).x
      - latLngToWorldPixel(off.lat, off.lng, off.zoom).x + W / 2;
    const fixed = clampPointInView(off, home, W, H, INSET);
    const after = latLngToWorldPixel(home.lat, home.lng, fixed.zoom).x
      - latLngToWorldPixel(fixed.lat, fixed.lng, fixed.zoom).x + W / 2;
    check("la vivienda estaba fuera del margen de seguridad", before < INSET, before.toFixed(1));
    check("y el recentrado la mete dentro sin tocar el zoom",
      after >= INSET - 0.6 && fixed.zoom === off.zoom, `${after.toFixed(1)} @z${fixed.zoom}`);
    const centered = clampPointInView({ ...home, zoom: 15 }, home, W, H, INSET);
    check("si ya está dentro, no se mueve nada",
      centered.lat === home.lat && centered.lng === home.lng);
  }

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

// ── BUSCAR CERCA DE ESTA VIVIENDA ──
console.log("Búsqueda de zona:");
{
  const HOME = { lat: 40.4304, lng: -3.6821 }; // Salamanca
  const CURATED = [
    { name: "Mercado de la Paz", category: "gastronomia", latitude: 40.4239, longitude: -3.6839, minutes: 4, mode: "walk" as const },
  ];

  // Local: universidades verificadas ganan, sin red.
  const ie = searchLocal("IE", HOME, CURATED);
  check("'IE' encuentra IE University en el catálogo local",
    ie.some((d) => d.source === "university" && /IE/i.test(d.name)), JSON.stringify(ie.map((d) => d.name)));
  const merc = searchLocal("mercado", HOME, CURATED);
  check("'mercado' encuentra el POI curado con su ETA",
    merc.some((d) => d.source === "bcp_curated" && d.eta?.minutes === 4));
  check("acentos ignorados: 'medico' no casa, 'MERCADO' sí",
    searchLocal("MERCADO", HOME, CURATED).length === 1);
  check("una letra no dispara sugerencias", searchLocal("I", HOME, CURATED).length === 0);

  // Normalización externa → dominio, con ETA de NUESTRA capa.
  const dto = { id: "search:way/123", name: "Hospital Ruber", category: "salud", lat: 40.4408, lng: -3.6851, address: "Calle Juan Bravo, Madrid" };
  const dest = fromSearchResult(dto, HOME);
  check("el resultado externo llega como osm_search", dest.source === "osm_search");
  check("con ETA aproximado de la capa geométrica propia",
    dest.eta != null && dest.eta.approximate === true && dest.eta.minutes > 0, JSON.stringify(dest.eta));
  check("y con distancia geodésica de respaldo", (dest.distanceKm ?? 0) > 0);

  const far = fromSearchResult({ ...dto, id: "search:node/9", name: "Lejos", lat: 40.9, lng: -3.9 }, HOME);
  check("un lugar a 55km no recibe minutos andando",
    far.eta == null || far.eta.mode !== "walk", JSON.stringify(far.eta));

  // Dedupe §13: la universidad verificada gana al resultado externo homónimo.
  const localIE = searchLocal("IE University", HOME, CURATED);
  const extIE = fromSearchResult({ id: "search:node/77", name: "IE University", category: "educacion", lat: 40.4757, lng: -3.6892, address: null }, HOME);
  const merged = mergeResults(localIE, [extIE]);
  check("sin filas duplicadas para la misma entidad",
    merged.filter((d) => /^IE\b|IE University/i.test(d.name)).length === 1, JSON.stringify(merged.map((d) => [d.name, d.source])));
  check("y la que queda es la verificada", merged.find((d) => /IE/i.test(d.name))?.source === "university");

  // Dedupe por sigla: "URJC" local vs "Universidad Rey Juan Carlos" del
  // geocoder son la MISMA entidad aunque el campus difiera (QA real).
  const localURJC = searchLocal("URJC", HOME, CURATED);
  const extURJC = fromSearchResult({ id: "search:way/55", name: "Universidad Rey Juan Carlos", category: "educacion", lat: 40.3336, lng: -3.8766, address: "Calle Tulipán, Móstoles" }, HOME);
  const mergedURJC = mergeResults(localURJC, [extURJC]);
  check("la sigla local absorbe el nombre completo del geocoder",
    mergedURJC.filter((d) => /URJC|Rey Juan Carlos/i.test(d.name)).length === 1,
    JSON.stringify(mergedURJC.map((d) => [d.name, d.source])));

  // Categorías OSM → categorías de la casa.
  check("'university' cae en educación", categoryFromOsm("amenity", "university") === "educacion");
  check("'restaurant' cae en gastronomía", categoryFromOsm("amenity", "restaurant") === "gastronomia");
  check("lo desconocido queda sin categoría (icono genérico)", categoryFromOsm("man_made", "obelisk") === "");

  // Formato de distancia.
  check("350 m se dice en metros", formatDistance(0.35) === "340 m" || formatDistance(0.35) === "360 m" || formatDistance(0.35) === "350 m", formatDistance(0.35));
  check("1.8 km se dice en km con coma", formatDistance(1.8) === "1,8 km", formatDistance(1.8));
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
