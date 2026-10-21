import { createEgoScraper, type EgoSiteConfig } from "./ego";

// INNEA Properties (https://www.inneaproperties.com): web de eGO Real Estate,
// mismo motor que Housely (./ego.ts). Aquí solo lo propio de la agencia.
//
// Verificado el 2026-10-21: 151 inmuebles, todos en venta (su página de
// alquiler existe pero la API no devuelve ninguno con negocio "Alquiler"). El
// motor importa venta y alquiler por igual, así que cuando publiquen alquileres
// entrarán solos (desde 3.000 €/mes, como el resto de agencias).
//
// Criterios de captación (decididos con BC): venta a cualquier precio, alquiler
// desde 3.000 €/mes, todas sus zonas (Salamanca, Retiro, Centro, Chamberí,
// Chamartín, Pozuelo; algún suelto en Arganzuela o Tetuán), solo viviendas (su
// única oficina se descarta).
//
// Su marca de agua es el logo "INNEA" centrado en las fotos redimensionadas;
// `ZOriginal` sale limpia (ver ego.ts).
export const INNEA: EgoSiteConfig = {
  key: "innea",
  label: "INNEA Properties (API eGO)",
  agencySlug: "innea-properties",
  siteBase: "https://www.inneaproperties.com",
  sessionPage: "https://www.inneaproperties.com/comprar-vivienda-lujo-madrid",
  // A diferencia de Housely, sus fichas cuelgan de /detalles-del-inmueble/.
  detailPath: "detalles-del-inmueble",
  brand: /innea(\s+properties)?/i,
  // "INNEA Properties presenta esta…" → "Esta…". Las frases de cierre ("En INNEA
  // Properties estaremos encantados de…") caen enteras por la marca.
  signature: /innea\s+properties\s+(te\s+)?presenta\s+(en\s+exclusiva\s+)?/gi,
};

export const inneaScraper = createEgoScraper(INNEA);
