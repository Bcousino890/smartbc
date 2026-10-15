// ============================================================================
// SOLO DESARROLLO LOCAL (BCP-01 ampliación, E7). Universo SINTÉTICO de
// propiedades para revisar en /dev-fixtures los filtros, la selección
// automática, el cambio de modo y los anuncios, sin base de datos. La
// selección usa la referencia TS (selection.ts), que las pruebas de paridad
// comparan con el SQL real. Solo se importa desde páginas protegidas por
// isCatalogFixtureMode().
// ============================================================================

import { operationLabel, priceLabel } from "./format";
import { fixtureCatalogDetail, syntheticPhoto } from "./fixtures";
import type { CatalogMaterial } from "./material";
import type { CandidateProperty } from "./selection";
import type { CatalogDetail, CatalogItemView } from "./types";

export interface FixtureProperty extends CandidateProperty {
  slug: string;
  bc_reference: string;
  title: string;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
}

const rows: Array<[string, string, string | null, "sale" | "rent", string[], number | null, number | null, string, number]> = [
  // título, zona, subzona, operación, operaciones, precio, alquiler (duales), estado, fotos
  ["Ático en Goya", "Salamanca", "Goya", "sale", ["sale"], 1450000, null, "available", 6],
  ["Piso señorial en Lista", "Salamanca", "Lista", "sale", ["sale"], 2100000, null, "available", 8],
  ["Exterior en Recoletos", "Salamanca", "Recoletos", "sale", ["sale"], 980000, null, "reserved", 4],
  ["Dúplex en Castellana", "Salamanca", "Castellana", "sale", ["sale", "rent"], 1750000, 6500, "available", 5],
  ["Estudio en Guindalera", "Salamanca", "Guindalera", "rent", ["rent"], 1450, null, "available", 3],
  ["Loft en Justicia", "Centro", "Justicia", "sale", ["sale"], 890000, null, "available", 5],
  ["Piso en Chueca", "Chueca", null, "sale", ["sale"], 760000, null, "available", 4],
  ["Buhardilla en Malasaña", "Malasaña", null, "rent", ["rent"], 1900, null, "available", 2],
  ["Piso en Huertas", "Huertas - Madrid", null, "sale", ["sale"], 640000, null, "available", 3],
  ["Piso en Almagro", "Chamberí", "Almagro", "sale", ["sale"], 1250000, null, "available", 6],
  ["Piso en Trafalgar", "Chamberí", "Trafalgar", "rent", ["rent"], 3200, null, "available", 4],
  ["Piso en Ibiza", "Retiro", "Ibiza", "sale", ["sale"], 1100000, null, "available", 5],
  ["Chalet en Pozuelo", "Pozuelo de Alarcón", null, "sale", ["sale"], 1950000, null, "available", 9],
  ["Sin precio en Goya", "Salamanca", "Goya", "sale", ["sale"], 0, null, "available", 2],
  ["Sin foto en Lista", "Salamanca", "Lista", "sale", ["sale"], 1200000, null, "available", 0],
  ["Vendido en Goya", "Salamanca", "Goya", "sale", ["sale"], 1300000, null, "sold", 4],
  ["Piso en El Viso", "Chamartín", "El Viso", "sale", ["sale"], 2400000, null, "available", 7],
  ["Piso en Justicia (Madrid)", "Madrid", "Justicia", "sale", ["sale"], 1050000, null, "available", 4],
];

// E2 · 18 viviendas más, SOLO para el catálogo grande (?grande=1). Las 18 de
// arriba no cambian: las regresiones de C1/C2 dependen de ellas.
const largeRows: typeof rows = [
  ["Piso en Ríos Rosas", "Chamberí", "Ríos Rosas", "sale", ["sale"], 820000, null, "available", 5],
  ["Piso en Arapiles", "Chamberí", "Arapiles", "sale", ["sale"], 690000, null, "available", 4],
  ["Ático en Gaztambide", "Chamberí", "Gaztambide", "sale", ["sale"], 1180000, null, "available", 6],
  ["Piso en Vallehermoso", "Chamberí", "Vallehermoso", "sale", ["sale"], 735000, null, "available", 3],
  ["Esquina en Trafalgar", "Chamberí", "Trafalgar", "sale", ["sale"], 905000, null, "available", 5],
  ["Piso en Almagro con portería", "Chamberí", "Almagro", "sale", ["sale"], 1620000, null, "available", 7],
  ["Bajo con patio en Arapiles", "Chamberí", "Arapiles", "sale", ["sale"], 560000, null, "reserved", 3],
  ["Piso en Castellana", "Salamanca", "Castellana", "sale", ["sale"], 1990000, null, "available", 6],
  ["Piso en Fuente del Berro", "Salamanca", "Fuente del Berro", "sale", ["sale"], 615000, null, "available", 4],
  ["Piso en Lista con terraza", "Salamanca", "Lista", "sale", ["sale"], 1340000, null, "available", 5],
  ["Piso alto en Recoletos", "Salamanca", "Recoletos", "sale", ["sale"], 2250000, null, "available", 8],
  ["Piso luminoso en Goya", "Salamanca", "Goya", "sale", ["sale"], 870000, null, "available", 4],
  ["Piso en Prosperidad", "Chamartín", "Prosperidad", "sale", ["sale"], 590000, null, "available", 3],
  ["Piso en Hispanoamérica", "Chamartín", "Hispanoamérica", "sale", ["sale"], 1020000, null, "available", 5],
  ["Piso en Nueva España", "Chamartín", "Nueva España", "sale", ["sale"], 1480000, null, "available", 6],
  ["Piso en Jerónimos", "Retiro", "Jerónimos", "sale", ["sale"], 2600000, null, "available", 9],
  ["Piso sin fotos en Almagro", "Chamberí", "Almagro", "sale", ["sale"], 990000, null, "available", 0],
  ["Alquiler en Ríos Rosas", "Chamberí", "Ríos Rosas", "rent", ["rent"], 2400, null, "available", 4],
];

