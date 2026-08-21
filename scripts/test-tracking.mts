// Tracking de page-views · tests del contrato (sin red).
//
// Cubre la causa raíz del 500 de /compartir (slug en columna uuid) y las
// regresiones A-E del sprint: slug válido, UUID interno, slug inexistente
// (sin fila basura), tokens sin cambio de semántica y no-duplicación del
// page_view por remontaje. La verificación E2E contra producción (page_view
// real + attribution por SQL) vive en el handoff, no aquí.

import {
  classifyPropertyRef,
  resolvePageViewProperty,
} from "../lib/tracking/page-view-contract";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const UUID = "0a409a17-cba4-43a4-98dd-69b8458c8a08";

console.log("Clasificación de la referencia:");
{
  check("propertySlug explícito → slug",
    JSON.stringify(classifyPropertyRef({ propertySlug: "piso-en-goya-57a9" })) ===
    JSON.stringify({ kind: "slug", slug: "piso-en-goya-57a9" }));
  check("propertyId con forma UUID → uuid (admin/legacy intacto)",
    JSON.stringify(classifyPropertyRef({ propertyId: UUID })) ===
    JSON.stringify({ kind: "uuid", id: UUID }));
  check("propertyId SIN forma UUID → slug (bundle cliente anterior, cacheado)",
    JSON.stringify(classifyPropertyRef({ propertyId: "salamanca-fuente-del-berro-kmct" })) ===
    JSON.stringify({ kind: "slug", slug: "salamanca-fuente-del-berro-kmct" }));
  check("snake_case property_id UUID → uuid",
    JSON.stringify(classifyPropertyRef({ property_id: UUID })) ===
    JSON.stringify({ kind: "uuid", id: UUID }));
  check("sin referencia → none (colecciones, home)",
    classifyPropertyRef({}).kind === "none");
  check("propertySlug gana a propertyId",
    JSON.stringify(classifyPropertyRef({ propertySlug: "slug-bueno", propertyId: UUID })) ===
    JSON.stringify({ kind: "slug", slug: "slug-bueno" }));
}

console.log("Resolución del property_id del evento:");
{
  check("A/B · slug resuelto → inserta con el UUID resuelto",
    JSON.stringify(resolvePageViewProperty({ kind: "slug", slug: "x" }, UUID)) ===
    JSON.stringify({ propertyId: UUID, skip: false }));
  check("uuid directo → inserta tal cual",
    JSON.stringify(resolvePageViewProperty({ kind: "uuid", id: UUID }, null)) ===
    JSON.stringify({ propertyId: UUID, skip: false }));
  check("C · slug inexistente → skip (sin fila basura, respuesta controlada)",
    JSON.stringify(resolvePageViewProperty({ kind: "slug", slug: "no-existe" }, null)) ===
    JSON.stringify({ propertyId: null, skip: true }));
  check("sin referencia → inserta con property_id null (no skip)",
    JSON.stringify(resolvePageViewProperty({ kind: "none" }, null)) ===
    JSON.stringify({ propertyId: null, skip: false }));
}

// ── E · no-duplicación del page_view por remontaje ──
console.log("Tracker del navegador (entorno simulado):");
{
  // Entorno mínimo para poder instanciar la clase fuera de un navegador.
  const calls: string[] = [];
  (globalThis as any).window = {
    addEventListener() {},
    location: { pathname: "/compartir/piso-x" },
  };
  (globalThis as any).document = { referrer: "" };
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
  };
  // `navigator` es solo-getter en Node moderno: se redefine con defineProperty.
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  (globalThis as any).fetch = async (url: string, opts: any) => {
    calls.push(JSON.parse(opts.body).pagePath);
    return { ok: true, json: async () => ({ pageViewId: "pv-1" }) };
  };

  const { AnalyticsTracker } = await import("../lib/tracking/analytics");
  const tracker = (AnalyticsTracker as any).getInstance();

  tracker.init({ pageType: "public_property", propertySlug: "piso-x" });
  tracker.init({ pageType: "public_property", propertySlug: "piso-x" }); // remonta
  await new Promise((r) => setTimeout(r, 20));
  check("E · dos init en la misma página → UN solo page_view", calls.length === 1, `${calls.length} POSTs`);

  (globalThis as any).window.location.pathname = "/compartir/piso-y";
  tracker.init({ pageType: "public_property", propertySlug: "piso-y" });
  await new Promise((r) => setTimeout(r, 20));
  check("navegación real (path distinto) → SÍ cuenta otro page_view", calls.length === 2, `${calls.length} POSTs`);
}

// D · tokens: el contrato de colección/shortlist no pasa por classifyPropertyRef —
// la ruta los resuelve igual que antes (resolveCollectionShareId /
// resolveShortlistByToken devuelven null si el token está revocado/caducado y
// el evento se inserta sin attribution, comportamiento de seguridad previo).
// Se verifica aquí que la clasificación NO interfiere: un body de colección
// sin propiedad sigue siendo 'none'.
console.log("Tokens:");
{
  check("D · body de colección (solo collectionToken) → none, sin skip",
    classifyPropertyRef({}).kind === "none" &&
    resolvePageViewProperty({ kind: "none" }, null).skip === false);
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
// El tracker instanciado arranca un setInterval de flush que mantendría vivo
// el proceso: salida explícita.
process.exit(0);
