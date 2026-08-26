// Checklist de características frecuentes por país. No es la lista oficial
// de códigos de PortalInmobiliario (no publican una API de atributos pública
// que hayamos podido mapear), sino las amenidades/equipamiento que ese portal
// y los sitios chilenos equivalentes (Portal Inmobiliario / MercadoLibre,
// goplaceit, etc.) muestran habitualmente como filtros de búsqueda. Se
// guardan como texto libre en `features_manual`, igual que las que el admin
// escribe a mano — este checklist es solo un atajo para no tener que
// tipearlas.

export const CL_PROPERTY_FEATURES: string[] = [
  "Piscina",
  "Quincho",
  "Estacionamiento de visita",
  "Bodega",
  "Ascensor",
  "Conserjería 24 horas",
  "Seguridad / portería",
  "Gimnasio",
  "Sala de eventos",
  "Sala multiuso",
  "Cancha deportiva",
  "Área de juegos infantiles",
  "Jardín",
  "Terraza",
  "Balcón",
  "Calefacción central",
  "Aire acondicionado",
  "Cocina amoblada",
  "Walk-in closet",
  "Panel solar",
  "Citófono",
  "Acceso control",
  "Amoblado",
  "Se admiten mascotas",
];

export const ES_PROPERTY_FEATURES: string[] = [
  "Piscina",
  "Ascensor",
  "Terraza",
  "Balcón",
  "Trastero",
  "Plaza de garaje",
  "Jardín",
  "Aire acondicionado",
  "Calefacción central",
  "Armarios empotrados",
  "Amueblado",
  "Cocina equipada",
  "Portero / conserje",
  "Zona comunitaria",
  "Se admiten mascotas",
];

export function propertyFeaturesForCountry(country?: string): string[] {
  return country === "cl" ? CL_PROPERTY_FEATURES : ES_PROPERTY_FEATURES;
}
