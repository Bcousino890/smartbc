// CRM-03 · PR-A: la lista de Propiedades pide columnas explícitas en vez de `*`.
//   · Paridad (AC2): el adaptador da EXACTAMENTE lo mismo con la fila completa
//     (`select *`, con columnas que la lista no usa: dueño, notas, coordenadas…)
//     que con la fila proyectada a ADMIN_LIST_COLUMNS; y filtros, búsqueda,
//     totales, opciones y la selección (por id) devuelven lo mismo.
//   · Vigilancia: si el adaptador empieza a leer una columna que no está en la
//     lista, la paridad falla (cada columna leída tiene valores distintos de
//     null en las filas sintéticas).
//   · El `select` no repite columnas y conserva los embebidos de antes.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-admin-properties-columns.mts
import assert from "node:assert/strict";
import { propertyRowToAdminProperty } from "../lib/db/adapters.ts";
import { ADMIN_LIST_COLUMNS, ADMIN_LIST_SELECT } from "../lib/properties/admin-list-columns.ts";
import { type AdminPropertyFilters, matchesAdminPropertyFilters } from "../lib/properties/admin-filter.ts";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✅ ${name}`);
};

let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const ZONES = ["Salamanca", "Chamberí", "Retiro", "Centro"];
const SUB: Record<string, string[]> = { Salamanca: ["Goya", "Lista"], Chamberí: ["Almagro"], Retiro: ["Ibiza"], Centro: ["Sol"] };

// Fila COMPLETA, como la devuelve `select *`: también columnas que la lista no
// lee (y que no deben influir en nada).
const full = Array.from({ length: 500 }, (_, i) => {
  const zone = pick(ZONES);
  const operation = rnd() < 0.7 ? "rent" : "sale";
  const nPhotos = Math.floor(rnd() * 12);
  const photos = Array.from({ length: nPhotos }, (_, p) => ({ url: `https://img.example/${i}/${p % (i % 5 === 0 ? 3 : 99)}.jpg`, is_cover: p === 1, position: (p * 5) % (nPhotos || 1) }));
  return {
    id: `id-${i}`,
    slug: `piso-${i}`,
    external_id: i % 4 ? `EXT-${i}` : null,
    bc_reference: i % 10 ? `BC-${i}` : null,
    property_reference: i % 8 ? `PROP-2026-${i}` : null,
    title: `Piso ${i} en ${zone}${i % 6 ? `, planta ${i % 7}` : ""}`,
    // Texto con planta en casi todas: cuando ni el título ni las
    // características la dicen (i % 6 === 0 y par), decide la descripción.
    description: i % 7 ? `Piso luminoso en planta ${(i % 4) + 1}, con terraza` : null,
    features: i % 2 ? ["Ascensor", `Planta ${i % 9}`] : [],
    features_manual: i % 5 ? [] : ["Bajo"],
    floor_override: i % 11 === 0 ? "2" : null,
    zone,
    subzone: pick(SUB[zone]),
    operation,
    operations: i % 13 === 0 ? ["sale", "rent"] : [operation],
    stay: operation === "rent" ? pick(["long", "short", null]) : null,
    status: pick(["available", "reserved", "sold", "archived"]),
    bedrooms: Math.floor(rnd() * 5),
    bathrooms: 1 + Math.floor(rnd() * 3),
    square_meters: i % 17 === 0 ? null : 40 + Math.floor(rnd() * 120),
    price: operation === "rent" ? 900 + i * 10 : 250000 + i * 1000,
    currency: i % 7 ? "EUR" : "CLP",
    created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600_000).toISOString(),
    // Portada propia (distinta de la 1.ª foto) o vacía (usa la 1.ª foto).
    cover_photo_url: i % 3 === 0 ? null : `https://img.example/${i}/portada.jpg`,
    // Columnas que la lista NO usa.
    owner_name: `Dueño ${i}`,
    owner_phone: `+34 600 000 ${String(i).padStart(3, "0")}`,
    owner_email: `d${i}@sim.invalid`,
    internal_notes: `Nota ${i}`,
    address: `Calle Sintética ${i}`,
    latitude: 40 + i / 1000,
    longitude: -3 - i / 1000,
    rent_price: operation === "sale" ? 1500 : null,
    title_rent: null,
    archived_at: null,
    country: "es",
    source: "manual",
    source_url: null,
    published_web: i % 2 === 0,
    agencies: i % 9 ? { name: `Agencia ${i % 6}`, slug: `agencia-${i % 6}` } : null,
    property_photos: photos,
  };
});
// Lo mismo, proyectado como lo haría PostgREST con ADMIN_LIST_SELECT.
const projected = full.map((r) => {
  const o: Record<string, unknown> = {};
  for (const c of ADMIN_LIST_COLUMNS) o[c] = (r as Record<string, unknown>)[c];
  o.agencies = r.agencies ? { name: r.agencies.name, slug: r.agencies.slug } : null;
  o.property_photos = r.property_photos.map((p) => ({ url: p.url, is_cover: p.is_cover, position: p.position }));
  return o;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapt = (r: unknown) => propertyRowToAdminProperty(r as any);
const before = full.map(adapt);
const after = projected.map(adapt);

console.log("Columnas explícitas de la lista (CRM-03, PR-A)");
t("el adaptador da lo mismo con la fila completa y con la proyectada", () => {
  for (let i = 0; i < full.length; i++) assert.deepEqual(after[i], before[i], full[i].slug);
});
t("las columnas que lee el adaptador están todas en la lista", () => {
  // Quitar cualquier columna de la lista cambia el resultado de alguna fila:
  // demuestra que la paridad de arriba sí detecta una columna olvidada.
  for (const c of ADMIN_LIST_COLUMNS) {
    if (c === "id") continue; // solo para cruzar etiquetas en la página
    // Que el adaptador falle sin la columna también cuenta como «la nota».
    const missing = projected.map((r) => {
      const o = { ...r };
      delete o[c];
      try {
        return JSON.stringify(adapt(o));
      } catch {
        return "(error)";
      }
    });
    const differs = missing.some((m, i) => m !== JSON.stringify(before[i]));
    assert.ok(differs, `quitar «${c}» no cambia nada: ¿sobra en ADMIN_LIST_COLUMNS o faltan datos en el test?`);
  }
});
t("el select no repite columnas y conserva agencia y fotos de antes", () => {
  assert.equal(new Set(ADMIN_LIST_COLUMNS).size, ADMIN_LIST_COLUMNS.length);
  assert.ok(ADMIN_LIST_SELECT.endsWith(", agencies(name, slug), property_photos(url, is_cover, position)"));
  assert.ok(!/(^|,\s*)\*(,|$)/.test(ADMIN_LIST_SELECT), "sin *");
  for (const c of ["owner_phone", "owner_email", "owner_name", "internal_notes", "address"]) assert.ok(!ADMIN_LIST_SELECT.includes(c), c);
});

const NONE: AdminPropertyFilters = {
  query: "", tagIds: [], operation: "", status: "", zone: "", subzone: "", agency: "", stay: "",
  bedrooms: "", bathrooms: "", floor: "", minPrice: "", maxPrice: "", minM2: "", maxM2: "",
};
const CASES: Partial<AdminPropertyFilters>[] = [
  {}, { operation: "alquiler" }, { operation: "venta", zone: "Salamanca" }, { zone: "Salamanca", subzone: "Goya" },
  { agency: "agencia-2" }, { stay: "corta" }, { stay: "larga" }, { bedrooms: "2plus", bathrooms: "2" },
  { floor: "3" }, { floor: "bajo" }, { minPrice: "1000", maxPrice: "2000" }, { minM2: "60", maxM2: "120" },
  { status: "reserved" }, { query: "ático" }, { query: "BC-12" }, { query: "goya" }, { query: "PROP-2026-3" }, { query: "EXT-5" },
];
t("filtros y búsqueda: mismas propiedades", () => {
  for (const c of CASES) {
    const f = { ...NONE, ...c };
    const a = before.filter((p) => matchesAdminPropertyFilters(p, f, () => undefined)).map((p) => p.id);
    const b = after.filter((p) => matchesAdminPropertyFilters(p, f, () => undefined)).map((p) => p.id);
    assert.deepEqual(b, a, JSON.stringify(c));
  }
});
t("totales, opciones y selección (por id) iguales", () => {
  const opts = (xs: typeof after) => ({
    total: xs.length,
    rent: xs.filter((p) => p.operation === "alquiler").length,
    sale: xs.filter((p) => p.operation === "venta").length,
    zones: [...new Set(xs.map((p) => p.zone))].sort(),
    subzones: [...new Set(xs.map((p) => p.subzone))].sort(),
    agencies: [...new Set(xs.map((p) => `${p.agencyId}|${p.agencyName}`))].sort(),
    floors: [...new Set(xs.map((p) => String(p.floor)))].sort(),
    ids: xs.map((p) => p.id),
  });
  assert.deepEqual(opts(after), opts(before));
});

console.log(`\n${n} comprobaciones en verde`);
