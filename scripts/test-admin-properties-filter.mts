// Caracterización del filtro de la lista de Propiedades (BCP-01, P1).
// Fija el comportamiento ACTUAL, defectos conocidos incluidos (O-B3), para que
// sacar sus controles a componentes compartidos no lo cambie.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-admin-properties-filter.mts
import assert from "node:assert/strict";
import { type AdminPropertyFilters, matchesAdminPropertyFilters } from "../lib/properties/admin-filter.ts";
import type { AdminProperty } from "../lib/types.ts";

const base: AdminProperty = {
  id: "x",
  reference: "idealista-1",
  bcReference: "BC-0001",
  propertyReference: "PROP-2026-0001",
  title: "Piso",
  zone: "Salamanca",
  subzone: "Goya",
  agencyId: "level",
  agencyName: "Level",
  operation: "alquiler",
  isDualOperation: false,
  stayType: "larga",
  status: "available",
  bedrooms: 2,
  bathrooms: 1,
  squareMeters: 80,
  price: 2000,
  floor: 3,
  publishedLabel: "",
  tagIds: [],
};
const P = (over: Partial<AdminProperty>): AdminProperty => ({ ...base, ...over });
const none: AdminPropertyFilters = {
  query: "", tagIds: [], operation: "", status: "", zone: "", subzone: "", agency: "", stay: "",
  bedrooms: "", bathrooms: "", floor: "", minPrice: "", maxPrice: "", minM2: "", maxM2: "",
};
const F = (over: Partial<AdminPropertyFilters>): AdminPropertyFilters => ({ ...none, ...over });
const tags = new Map([["t1", "Exclusiva"], ["t2", "Reformado"]]);
const m = (p: AdminProperty, f: AdminPropertyFilters) => matchesAdminPropertyFilters(p, f, (id) => tags.get(id));

let n = 0;
const ok = (cond: boolean, name: string) => {
  assert.ok(cond, name);
  n++;
};

ok(m(base, none), "sin filtros: todo pasa");

// Texto (delegado en matchesPropertySearch): título, zona, agencia, etiqueta y referencias.
ok(m(base, F({ query: "goya" })), "texto: subzona");
ok(m(base, F({ query: "level" })), "texto: agencia");
ok(m(P({ tagIds: ["t1"] }), F({ query: "exclusiva" })), "texto: nombre de etiqueta");
ok(!m(base, F({ query: "exclusiva" })), "texto: sin la etiqueta no casa");
ok(m(base, F({ query: "bc0001" })), "texto: ref BC compacta");
ok(!m(P({ title: "Ático en Chamberí", zone: "Chamberí" }), F({ query: "chamberi" })), "texto: NO pliega tildes (comportamiento actual)");

// Etiquetas: basta con una.
ok(m(P({ tagIds: ["t2"] }), F({ tagIds: ["t1", "t2"] })), "etiquetas: una de las marcadas");
ok(!m(P({ tagIds: [] }), F({ tagIds: ["t1"] })), "etiquetas: ninguna");

// Operación: las duales entran en alquiler; y en venta solo si su operación es venta.
ok(m(P({ operation: "venta", isDualOperation: true }), F({ operation: "alquiler" })), "operación: dual en alquiler");
ok(m(P({ operation: "venta", isDualOperation: true }), F({ operation: "venta" })), "operación: dual en venta");
ok(!m(P({ operation: "venta" }), F({ operation: "alquiler" })), "operación: venta no entra en alquiler");
ok(!m(base, F({ operation: "venta" })), "operación: alquiler no entra en venta");

// DEFECTO conocido (O-B3): con alquiler, la dual compara `price` (el de venta).
ok(!m(P({ operation: "venta", isDualOperation: true, price: 900000 }), F({ operation: "alquiler", maxPrice: "3000" })),
  "defecto: dual en alquiler filtrada por su precio de VENTA");

// Estado: igualdad; «rented» nunca coincide con filas reales (no existe en BD).
ok(m(P({ status: "reserved" }), F({ status: "reserved" })), "estado: reservado");
ok(!m(base, F({ status: "rented" })), "defecto: «Alquilado» no casa con una disponible");
ok(m(P({ status: "draft" }), F({ status: "draft" })), "estado: «Borrador» (= archivada en el adaptador)");

// Distrito y subzona: igualdad EXACTA (defecto conocido: sin tildes ni alias).
ok(m(base, F({ zone: "Salamanca", subzone: "Goya" })), "zona: exacta");
ok(!m(P({ zone: "Chamberi" }), F({ zone: "Chamberí" })), "defecto: zona sin plegar tildes");
ok(!m(base, F({ subzone: "goya" })), "subzona: distingue mayúsculas");

ok(m(base, F({ agency: "level" })) && !m(base, F({ agency: "otra" })), "agencia por slug");
ok(m(base, F({ stay: "larga" })) && !m(base, F({ stay: "corta" })) && !m(P({ stayType: null }), F({ stay: "larga" })), "estancia estricta");

// Dormitorios: exacto o «N o más».
ok(m(base, F({ bedrooms: "2" })) && !m(base, F({ bedrooms: "3" })), "dormitorios exactos");
ok(m(base, F({ bedrooms: "2plus" })) && m(base, F({ bedrooms: "1plus" })) && !m(base, F({ bedrooms: "3plus" })), "dormitorios N o más");

ok(m(base, F({ bathrooms: "1" })) && !m(base, F({ bathrooms: "2" })), "baños mínimo");

// Planta mínima: sin dato queda fuera.
ok(m(base, F({ floor: "3" })) && !m(base, F({ floor: "4" })), "planta mínima");
ok(!m(P({ floor: null }), F({ floor: "1" })), "planta: sin dato fuera");
ok(m(P({ floor: 99 }), F({ floor: "6" })), "planta: ático (99) cumple");

// Precio y m²: límites inclusivos.
ok(m(base, F({ minPrice: "2000", maxPrice: "2000" })), "precio: límites inclusivos");
ok(!m(base, F({ minPrice: "2001" })) && !m(base, F({ maxPrice: "1999" })), "precio fuera de rango");
ok(m(base, F({ minM2: "80", maxM2: "80" })) && !m(base, F({ minM2: "81" })), "m² inclusivo");

console.log(`✅ ${n} comprobaciones del filtro de Propiedades`);
