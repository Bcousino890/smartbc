// CRM-02 · E1: lista de Propiedades sin galerías y galería bajo demanda.
//   · Paridad de la lista (AC3): el adaptador nuevo da EXACTAMENTE los mismos
//     campos que el anterior salvo `photos`, que pasa a `photoCount` (mismo
//     número) y a la portada efectiva (la misma que pintaba la fila); y los
//     filtros y la búsqueda devuelven las mismas propiedades.
//   · Galería: orden por posición y sin URLs repetidas, igual que antes.
//   · Turnos: una respuesta tardía no pisa otra galería ni ediciones nuevas.
//   · País: la ruta de la galería aplica la misma regla que el layout.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-admin-properties-gallery.mts
import assert from "node:assert/strict";
import { adminGalleryFromRows, propertyRowToAdminProperty } from "../lib/db/adapters.ts";
import { type AdminPropertyFilters, matchesAdminPropertyFilters } from "../lib/properties/admin-filter.ts";
import { canSeeAdminCountry, createGalleryTurns, galleryApiUrl } from "../lib/properties/admin-gallery.ts";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✅ ${name}`);
};

// ── Filas sintéticas variadas ────────────────────────────────────────────────
type Photo = { url: string; is_cover: boolean; position: number };
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const ZONES = ["Salamanca", "Chamberí", "Retiro", "Centro"];
const SUB: Record<string, string[]> = { Salamanca: ["Goya", "Lista"], Chamberí: ["Almagro"], Retiro: ["Ibiza"], Centro: ["Sol"] };
const rows = Array.from({ length: 400 }, (_, i) => {
  const zone = pick(ZONES);
  const nPhotos = Math.floor(rnd() * 14);
  // Fotos desordenadas y, a veces, repetidas (el caso que dedupe corrige).
  const photos: Photo[] = Array.from({ length: nPhotos }, (_, p) => ({ url: `https://img.example/${i}/${p % (i % 5 === 0 ? 3 : 99)}.jpg`, is_cover: p === 1, position: (p * 7) % (nPhotos || 1) }));
  const operation = rnd() < 0.7 ? "rent" : "sale";
  return {
    id: `id-${i}`,
    slug: `piso-${i}`,
    external_id: i % 4 ? `EXT-${i}` : null,
    bc_reference: `BC-${i}`,
    property_reference: `PROP-2026-${i}`,
    title: `Piso ${i} en ${zone}, planta ${i % 7}`,
    description: i % 3 ? "Ático luminoso con terraza" : null,
    features: i % 2 ? ["Ascensor", `Planta ${i % 9}`] : [],
    features_manual: [],
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
    currency: "EUR",
    created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600_000).toISOString(),
    // Portada: a veces marcada en la propiedad, a veces vacía (usa la 1.ª foto).
    cover_photo_url: i % 3 === 0 ? null : photos[0]?.url ?? null,
    agencies: i % 9 ? { name: `Agencia ${i % 6}`, slug: `agencia-${i % 6}` } : null,
    property_photos: photos,
  };
});

// Adaptador ANTERIOR (main d31075fd), solo la parte que cambia: la galería.
const oldPhotos = (r: (typeof rows)[number]) => {
  const seen = new Set<string>();
  return r.property_photos
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)))
    .map((p) => ({ url: p.url, isCover: p.is_cover }));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapt = (r: (typeof rows)[number]) => propertyRowToAdminProperty(r as any);

console.log("Paridad de la lista (AC3)");
t("mismos campos salvo photos → photoCount, y mismos valores", () => {
  for (const r of rows) {
    const now = adapt(r) as unknown as Record<string, unknown>;
    assert.ok(!("photos" in now), "la lista no debe llevar la galería");
    const photos = oldPhotos(r);
    assert.equal(now.photoCount, photos.length, r.slug);
    // La fila pintaba `coverPhotoUrl ?? photos[0]?.url ?? null`.
    assert.equal(now.coverPhotoUrl, r.cover_photo_url ?? photos[0]?.url ?? null, r.slug);
  }
});
t("la lista lleva los mismos campos que antes, con photoCount en lugar de photos", () => {
  // El resto del adaptador no cambia; aquí se fija el conjunto de claves.
  const keys = Object.keys(adapt(rows[0])).sort();
  assert.deepEqual(
    keys,
    ["agencyId", "agencyName", "bathrooms", "bcReference", "bedrooms", "coverPhotoUrl", "currency", "featured", "floor", "id", "isDualOperation", "operation", "photoCount", "price", "propertyReference", "publishedLabel", "reference", "squareMeters", "stayType", "status", "subzone", "title", "zone"].sort(),
  );
});

