// ============================================================================
// SOLO DESARROLLO LOCAL (BCP-01, E7). Datos 100 % sintéticos para revisar la
// HOME y la gestión sin base de datos: títulos, precios y referencias
// inventados; las «fotos» son SVG generados (no hay fotos reales ni de las
// referencias visuales). Solo se importan dentro de páginas protegidas por
// isCatalogFixtureMode().
// ============================================================================

import { DEFAULT_CRITERIA, type CatalogCriteria } from "./criteria";
import type { OperationPriceInput } from "./operation-price";
import type { CatalogDetail, CatalogSummary } from "./types";

const SAL_JUS: CatalogCriteria = {
  operation: "sale",
  zones: [{ kind: "district", name: "Salamanca" }, { kind: "barrio", name: "Justicia" }],
  price_min: 700000,
  price_max: 1500000,
  sort: "price_asc",
  max: 12,
};

/** Imagen sintética (edificio esquemático) como data URI SVG. */
export function syntheticPhoto(hue: number, w = 600, h = 800, label = "Foto de prueba"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="hsl(${hue} 30% 84%)"/><stop offset="0.6" stop-color="hsl(${hue} 22% 64%)"/><stop offset="1" stop-color="hsl(${hue} 20% 40%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
${Array.from({ length: 5 }, (_, i) => `<rect x="${w * (0.22 + i * 0.12)}" y="${h * 0.28}" width="${w * 0.07}" height="${h * 0.72}" fill="hsl(${hue} 25% 92% / .55)"/>`).join("")}
<rect y="${h * 0.84}" width="100%" height="${h * 0.16}" fill="hsl(${hue} 18% 28% / .55)"/>
<text x="${w * 0.04}" y="${h * 0.06}" font-family="Arial" font-size="${Math.round(w * 0.035)}" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const now = new Date("2026-10-13T10:00:00Z").toISOString();

export const fixtureCatalogs: CatalogSummary[] = [
  {
    id: "f0000000-0000-0000-0000-000000000001", title: "Salamanca y Chamberí", intro: "Cuatro viviendas elegidas para una búsqueda concreta.",
    status: "active", version: 9, createdAt: "2026-10-01T09:00:00Z", updatedAt: now, itemCount: 4,
    numberLabel: "nº 01", edition: "Otoño 2026", coverPhotoUrl: syntheticPhoto(28, 600, 800, "Vertical"), contactName: "Fabricio Andree", mode: "manual", criteria: { ...DEFAULT_CRITERIA, operation: "sale", zones: [{ kind: "district", name: "Salamanca" }] }, ads: [{ id: "e3000000-0000-0000-0000-000000000001", reference: "BC-1501", title: "Ático con terraza en Goya", code: "108123456", note: "Clientes de Londres" }],
  },
  {
    id: "f0000000-0000-0000-0000-000000000002",
    title: "Áticos con terraza para una familia que se traslada desde Londres en primavera",
    intro: "Título largo a propósito: comprueba que la portada recorta sin desbordar.",
    status: "active", version: 3, createdAt: "2026-10-05T09:00:00Z", updatedAt: "2026-10-12T17:00:00Z", itemCount: 12,
    numberLabel: "nº 02", edition: "Otoño 2026", coverPhotoUrl: syntheticPhoto(205, 900, 600, "Horizontal"), contactName: "Laura Méndez", mode: "auto", criteria: SAL_JUS, ads: [{ id: "e3000000-0000-0000-0000-000000000002", reference: null, title: null, code: "108999111", note: null }, { id: "e3000000-0000-0000-0000-000000000003", reference: "BC-1501", title: "Ático con terraza en Goya", code: "108123456", note: null }],
  },
  {
    id: "f0000000-0000-0000-0000-000000000003", title: "Inversores · Chamberí", intro: null,
    status: "active", version: 1, createdAt: "2026-10-12T09:00:00Z", updatedAt: "2026-10-12T09:00:00Z", itemCount: 0,
    numberLabel: "nº 03", edition: "Otoño 2026", coverPhotoUrl: null, contactName: "Fabricio Andree", mode: "manual", criteria: { ...DEFAULT_CRITERIA, operation: "rent", price_max: 4000 }, ads: [],
  },
  {
    id: "f0000000-0000-0000-0000-000000000004", title: "QA — no compartir", intro: "Catálogo de prueba.",
    status: "archived", version: 6, createdAt: "2026-09-20T09:00:00Z", updatedAt: "2026-10-02T09:00:00Z", itemCount: 3,
    numberLabel: "nº 04", edition: "Otoño 2026", coverPhotoUrl: syntheticPhoto(145, 600, 800, "Vertical"), contactName: "Fabricio Andree", mode: "manual", criteria: { ...DEFAULT_CRITERIA }, ads: [],
  },
];

/** K1: los importes de las cuatro viviendas del ejemplo manual (las etiquetas
 *  de arriba están escritas a mano para un catálogo de venta; la gestión de
 *  prueba las recalcula con priceDisplay si cambia la operación guardada). */
export const fixtureManualPricing: Record<string, OperationPriceInput> = {
  "e0000000-0000-0000-0000-000000000001": { operation: "sale", operations: ["sale"], price: 1450000, rent_price: null, currency: "eur" },
  "e0000000-0000-0000-0000-000000000002": { operation: "sale", operations: ["sale", "rent"], price: 2100000, rent_price: 6800, currency: "eur" },
  "e0000000-0000-0000-0000-000000000003": { operation: "rent", operations: ["rent"], price: 0, rent_price: 3900, currency: "eur" },
  "e0000000-0000-0000-0000-000000000004": { operation: "rent", operations: ["rent"], price: 2100, rent_price: null, currency: "eur" },
};

export const fixtureCatalogDetail: CatalogDetail = {
  id: "f0000000-0000-0000-0000-000000000001",
  title: "Salamanca y Chamberí",
  intro: "Cuatro viviendas elegidas para una búsqueda concreta.",
  status: "active",
  version: 9,
  createdAt: "2026-10-01T09:00:00Z",
  updatedAt: now,
  edition: "Otoño 2026",
  contact: { name: "Fabricio Andree", phone: "+34641457123", role: "asesor" },
  mode: "manual",
  criteria: { ...DEFAULT_CRITERIA, operation: "sale", zones: [{ kind: "district", name: "Salamanca" }] },
  autoTotal: null,
  manualCount: 4,
  ads: [{ id: "e3000000-0000-0000-0000-000000000001", reference: "BC-1501", title: "Ático con terraza en Goya", code: "108123456", note: "Clientes de Londres" }],
  autoMatched: null,
  adjustments: { included: 0, excluded: [], unavailable: [], overMax: false },
  cover: { chosenPropertyId: null, chosenPhotoId: null, effectivePhotoUrl: syntheticPhoto(28, 320, 240, "1"), warnings: [] },
  // E2 · material sintético (escrito a mano; la página real lo calcula con la
  // instantánea del lector). El dúplex está reservado y sin foto.
  material: {
    "e0000000-0000-0000-0000-000000000001": { noText: false, photos: 4 },
    "e0000000-0000-0000-0000-000000000002": { noText: false, photos: 6 },
    "e0000000-0000-0000-0000-000000000003": { noText: true, photos: 0 },
    "e0000000-0000-0000-0000-000000000004": { noText: true, photos: 3 },
  },
  items: [
    { propertyId: "e0000000-0000-0000-0000-000000000001", position: 100, slug: "atico-demo", bcReference: "BC-9001", title: "Ático con terraza sobre los tejados de Jerónimos", zone: "Jerónimos, Madrid", status: "available", operation: "Venta", price: "1.450.000 €", bedrooms: 3, bathrooms: 2, squareMeters: 142, photoUrl: syntheticPhoto(28, 320, 240, "1") },
    // K1 (DS-2, catálogo de venta): la dual se ve como venta, con el alquiler aparte (solo gestión).
    { propertyId: "e0000000-0000-0000-0000-000000000002", position: 200, slug: "piso-demo", bcReference: "BC-9002", title: "Piso señorial con galería acristalada, molduras originales y suelos de madera restaurados en la calle Almagro", zone: "Almagro, Madrid", status: "available", operation: "Venta", price: "2.100.000 €", priceAlso: "También en alquiler: 6.800 €/mes", bedrooms: 4, bathrooms: 3, squareMeters: 186, photoUrl: syntheticPhoto(205, 240, 320, "2") },
    // Inclusión de otra operación (alquiler en un catálogo de venta): lo suyo real.
    // P-ALQ (D-QA16): sin precio principal y 3.900 €/mes en el campo secundario → «sin dato» y aviso interno.
    { propertyId: "e0000000-0000-0000-0000-000000000003", position: 300, slug: "duplex-demo", bcReference: "BC-9003", title: "Dúplex con patio", zone: null, status: "reserved", operation: "Alquiler", price: "Precio · sin dato", priceWarning: "La ficha no tiene precio principal: el campo secundario dice 3.900 €/mes, pero no se usa. Corrige el precio en la ficha.", bedrooms: null, bathrooms: 2, squareMeters: null, photoUrl: null },
    { propertyId: "e0000000-0000-0000-0000-000000000004", position: 400, slug: "estudio-demo", bcReference: null, title: "Estudio de diseño", zone: "Recoletos, Madrid", status: "available", operation: "Alquiler", price: "2.100 €/mes", bedrooms: 1, bathrooms: 1, squareMeters: 54, photoUrl: syntheticPhoto(330, 320, 240, "4") },
  ],
};
