// BCP LUXURY MADRID · estilo de mapa propio para MapLibre.
//
// Escrito desde cero sobre el esquema OpenMapTiles que sirve OpenFreeMap, en
// vez de parchear uno ajeno: así el mapa contiene EXACTAMENTE lo que queremos
// y no hay que ir apagando capas que nunca deberían estar.
//
// Paleta aprobada — no se cambia sin decisión de producto:
//   tierra: marfil · edificios: piedra cálida · parques: salvia
//   agua: azul mineral pálido · viales principales: champán/arena
//   viales locales: hueso cálido · etiquetas: carbón y gris apagado
//
// Ni escala de grises (frío, parece un mapa desactivado) ni beige plano (los
// parques desaparecen). El mapa tiene que ser atractivo ANTES de tocarlo.
//
// El ruido se controla por densidad, no por color: los POIs solo aparecen a
// partir de cierto zoom y con un límite de rango, para que la escena respire
// pero el cliente siga pudiendo explorar. Calma curada, no mapa vacío.

export const OPENFREEMAP_TILES = "https://tiles.openfreemap.org/planet";
export const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/** Atribución obligatoria. Nunca se oculta: solo se integra con discreción. */
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · ' +
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

// Paleta v2 · "city luxury", no "desert wash". El problema de la v1 era que
// TODO caía en la misma franja de arena: el viario se fundía con el suelo, la
// masa urbana no se distinguía del vacío y los parques apenas asomaban. Aquí
// el suelo se enfría un punto y se reservan los dos extremos de contraste
// para lo que estructura una ciudad: el viario en BLANCO y la vegetación en
// verde salvia real. La calidez sigue en el suelo y en la edificación.
const C = {
  land: "#f2f0ea",
  landcoverWood: "#d9e3cc",
  park: "#cfdec2",
  parkDark: "#b9cda6",
  water: "#b6cedb",
  building: "#e3ddd1",
  buildingOutline: "#c7bda8",
  // El viario principal en blanco es lo que hace legible una ciudad: destaca
  // sobre el suelo cálido sin meter un color nuevo en la escena.
  roadMajor: "#ffffff",
  roadMajorCasing: "#d8ccb4",
  roadSecondary: "#f0ebe0",
  roadSecondaryCasing: "#ddd3c0",
  roadMinor: "#fbf9f5",
  roadMinorCasing: "#e3dbcb",
  rail: "#cec5b3",
  labelDark: "#332d24",
  labelMuted: "#645b4e",
  labelHalo: "#f7f4ee",
  boundary: "#cbbfa8",
  poiDot: "#9c7f4e",
};

const FONT = ["Noto Sans Regular"];
// OpenFreeMap solo sirve "Noto Sans Regular" (Medium da 404): pedir una
// fuente inexistente deja las etiquetas sin dibujar.
const FONT_MEDIUM = ["Noto Sans Regular"];

