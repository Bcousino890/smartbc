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

const C = {
  land: "#f4efe4",
  landcoverWood: "#e2e7d6",
  park: "#dde5d0",
  parkDark: "#d2ddc2",
  water: "#cdd9de",
  building: "#e8dfd0",
  buildingOutline: "#ddd2bf",
  roadMajor: "#eadfc4",
  roadMajorCasing: "#ddceac",
  roadMinor: "#faf6ee",
  roadMinorCasing: "#e9e1d1",
  rail: "#ddd4c4",
  labelDark: "#4a4034",
  labelMuted: "#8c8172",
  labelHalo: "#f8f4ec",
  boundary: "#d8cdba",
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
      openmaptiles: { type: "vector", url: OPENFREEMAP_TILES },
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
        paint: { "fill-color": C.park, "fill-opacity": 0.9 },
      },
      {
        id: "park-outline",
        type: "line",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "line-color": C.parkDark, "line-width": 0.6, "line-opacity": 0.55 },
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
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.85],
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
      {
        id: "road-major-casing",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
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
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
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
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 9.5, 18, 12],
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
        paint: { "text-color": "#8fa3ac", "text-halo-color": C.labelHalo, "text-halo-width": 1.1 },
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
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 14],
          "text-letter-spacing": 0.08,
          "text-transform": "uppercase",
          "text-max-width": 8,
        },
        paint: { "text-color": C.labelDark, "text-halo-color": C.labelHalo, "text-halo-width": 1.6 },
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
        minzoom: 15,
        filter: ["all", ["<=", ["get", "rank"], 12], ["has", "name"]],
        layout: {
          "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 12],
          "text-anchor": "top",
          "text-offset": [0, 0.6],
          "text-max-width": 9,
          "text-padding": 6,
        },
        paint: { "text-color": C.labelMuted, "text-halo-color": C.labelHalo, "text-halo-width": 1.4 },
      },
      {
        id: "poi-dot",
        type: "circle",
        source: "openmaptiles",
        "source-layer": "poi",
        minzoom: 15,
        filter: ["all", ["<=", ["get", "rank"], 12], ["has", "name"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.2, 18, 3.4],
          "circle-color": "#b9ac96",
          "circle-stroke-color": C.labelHalo,
          "circle-stroke-width": 1,
        },
      },
    ],
  };
}

/** Capas sobre las que se consulta al pulsar el mapa. */
export const CLICKABLE_LAYER_IDS = ["poi-dot", "poi-label"] as const;
