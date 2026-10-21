import {
  cleanEgoDescription,
  createEgoScraper,
  egoSourceUrl,
  extractEgoSession,
  mapEgoProperty,
  pickOperation,
  type EgoProperty,
  type EgoSiteConfig,
} from "./ego";

// Housely Consulting (https://www.houselyconsulting.com): web de eGO Real Estate.
// Todo el motor está en ./ego.ts; aquí solo lo propio de la agencia.
//
// Criterios de captación (decididos con BC): venta a cualquier precio, alquiler
// desde 3.000 €/mes, todas sus zonas (la cartera entera es Madrid prime:
// Salamanca, Centro, Chamberí, Chamartín, Retiro), solo viviendas.
//
// Su marca de agua es un óvalo con una "H" en el centro de las fotos
// redimensionadas; `ZOriginal` sale limpia (ver ego.ts).
export const HOUSELY: EgoSiteConfig = {
  key: "housely",
  label: "Housely Consulting (API eGO)",
  agencySlug: "housely-consulting",
  siteBase: "https://www.houselyconsulting.com",
  sessionPage: "https://www.houselyconsulting.com/comprar?bus=1",
  detailPath: "inmueble",
  brand: /housely(\s+consulting)?/i,
  // "HOUSELY CONSULTING presenta esta…" → "Esta…". El "#ref: (teléfono oculto)"
  // del final cae por la regla de promo.
  signature: /housely\s+consulting\s+(te\s+)?presenta\s+(en\s+exclusiva\s+)?/gi,
};

export type { EgoProperty };
export { pickOperation };
export const extractHouselySession = extractEgoSession;
export const cleanHouselyDescription = (raw: string | null | undefined) =>
  cleanEgoDescription(HOUSELY, raw);
export const houselySourceUrl = (p: EgoProperty) => egoSourceUrl(HOUSELY, p);
export const mapHouselyProperty = (p: EgoProperty) => mapEgoProperty(HOUSELY, p);

export const houselyScraper = createEgoScraper(HOUSELY);