const NONE: AdminPropertyFilters = {
  query: "", tagIds: [], operation: "", status: "", zone: "", subzone: "", agency: "", stay: "",
  bedrooms: "", bathrooms: "", floor: "", minPrice: "", maxPrice: "", minM2: "", maxM2: "",
};
const CASES: Partial<AdminPropertyFilters>[] = [
  {},
  { operation: "alquiler" },
  { operation: "venta", zone: "Salamanca" },
  { zone: "Salamanca", subzone: "Goya" },
  { agency: "agencia-2" },
  { stay: "corta" },
  { bedrooms: "2plus", bathrooms: "2" },
  { floor: "3" },
  { minPrice: "1000", maxPrice: "2000" },
  { minM2: "60", maxM2: "120" },
  { status: "reserved" },
  { query: "ático" },
  { query: "BC-12" },
  { query: "goya" },
];
t("filtros y búsqueda: mismas propiedades antes y después", () => {
  const before = rows.map((r) => ({ ...adapt(r), photos: oldPhotos(r), photoCount: undefined }));
  const after = rows.map(adapt);
  for (const c of CASES) {
    const f = { ...NONE, ...c };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = before.filter((p) => matchesAdminPropertyFilters(p as any, f, () => undefined)).map((p) => p.id);
    const b = after.filter((p) => matchesAdminPropertyFilters(p, f, () => undefined)).map((p) => p.id);
    assert.deepEqual(b, a, JSON.stringify(c));
  }
});
t("totales y opciones (operación, distrito, zona, agencia) iguales", () => {
  const after = rows.map(adapt);
  const opts = (xs: typeof after) => ({
    rent: xs.filter((p) => p.operation === "alquiler").length,
    sale: xs.filter((p) => p.operation === "venta").length,
    zones: [...new Set(xs.map((p) => p.zone))].sort(),
    subzones: [...new Set(xs.map((p) => p.subzone))].sort(),
    agencies: [...new Set(xs.map((p) => `${p.agencyId}|${p.agencyName}`))].sort(),
    ids: xs.map((p) => p.id),
  });
  const before = rows.map((r) => ({ ...adapt(r), photos: oldPhotos(r) }));
  assert.deepEqual(opts(after), opts(before as unknown as typeof after));
});

console.log("Galería (mismo orden y deduplicado que antes)");
t("ordenada por posición, sin URLs repetidas, portada marcada", () => {
  for (const r of rows) assert.deepEqual(adminGalleryFromRows(r.property_photos), oldPhotos(r));
  assert.deepEqual(adminGalleryFromRows(null), []);
  assert.deepEqual(
    adminGalleryFromRows([
      { url: "b", is_cover: false, position: 2 },
      { url: "a", is_cover: true, position: 1 },
      { url: "b", is_cover: false, position: 3 },
    ]),
    [{ url: "a", isCover: true }, { url: "b", isCover: false }],
  );
});
t("URL de la galería con slug y país codificados", () =>
  assert.equal(galleryApiUrl("piso/1", "es"), "/api/admin/properties/piso%2F1/photos?country=es"));

console.log("Turnos de petición (respuestas tardías)");
t("la respuesta de la última petición se aplica", () => {
  const g = createGalleryTurns();
  const s = g.start("a");
  assert.equal(g.accepts(s, "a"), true);
});
t("una petición más nueva invalida la anterior", () => {
  const g = createGalleryTurns();
  const old = g.start("a");
  const fresh = g.start("a");
  assert.equal(g.accepts(old, "a"), false);
  assert.equal(g.accepts(fresh, "a"), true);
});
t("cerrar el modal invalida lo que esté en vuelo", () => {
  const g = createGalleryTurns();
  const s = g.start("a");
  g.invalidate();
  assert.equal(g.accepts(s, "a"), false);
});
t("una edición hecha mientras tanto gana a la respuesta", () => {
  const g = createGalleryTurns();
  const s = g.start("a");
  g.edited();
  assert.equal(g.accepts(s, "a"), false);
});
t("otra propiedad no acepta la respuesta", () => {
  const g = createGalleryTurns();
  const s = g.start("a");
  assert.equal(g.accepts(s, "b"), false);
});

console.log("País (misma regla que el layout del admin)");
t("owner y admin ven cualquier país", () => {
  assert.equal(canSeeAdminCountry({ role: "owner", country: "es" }, "cl"), true);
  assert.equal(canSeeAdminCountry({ role: "admin", country: "es" }, "cl"), true);
});
t("el resto, solo sus países", () => {
  assert.equal(canSeeAdminCountry({ role: "advisor", country: "es" }, "es"), true);
  assert.equal(canSeeAdminCountry({ role: "advisor", country: "es" }, "cl"), false);
  assert.equal(canSeeAdminCountry({ role: "advisor", country: "es", countries: ["es", "cl"] }, "cl"), true);
  assert.equal(canSeeAdminCountry({ role: "advisor", country: "cl", countries: [] }, "cl"), true);
  assert.equal(canSeeAdminCountry({ role: "advisor", country: null }, "es"), true);
  assert.equal(canSeeAdminCountry({ role: "advisor", country: null }, "cl"), false);
});
t("multi_country no amplía el acceso (el layout tampoco lo hace)", () =>
  assert.equal(canSeeAdminCountry({ role: "advisor", country: "es", countries: ["es"], multi_country: true } as never, "cl"), false));

console.log(`\n${n} comprobaciones en verde`);