const toFixture = ([title, zone, subzone, operation, operations, price, rent, status, photos]: (typeof rows)[number], i: number): FixtureProperty => ({
  id: `e1000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  slug: `fx-sel-${i + 1}`,
  bc_reference: `BC-97${String(i + 1).padStart(2, "0")}`,
  title,
  country: "es",
  archived_at: null,
  status,
  operation,
  operations,
  price,
  rent_price: rent,
  zone,
  subzone,
  created_at: `2026-0${1 + (i % 9)}-1${i % 3}T10:00:00Z`,
  photo_count: photos,
  bedrooms: 1 + (i % 4),
  bathrooms: 1 + (i % 3),
  square_meters: 60 + i * 9,
});

export const fixtureProperties: FixtureProperty[] = rows.map(toFixture);

/** E2 · universo del catálogo grande: las 18 de siempre más 18 (ids …19–…36). */
export const fixturePropertiesLarge: FixtureProperty[] = [...fixtureProperties, ...largeRows.map((r, j) => toFixture(r, rows.length + j))];

/** E2 · material SINTÉTICO de una vivienda del universo de selección, por un
 *  patrón fijo según su número n (1–36) y sus fotos. Escrito a mano (no sale
 *  de la proyección del lector, que en desarrollo no existe para estas):
 *    n % 4 = 1 → 3 capítulos, todos con foto · n % 4 = 2 → 4 capítulos, 2 sin foto
 *    n % 4 = 3 → ficha breve («Sin descripción») · n % 4 = 0 → descripción sin capítulos */
export function fixtureMaterial(p: FixtureProperty): CatalogMaterial {
  const n = Number(p.id.slice(-2));
  const photos = p.photo_count;
  switch (n % 4) {
    case 1:
      return { noText: false, sections: 3, sectionsWithoutPhoto: 0, photos };
    case 2:
      return { noText: false, sections: 4, sectionsWithoutPhoto: 2, photos };
    case 3:
      return { noText: true, sections: 0, sectionsWithoutPhoto: 0, photos };
    default:
      return { noText: false, sections: 0, sectionsWithoutPhoto: 0, photos };
  }
}

/** E2 · catálogo grande (?grande=1): 22 viviendas en manual (las nº 1, 2, 6 y
 *  10, y de la 19 a la 36) y criterios «venta, cualquier zona, máx. 24». */
export function fixtureLargeCatalogDetail(): CatalogDetail {
  const byN = (n: number) => fixturePropertiesLarge[n - 1];
  const list = [1, 2, 6, 10, ...Array.from({ length: 18 }, (_, i) => 19 + i)].map(byN);
  const items = list.map((p, i) => fixtureView(p, (i + 1) * 100));
  return {
    ...fixtureCatalogDetail,
    title: "Selección grande para pruebas (E2)",
    intro: "Veintidós viviendas sintéticas para revisar la lista compacta.",
    items,
    manualCount: items.length,
    mode: "manual",
    criteria: { operation: "sale", zones: [], price_min: null, price_max: null, sort: "price_asc", max: 24 },
    autoTotal: null,
    autoMatched: null,
    adjustments: { included: 0, excluded: [], unavailable: [], overMax: false },
    cover: { chosenPropertyId: null, chosenPhotoId: null, effectivePhotoUrl: items.find((x) => x.photoUrl)?.photoUrl ?? null, warnings: [] },
    material: Object.fromEntries(list.map((p) => [p.id, fixtureMaterial(p)])),
  };
}

export function fixtureView(p: FixtureProperty, position = 100): CatalogItemView {
  return {
    propertyId: p.id,
    position,
    slug: p.slug,
    bcReference: p.bc_reference,
    title: p.title,
    zone: [p.subzone, p.zone].filter(Boolean).join(", ") || null,
    status: p.status as CatalogItemView["status"],
    operation: operationLabel(p.operation, p.operations),
    price: priceLabel({ operation: p.operation, operations: p.operations, price: p.price, rentPrice: p.rent_price, currency: "eur" }),
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    squareMeters: p.square_meters,
    photoUrl: p.photo_count > 0 ? fixturePhotoUrl(p.id, 0) : null,
  };
}

export const fixtureSavedListings = [
  { id: "e2000000-0000-0000-0000-000000000001", reference: "BC-1501", title: "Ático con terraza en Goya", code: "108123456", state: "published" },
  { id: "e2000000-0000-0000-0000-000000000002", reference: "BC-1502", title: "Piso familiar en Chamberí", code: "108654321", state: "published" },
  { id: "e2000000-0000-0000-0000-000000000003", reference: "BC-I-0007", title: "Inspo · loft en Justicia", code: null, state: "draft" },
];

/** «Foto» sintética nº `i` de una vivienda de prueba (SVG en data URI). */
export function fixturePhotoUrl(propertyId: string, i: number): string {
  const n = Number(propertyId.slice(-2)) || 1;
  return syntheticPhoto((n * 37 + i * 61) % 360, 320, 240, `${n}·${i + 1}`);
}