/** El estilo completo. Puro: se puede inspeccionar y testear sin navegador. */
export function bcpLuxuryMadridStyle(): Record<string, unknown> {
  return {
    version: 8,
    name: "BCP Luxury Madrid",
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      // La atribución se declara AQUÍ. Si se deja que MapLibre la tome del
      // TileJSON y además se pasa `customAttribution`, el pie del mapa
      // aparece repetido ("OpenMapTiles · OSM | OpenFreeMap · OpenMapTiles ·
      // OSM"), que es lo que pasaba antes.
      openmaptiles: { type: "vector", url: OPENFREEMAP_TILES, attribution: MAP_ATTRIBUTION },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": C.land } },

      // ── Superficies ──
      {
        id: "landcover-wood",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "forest", "grass"]]],
        paint: { "fill-color": C.landcoverWood, "fill-opacity": 0.65 },
      },
      {
        id: "park",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "fill-color": C.park, "fill-opacity": 0.95 },
      },
      {
        id: "park-outline",
        type: "line",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "line-color": C.parkDark, "line-width": 0.8, "line-opacity": 0.7 },
      },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": C.water },
      },
      {
        id: "waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        paint: { "line-color": C.water, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 2.4] },
      },

      // ── Edificación: presente pero callada, da textura de ciudad ──
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": C.building,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.95],
          "fill-outline-color": C.buildingOutline,
        },
      },

      // ── Viario: dos niveles, sin el rosa/amarillo del estilo estándar ──
      {
        id: "road-minor-casing",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track"]]],
        minzoom: 13,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadMinorCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.4, 18, 9],
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track"]]],
        minzoom: 13,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadMinor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.6, 18, 7],
        },
      },
      // Viario en TRES pesos, no en dos: es lo que da jerarquía urbana. El
      // secundario en gris cálido separa las travesías de las grandes vías
      // sin meter un color nuevo.
      {
        id: "road-secondary-casing",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadSecondaryCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.1, 18, 12],
        },
      },
      {
        id: "road-secondary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadSecondary,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 18, 9.5],
        },
      },
      {
        id: "road-major-casing",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadMajorCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.2, 18, 16],
        },
      },
      {
        id: "road-major",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadMajor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 18, 13],
        },
      },
      {
        id: "rail",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        minzoom: 12,
        paint: { "line-color": C.rail, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 18, 2.2] },
      },

      {
        id: "boundary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 6],
        paint: { "line-color": C.boundary, "line-width": 0.9, "line-dasharray": [3, 3] },
      },

      // ── Etiquetas: carbón cálido, nunca negro puro ──
      {
        id: "road-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 9.5, 18, 11.5],
        },
        paint: { "text-color": C.labelMuted, "text-halo-color": C.labelHalo, "text-halo-width": 1.2 },
      },
      {
        id: "water-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "water_name",
        layout: {
          "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
          "text-font": FONT,
          "text-size": 11,
        },
        paint: { "text-color": "#6d8b9b", "text-halo-color": C.labelHalo, "text-halo-width": 1.1 },
      },
      {
        id: "place-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "suburb", "neighbourhood", "quarter"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
          "text-font": FONT_MEDIUM,
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 16, 16.5],
          "text-letter-spacing": 0.12,
          "text-transform": "uppercase",
          "text-max-width": 8,
        },
        paint: { "text-color": C.labelDark, "text-halo-color": C.labelHalo, "text-halo-width": 2 },
      },

      // ── POIs: la capa que hace posible EXPLORAR. Densidad contenida —
      //    solo desde z15 y limitando el rango, para que la escena respire
      //    sin dejar al cliente sin nada que descubrir. Su id se usa en
      //    queryRenderedFeatures, así que no debe renombrarse a la ligera.
      {
        id: "poi-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "poi",
        // Tramos de `rank` según la semántica real de OpenMapTiles: rank BAJO
        // = más importante. Se replican los cortes que usa el estilo oficial
        // (comprobados contra sus propias capas) pero subidos un nivel de
        // zoom y descartando la cola rank>=20, que es la que llenaba la
        // escena de clínicas y tiendas de barrio.
        minzoom: 16,
        // Densidad PROGRESIVA (§5): a z16 solo lo verdaderamente relevante y
        // a partir de ahí se abre. `rank` bajo = más importante.
        filter: ["all",
          ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
          ["<", ["get", "rank"], ["step", ["zoom"], 10, 17, 16, 18, 20]],
          ["has", "name"],
        ],
        layout: {
          "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 16, 10.5, 18, 12],
          "text-anchor": "top",
          "text-offset": [0, 0.7],
          "text-max-width": 7,
          "text-padding": 10,
          "symbol-sort-key": ["get", "rank"],
        },
        paint: { "text-color": C.labelDark, "text-halo-color": C.labelHalo, "text-halo-width": 1.5 },
      },
      {
        id: "poi-dot",
        type: "circle",
        source: "openmaptiles",
        "source-layer": "poi",
        // Los puntos entran antes que los rótulos: insinúan que ahí hay algo
        // que pulsar sin llenar la escena de texto.
        minzoom: 15,
        filter: ["all",
          ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
          ["<", ["get", "rank"], ["step", ["zoom"], 7, 16, 14, 17, 20]],
          ["has", "name"],
        ],
        paint: {
          // El tamaño distingue lo importante de lo secundario…
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            15, ["case", ["<", ["get", "rank"], 7], 3.2, 2.3],
            18, ["case", ["<", ["get", "rank"], 7], 4.6, 3.4],
          ],
          // …y un desvío de tono discreto insinúa la categoría sin convertir
          // el mapa en un semáforo. NUNCA champán: lo descubierto en OSM no
          // puede parecer recomendado por BCP (§5).
          "circle-color": [
            "match", ["get", "class"],
            ["park", "garden", "wood", "playground", "pitch"], "#6f8a5c",
            ["railway", "bus", "airport", "ferry_terminal"], "#5e7382",
            ["hospital", "pharmacy", "doctors"], "#8a6b6b",
            C.poiDot,
          ],
          "circle-stroke-color": C.labelHalo,
          "circle-stroke-width": 1,
        },
      },
    ],
  };
}

/** Capas sobre las que se consulta al pulsar el mapa. */
export const CLICKABLE_LAYER_IDS = ["poi-dot", "poi-label"] as const;
