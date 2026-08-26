// SmartLink 2.0 · catálogo curado de POIs por barrio — SIN coordenadas.
//
// Deliberadamente NO lleva lat/lng escritas a mano: las resuelve
// scripts/geocode-neighborhood-pois.mjs contra Nominatim (OpenStreetMap) y
// las valida por radio. Un minuto mal en el SmartLink es un defecto factual,
// así que ninguna coordenada entra en la BD sin pasar por ese filtro.
//
// `query` es lo que se le manda a Nominatim; `name` es lo que ve el cliente.

/** Radio máximo POI↔centro del barrio. Fuera de esto se descarta el POI. */
export const MAX_KM_DEFAULT = 3.2;

export const NEIGHBORHOODS = [
  // ── Distrito Salamanca ────────────────────────────────────────────────
  {
    key: "castellana",
    display: "Castellana",
    district: "Salamanca",
    municipality: "Madrid",
    aliases: [],
    // Centro aproximado del barrio, sólo para validar los POIs.
    center: { lat: 40.4372, lng: -3.6879 },
    maxKm: 3.0,
    pois: [
      ["Museo Lázaro Galdiano", "cultura", "Museo Lázaro Galdiano, Madrid", 10, ["walk"]],
      ["Mercado de la Paz", "gastronomia", "Mercado de la Paz, Calle de Ayala, Madrid", 20, ["walk"]],
      ["Calle Serrano", "compras", "Calle de Serrano, Madrid", 30, ["walk"]],
      ["Fundación Juan March", "cultura", "Fundación Juan March, Madrid", 40, ["walk"]],
      ["Metro Gregorio Marañón", "transporte", "station:Gregorio Marañón", 50, ["walk"]],
      ["Parque del Retiro", "parque", "Parque del Retiro, Madrid", 60, ["walk", "drive"]],
    ],
  },
  {
    key: "lista",
    display: "Lista",
    district: "Salamanca",
    municipality: "Madrid",
    aliases: ["lista-barrio-de-salamanca"],
    center: { lat: 40.4324, lng: -3.6797 },
    maxKm: 3.0,
    pois: [
      ["Metro Lista", "transporte", "station:Lista", 10, ["walk"]],
      ["Mercado de la Paz", "gastronomia", "Mercado de la Paz, Calle de Ayala, Madrid", 20, ["walk"]],
      ["Calle Serrano", "compras", "Calle de Serrano, Madrid", 30, ["walk"]],
      ["Museo Lázaro Galdiano", "cultura", "Museo Lázaro Galdiano, Madrid", 40, ["walk"]],
      ["Colegio Nuestra Señora del Pilar", "educacion", "Colegio Nuestra Señora del Pilar, Madrid", 50, ["walk"]],
      ["Parque del Retiro", "parque", "Parque del Retiro, Madrid", 60, ["walk", "drive"]],
    ],
  },
  {
    key: "goya",
    display: "Goya",
    district: "Salamanca",
    municipality: "Madrid",
    aliases: [],
    center: { lat: 40.4255, lng: -3.6766 },
    maxKm: 3.0,
    pois: [
      ["Parque del Retiro", "parque", "Parque del Retiro, Madrid", 10, ["walk"]],
      ["Metro Goya", "transporte", "station:Goya", 20, ["walk"]],
      ["Movistar Arena", "deporte", "Movistar Arena, Madrid", 30, ["walk"]],
      ["El Corte Inglés de Goya", "compras", "El Corte Inglés, Calle de Goya, Madrid", 40, ["walk"]],
      ["Mercado de la Paz", "gastronomia", "Mercado de la Paz, Calle de Ayala, Madrid", 50, ["walk"]],
      ["Fábrica Nacional de Moneda y Timbre", "cultura", "Fábrica Nacional de Moneda y Timbre, Madrid", 60, ["walk"]],
    ],
  },
  {
    key: "fuente-del-berro",
    display: "Fuente del Berro",
    district: "Salamanca",
    municipality: "Madrid",
    aliases: ["fuente-del-berro-barrio-de-salamanca"],
    center: { lat: 40.4257, lng: -3.6663 },
    maxKm: 3.0,
    pois: [
      ["Parque de la Fuente del Berro", "parque", "Parque de la Quinta de la Fuente del Berro, Madrid", 10, ["walk"]],
      ["Metro O'Donnell", "transporte", "station:O'Donnell", 20, ["walk"]],
      ["Plaza de Toros de Las Ventas", "cultura", "Plaza de toros de Las Ventas, Madrid", 30, ["walk"]],
      ["Movistar Arena", "deporte", "Movistar Arena, Madrid", 40, ["walk"]],
      ["Parque del Retiro", "parque", "Parque del Retiro, Madrid", 50, ["walk", "drive"]],
    ],
  },
  {
    key: "guindalera",
    display: "Guindalera",
    district: "Salamanca",
    municipality: "Madrid",
    aliases: [],
    center: { lat: 40.4380, lng: -3.6688 },
    maxKm: 3.0,
    pois: [
      ["Plaza de Toros de Las Ventas", "cultura", "Plaza de toros de Las Ventas, Madrid", 10, ["walk"]],
      ["Metro Cartagena", "transporte", "station:Cartagena", 20, ["walk"]],
      ["Parque de la Fuente del Berro", "parque", "Parque de la Quinta de la Fuente del Berro, Madrid", 30, ["walk"]],
      ["Metro Diego de León", "transporte", "station:Diego de León", 40, ["walk"]],
      ["Hospital Universitario Gregorio Marañón", "salud", "Hospital General Universitario Gregorio Marañón, Madrid", 50, ["walk", "drive"]],
    ],
  },

  // ── Distrito Chamartín ────────────────────────────────────────────────
  {
    key: "el-viso",
    display: "El Viso",
    district: "Chamartín",
    municipality: "Madrid",
    aliases: ["viso"],
    center: { lat: 40.4442, lng: -3.6845 },
    maxKm: 3.0,
    pois: [
      ["Metro República Argentina", "transporte", "station:República Argentina", 10, ["walk"]],
      ["Auditorio Nacional de Música", "cultura", "Auditorio Nacional de Música, Madrid", 20, ["walk"]],
      ["Museo Lázaro Galdiano", "cultura", "Museo Lázaro Galdiano, Madrid", 30, ["walk"]],
      ["Mercado de Chamartín", "gastronomia", "Mercado de Chamartín", 40, ["walk"]],
      ["Estadio Santiago Bernabéu", "deporte", "Estadio Santiago Bernabéu, Madrid", 50, ["walk"]],
      ["Parque de Berlín", "parque", "Parque de Berlín, Madrid", 60, ["walk", "drive"]],
    ],
  },
  {
    key: "hispanoamerica",
    display: "Hispanoamérica",
    district: "Chamartín",
    municipality: "Madrid",
    aliases: ["bernabeu-hispanoamerica", "bernabeu"],
    center: { lat: 40.4557, lng: -3.6773 },
    maxKm: 3.0,
    pois: [
      ["Estadio Santiago Bernabéu", "deporte", "Estadio Santiago Bernabéu, Madrid", 10, ["walk"]],
      ["Auditorio Nacional de Música", "cultura", "Auditorio Nacional de Música, Madrid", 20, ["walk"]],
      ["Parque de Berlín", "parque", "Parque de Berlín, Madrid", 30, ["walk"]],
      ["Mercado de Chamartín", "gastronomia", "Mercado de Chamartín", 40, ["walk"]],
      ["Metro Concha Espina", "transporte", "station:Concha Espina", 50, ["walk"]],
      ["Estación de Chamartín", "transporte", "station:Madrid-Chamartín-Clara Campoamor", 60, ["walk", "drive"]],
    ],
  },
  {
    key: "nueva-espana",
    display: "Nueva España",
    district: "Chamartín",
    municipality: "Madrid",
    aliases: [],
    center: { lat: 40.4626, lng: -3.6789 },
    maxKm: 3.0,
    pois: [
      ["Parque de Berlín", "parque", "Parque de Berlín, Madrid", 10, ["walk"]],
      ["Metro Colombia", "transporte", "station:Colombia", 20, ["walk"]],
      ["Mercado de Chamartín", "gastronomia", "Mercado de Chamartín", 30, ["walk"]],
      ["Auditorio Nacional de Música", "cultura", "Auditorio Nacional de Música, Madrid", 40, ["walk"]],
      ["Estadio Santiago Bernabéu", "deporte", "Estadio Santiago Bernabéu, Madrid", 50, ["walk", "drive"]],
      ["Estación de Chamartín", "transporte", "station:Madrid-Chamartín-Clara Campoamor", 60, ["walk", "drive"]],
    ],
  },

  // ── Distrito Tetuán ───────────────────────────────────────────────────
  {
    key: "castillejos",
    display: "Castillejos",
    district: "Tetuán",
    municipality: "Madrid",
    aliases: ["cuzco-castillejos", "cuzco"],
    center: { lat: 40.4610, lng: -3.6926 },
    maxKm: 3.0,
    pois: [
      ["Metro Cuzco", "transporte", "station:Cuzco", 10, ["walk"]],
      ["Estadio Santiago Bernabéu", "deporte", "Estadio Santiago Bernabéu, Madrid", 20, ["walk"]],
      ["Mercado de Maravillas", "gastronomia", "Mercado Maravillas Bravo Murillo", 30, ["walk"]],
      ["Nuevos Ministerios", "transporte", "station:Nuevos Ministerios", 40, ["walk"]],
      ["Mercado de Chamartín", "gastronomia", "Mercado de Chamartín", 50, ["walk", "drive"]],
    ],
  },

  // ── Distrito Chamberí ─────────────────────────────────────────────────
  {
    key: "trafalgar",
    display: "Trafalgar",
    district: "Chamberí",
    municipality: "Madrid",
    aliases: [],
    center: { lat: 40.4318, lng: -3.7004 },
    maxKm: 3.0,
    pois: [
      ["Plaza de Olavide", "gastronomia", "Plaza de Olavide, Madrid", 10, ["walk"]],
      ["Mercado de Barceló", "gastronomia", "Mercado de Barceló, Madrid", 20, ["walk"]],
      ["Museo Sorolla", "cultura", "Museo Sorolla, Madrid", 30, ["walk"]],
      ["Metro Quevedo", "transporte", "station:Quevedo", 40, ["walk"]],
      ["Andén 0 · Estación de Chamberí", "cultura", "Estación de Chamberí, Madrid", 50, ["walk"]],
      ["Gran Vía", "compras", "Gran Vía, Madrid", 60, ["walk", "drive"]],
    ],
  },
  {
    key: "rios-rosas",
    display: "Ríos Rosas",
    district: "Chamberí",
    municipality: "Madrid",
    aliases: ["nuevos-ministerios-rios-rosas", "nuevos-ministerios"],
    center: { lat: 40.4423, lng: -3.6996 },
    maxKm: 3.0,
    pois: [
      ["Metro Ríos Rosas", "transporte", "station:Ríos Rosas", 10, ["walk"]],
      ["Nuevos Ministerios", "transporte", "station:Nuevos Ministerios", 20, ["walk"]],
      ["Museo Geominero", "cultura", "Museo Geominero, Madrid", 30, ["walk"]],
      ["Depósito del Canal de Isabel II", "cultura", "Canal de Isabel II, Santa Engracia, Madrid", 40, ["walk"]],
      ["Plaza de Olavide", "gastronomia", "Plaza de Olavide, Madrid", 50, ["walk"]],
      ["Museo Sorolla", "cultura", "Museo Sorolla, Madrid", 60, ["walk"]],
    ],
  },

  // ── Distrito Centro ───────────────────────────────────────────────────
  {
    key: "malasana",
    display: "Malasaña",
    district: "Centro",
    municipality: "Madrid",
    aliases: ["malasana-universidad", "universidad", "dos-de-mayo"],
    center: { lat: 40.4260, lng: -3.7043 },
    maxKm: 2.5,
    pois: [
      ["Plaza del Dos de Mayo", "otro", "Plaza del Dos de Mayo, Madrid", 10, ["walk"]],
      ["Mercado de San Ildefonso", "gastronomia", "Mercado de San Ildefonso, Madrid", 20, ["walk"]],
      ["Metro Tribunal", "transporte", "station:Tribunal", 30, ["walk"]],
      ["Museo de Historia de Madrid", "cultura", "Museo de Historia de Madrid", 40, ["walk"]],
      ["Centro Cultural Conde Duque", "cultura", "Centro Cultural Conde Duque", 50, ["walk"]],
      ["Gran Vía", "compras", "Gran Vía, Madrid", 60, ["walk"]],
    ],
  },
  {
    key: "chueca",
    display: "Chueca",
    district: "Centro",
    municipality: "Madrid",
    aliases: ["chueca-justicia", "justicia"],
    center: { lat: 40.4229, lng: -3.6971 },
    maxKm: 2.5,
    pois: [
      ["Mercado de San Antón", "gastronomia", "Mercado de San Antón, Madrid", 10, ["walk"]],
      ["Plaza de Chueca", "otro", "Plaza de Chueca, Madrid", 20, ["walk"]],
      ["Metro Chueca", "transporte", "station:Chueca", 30, ["walk"]],
      ["Museo Arqueológico Nacional", "cultura", "Museo Arqueológico Nacional, Madrid", 40, ["walk"]],
      ["Biblioteca Nacional de España", "cultura", "Biblioteca Nacional de España, Madrid", 50, ["walk"]],
      ["Gran Vía", "compras", "Gran Vía, Madrid", 60, ["walk"]],
    ],
  },
  {
    key: "lavapies",
    display: "Lavapiés",
    district: "Centro",
    municipality: "Madrid",
    aliases: ["lavapies-embajadores", "embajadores"],
    center: { lat: 40.4088, lng: -3.7008 },
    maxKm: 2.5,
    pois: [
      ["Metro Lavapiés", "transporte", "station:Lavapiés", 10, ["walk"]],
      ["Mercado de San Fernando", "gastronomia", "Mercado de San Fernando, Madrid", 20, ["walk"]],
      ["Museo Reina Sofía", "cultura", "Museo Reina Sofía, Madrid", 30, ["walk"]],
      ["La Casa Encendida", "cultura", "La Casa Encendida, Madrid", 40, ["walk"]],
      ["Tabacalera", "cultura", "Tabacalera, Madrid", 50, ["walk"]],
      ["Estación de Atocha", "transporte", "station:Madrid-Puerta de Atocha-Almudena Grandes", 60, ["walk", "drive"]],
    ],
  },

  // ── Distrito Retiro ───────────────────────────────────────────────────
  {
    key: "ibiza",
    display: "Ibiza",
    district: "Retiro",
    municipality: "Madrid",
    aliases: [],
    center: { lat: 40.4196, lng: -3.6759 },
    maxKm: 3.0,
    pois: [
      ["Parque del Retiro", "parque", "Parque del Retiro, Madrid", 10, ["walk"]],
      ["Metro Ibiza", "transporte", "station:Ibiza", 20, ["walk"]],
      ["Puerta de Alcalá", "cultura", "Puerta de Alcalá, Madrid", 30, ["walk"]],
      ["Movistar Arena", "deporte", "Movistar Arena, Madrid", 40, ["walk"]],
      ["Museo del Prado", "cultura", "Museo del Prado, Madrid", 50, ["walk", "drive"]],
    ],
  },
  {
    key: "nino-jesus",
    display: "Niño Jesús",
    district: "Retiro",
    municipality: "Madrid",
    aliases: [],
    center: { lat: 40.4118, lng: -3.6733 },
    maxKm: 3.0,
    pois: [
      ["Parque del Retiro", "parque", "Parque del Retiro, Madrid", 10, ["walk"]],
      ["Hospital Infantil Niño Jesús", "salud", "Hospital Niño Jesús, Madrid", 20, ["walk"]],
      ["Metro Sainz de Baranda", "transporte", "station:Sainz de Baranda", 30, ["walk"]],
      ["Real Jardín Botánico", "parque", "Real Jardín Botánico, Madrid", 40, ["walk"]],
      ["Estación de Atocha", "transporte", "station:Madrid-Puerta de Atocha-Almudena Grandes", 50, ["walk", "drive"]],
    ],
  },
  {
    key: "estrella",
    display: "Estrella",
    district: "Retiro",
    municipality: "Madrid",
    aliases: [],
    center: { lat: 40.4159, lng: -3.6663 },
    maxKm: 3.0,
    pois: [
      ["Parque del Retiro", "parque", "Parque del Retiro, Madrid", 10, ["walk"]],
      ["Metro Sainz de Baranda", "transporte", "station:Sainz de Baranda", 20, ["walk"]],
      ["Hospital Universitario Gregorio Marañón", "salud", "Hospital General Universitario Gregorio Marañón, Madrid", 30, ["walk"]],
      ["Movistar Arena", "deporte", "Movistar Arena, Madrid", 40, ["walk"]],
      ["Metro O'Donnell", "transporte", "station:O'Donnell", 50, ["walk"]],
    ],
  },

  // ── Municipio de Pozuelo de Alarcón (capa municipal, misma interfaz) ──
  {
    key: "somosaguas",
    display: "Somosaguas",
    district: null,
    municipality: "Pozuelo de Alarcón",
    aliases: [],
    center: { lat: 40.4055, lng: -3.7845 },
    maxKm: 6.0,
    pois: [
      ["Campus de Somosaguas (UCM)", "educacion", "Campus de Somosaguas", 10, ["walk", "drive"]],
      ["Casa de Campo", "parque", "Casa de Campo, Madrid", 20, ["drive"]],
      ["Club de Campo Villa de Madrid", "deporte", "Club de Campo Villa de Madrid", 30, ["drive"]],
      ["Estación de Pozuelo (Cercanías)", "transporte", "station:Pozuelo", 40, ["drive"]],
      ["Zoco de Pozuelo", "compras", "Zoco de Pozuelo", 50, ["drive"]],
    ],
  },
  {
    key: "prado-de-somosaguas",
    display: "Prado de Somosaguas",
    district: null,
    municipality: "Pozuelo de Alarcón",
    aliases: [],
    center: { lat: 40.4063, lng: -3.7969 },
    maxKm: 6.0,
    pois: [
      ["Campus de Somosaguas (UCM)", "educacion", "Campus de Somosaguas", 10, ["drive"]],
      ["Zoco de Pozuelo", "compras", "Zoco de Pozuelo", 20, ["drive"]],
      ["Estación de Pozuelo (Cercanías)", "transporte", "station:Pozuelo", 30, ["drive"]],
      ["Club de Campo Villa de Madrid", "deporte", "Club de Campo Villa de Madrid", 40, ["drive"]],
      ["Casa de Campo", "parque", "Casa de Campo, Madrid", 50, ["drive"]],
    ],
  },

  // ── Municipio de Torrelodones ────────────────────────────────────────
  // "Centro Comercial - Hospital" es como el catálogo nombra el núcleo de
  // Los Bomberos (salida 29 de la A-6), donde están Espacio Torrelodones y
  // el hospital. Es un descriptor real, sólo que impresentable como título.
  {
    key: "torrelodones",
    display: "Torrelodones",
    district: null,
    municipality: "Torrelodones",
    aliases: ["centro-comercial-hospital", "los-bomberos", "torrelodones-colonia", "la-colonia"],
    center: { lat: 40.5756, lng: -3.9294 },
    maxKm: 5.0,
    pois: [
      // La estación de Cercanías queda FUERA a propósito: no hay nodo suyo en
      // OSM con etiquetas de estación, y el único candidato que devuelve
      // Nominatim es el centroide del barrio de La Colonia, no el andén.
      // Antes que publicar un tiempo aproximado, no se publica.
      ["Centro Comercial Espacio Torrelodones", "compras", "Espacio Torrelodones, Torrelodones", 10, ["drive"]],
      ["Hospital HM Torrelodones", "salud", "Hospital de Madrid Torrelodones", 20, ["drive"]],
      ["Parque Pradogrande", "parque", "Parque Pradogrande, Torrelodones", 40, ["walk", "drive"]],
      ["Parque JH", "parque", "Parque JH, Torrelodones", 50, ["walk", "drive"]],
      ["Casino Gran Madrid", "otro", "Casino Gran Madrid, Torrelodones", 60, ["drive"]],
    ],
  },
];

/** Alias que se añaden a barrios YA existentes en producción. */
export const ALIASES_FOR_EXISTING = {
  salamanca: ["barrio-de-salamanca"],
  pozuelo: ["pozuelo-de-alarcon"],
};
