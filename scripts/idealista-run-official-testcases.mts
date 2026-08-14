// Ejecuta el listado OFICIAL de casos de prueba que Idealista pide rellenar
// (IDEALISTA_testcases_bcousino.xlsx) contra el sandbox real, y vuelca cada
// resultado a un JSON que luego rellena_test_cases.py usa para completar el
// Excel exactamente con el formato que pide Idealista.
//
//   IDEALISTA_CLIENT_ID=... IDEALISTA_CLIENT_SECRET=... IDEALISTA_FEED_KEY=ilc... \
//   node --experimental-strip-types scripts/idealista-run-official-testcases.mts
//
// No usa el cliente de la app (lib/services/idealista/partner-api/*): son
// llamadas crudas, deliberadas, para poder forzar también los casos de error
// (token inválido, feedKey inválido, reglas de negocio que rompen a propósito).

import { writeFileSync } from "node:fs";

const CLIENT_ID = process.env.IDEALISTA_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.IDEALISTA_CLIENT_SECRET ?? "";
const FEED_KEY = process.env.IDEALISTA_FEED_KEY ?? "";
const BASE_URL = "https://partners-sandbox.idealista.com";
const OUT_FILE = process.env.OUT_FILE ?? "/tmp/idealista-testcases-results.json";

if (!CLIENT_ID || !CLIENT_SECRET || !FEED_KEY) {
  console.error("Faltan IDEALISTA_CLIENT_ID, IDEALISTA_CLIENT_SECRET o IDEALISTA_FEED_KEY.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let writeToken = "";
let readToken = "";

async function getToken(scope: "read" | "write"): Promise<string> {
  const basic = Buffer.from(`${encodeURIComponent(CLIENT_ID)}:${encodeURIComponent(CLIENT_SECRET)}`).toString("base64");
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `grant_type=client_credentials&scope=${scope}`,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} pidiendo el token: ${body}`);
  const data = JSON.parse(body) as { access_token?: string };
  if (!data.access_token) throw new Error(`Sin access_token: ${body}`);
  return data.access_token;
}

interface TestResult {
  id: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  message: string;
  entityId?: number | string;
  requestBody?: unknown;
  responseBody?: unknown;
  comment?: string;
}

const results: TestResult[] = [];

interface CallOpts {
  method?: string;
  body?: unknown;
  authOverride?: string;
  feedKeyOverride?: string;
}

async function call(path: string, opts: CallOpts = {}): Promise<{ status: number; data: unknown; raw: string }> {
  const token = opts.authOverride !== undefined ? opts.authOverride : opts.method && opts.method !== "GET" ? writeToken : readToken;
  const headers: Record<string, string> = {
    feedKey: opts.feedKeyOverride !== undefined ? opts.feedKeyOverride : FEED_KEY,
    Authorization: `Bearer ${token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const raw = await res.text();
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* algunas respuestas vienen vacías */
  }
  return { status: res.status, data, raw };
}

function messageOf(data: unknown, raw: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const base = typeof d.message === "string" && d.message ? d.message : typeof d.error_description === "string" ? d.error_description : "";
    if (Array.isArray(d.errors) && d.errors.length) {
      const detail = d.errors.map(String).join(" | ");
      return base && base !== "Validation Error" ? `${base}: ${detail}` : detail;
    }
    if (base) return base;
  }
  return raw.slice(0, 400);
}

async function run(
  id: string,
  method: string,
  path: string,
  opts: CallOpts,
  expectField: "contactId" | "propertyId" | undefined,
  comment?: string
): Promise<{ status: number; data: unknown }> {
  const { status, data, raw } = await call(path, { ...opts, method });
  const entityId = expectField && data && typeof data === "object" ? (data as Record<string, unknown>)[expectField] : undefined;
  const result: TestResult = {
    id,
    method,
    path,
    status,
    ok: status >= 200 && status < 300,
    message: messageOf(data, raw),
    entityId: entityId as number | string | undefined,
    requestBody: opts.body,
    responseBody: data,
    comment,
  };
  results.push(result);
  console.log(`${result.ok ? "✓" : "·"} ${id.padEnd(16)} ${method.padEnd(6)} ${path.padEnd(45)} HTTP ${status}  ${result.message.slice(0, 90)}`);
  await sleep(350);
  return { status, data };
}

/* ─────────────────────────── constructores de payload ─────────────────────────── */

function code(prefix: string): string {
  return `TC-${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

const BASE_ADDRESS = {
  visibility: "full" as const,
  town: "Alicante",
  country: "Spain" as const,
  latitude: 38.3452,
  longitude: -0.4815,
  precision: "exact" as const,
};

function property(
  type: string,
  features: Record<string, unknown>,
  opts: {
    contactId: number;
    testId: string;
    operationType?: "sale" | "rent";
    price?: number;
    address?: Record<string, unknown>;
    scope?: "idealista" | "microsite";
    noCode?: boolean;
  }
): Record<string, unknown> {
  return {
    type,
    code: opts.noCode ? undefined : code(opts.testId),
    contactId: opts.contactId,
    address: { ...BASE_ADDRESS, ...(opts.address ?? {}) },
    operation: { type: opts.operationType ?? "rent", price: opts.price ?? 1200 },
    features,
    scope: opts.scope,
  };
}

// windowsLocation no está en el `required` del schema de flat.json, pero el
// sandbox lo exige igualmente (regla de negocio no documentada): sin él,
// cualquier alta de piso responde 400 "windows location must be provided".
const FLAT_MIN = { areaConstructed: 90, bathroomNumber: 1, rooms: 2, conservation: "good", energyCertificateRating: "D", liftAvailable: true, windowsLocation: "external" };

/* ─────────────────────────────────── main ─────────────────────────────────── */

async function main() {
  writeToken = await getToken("write");
  readToken = await getToken("read");
  console.log(`Entorno: ${BASE_URL}\n`);

  // ── Contact ──────────────────────────────────────────────────────────────
  const contactEmail = `smartbc-test-${Date.now()}@bcousinoprop.com`;
  const { data: c1 } = await run(
    "Contact01",
    "POST",
    "/v1/contacts",
    { body: { name: "Cliente de Pruebas SmartBC", lastName: "Sandbox", email: contactEmail, primaryPhonePrefix: "34", primaryPhoneNumber: "600123456" } },
    "contactId"
  );
  const contactId = Number((c1 as { contactId?: number })?.contactId ?? 0);
  if (!contactId) {
    console.error("No se pudo crear el contacto de pruebas; abortando.");
    writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    process.exit(1);
  }

  await run("Contact02", "POST", "/v1/contacts", { body: { name: "Sin Email", primaryPhonePrefix: "34", primaryPhoneNumber: "600123457" } }, undefined);
  await run(
    "Contact03",
    "POST",
    "/v1/contacts",
    { body: { name: "Email Malo", email: "test@test", primaryPhonePrefix: "34", primaryPhoneNumber: "600123458" } },
    undefined
  );
  await run(
    "Contact04",
    "PUT",
    `/v1/contacts/${contactId}`,
    { body: { name: "Cliente de Pruebas SmartBC", lastName: "Sandbox Actualizado", email: contactEmail, primaryPhonePrefix: "34", primaryPhoneNumber: "600999888" } },
    undefined
  );
  await run("Contact05", "GET", `/v1/contacts/${contactId}`, {}, undefined);
  await run("Contact06", "GET", "/v1/contacts?page=1&size=100", {}, undefined);

  // ── Property: casos base ────────────────────────────────────────────────
  await run(
    "Property01",
    "POST",
    "/v1/properties",
    { body: property("flat", FLAT_MIN, { contactId, testId: "P01" }), authOverride: "invalid-token-de-prueba" },
    undefined,
    "Token deliberadamente inválido."
  );
  await run(
    "Property02",
    "POST",
    "/v1/properties",
    { body: property("flat", FLAT_MIN, { contactId, testId: "P02" }), feedKeyOverride: "ilc0000000000000000000000000000000000000" },
    undefined,
    "feedKey deliberadamente inválido (formato correcto, valor inexistente)."
  );

  const p03 = await run("Property03", "POST", "/v1/properties", { body: property("flat", FLAT_MIN, { contactId, testId: "P03", operationType: "sale", price: 250000 }) }, "propertyId");
  const p04 = await run("Property04", "POST", "/v1/properties", { body: property("flat", FLAT_MIN, { contactId, testId: "P04", operationType: "rent" }) }, "propertyId");
  const p05 = await run("Property05", "POST", "/v1/properties", { body: property("flat", FLAT_MIN, { contactId, testId: "P05", scope: "idealista" }) }, "propertyId");
  const p06 = await run("Property06", "POST", "/v1/properties", { body: property("flat", FLAT_MIN, { contactId, testId: "P06", scope: "microsite" }) }, "propertyId");
  const p07 = await run("Property07", "POST", "/v1/properties", { body: property("flat", FLAT_MIN, { contactId, testId: "P07", address: { visibility: "full" } }) }, "propertyId");
  const p08 = await run("Property08", "POST", "/v1/properties", { body: property("flat", FLAT_MIN, { contactId, testId: "P08", address: { visibility: "street" } }) }, "propertyId");
  const p09 = await run("Property09", "POST", "/v1/properties", { body: property("flat", FLAT_MIN, { contactId, testId: "P09", address: { visibility: "hidden" } }) }, "propertyId");

  // ── Flat ─────────────────────────────────────────────────────────────────
  const flat01Features = {
    areaConstructed: 96, areaUsable: 88, bathroomNumber: 2, rooms: 3, conservation: "good",
    energyCertificateRating: "D", liftAvailable: true, windowsLocation: "external",
  };
  const flat01 = await run(
    "Flat01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "flat",
        {
          areaConstructed: 96, areaUsable: 88, bathroomNumber: 2, rooms: 3, conservation: "good",
          energyCertificateRating: "D", energyCertificatePerformance: 145.5, liftAvailable: true,
          heatingType: "individual_gas", windowsLocation: "external", terrace: true, balcony: false,
          parkingAvailable: true, storage: true, pool: false, garden: false, wardrobes: true,
          orientationSouth: true, orientationEast: true, builtYear: 1998, penthouse: false,
        },
        { contactId, testId: "FLAT01", operationType: "sale", price: 249000 }
      ),
    },
    "propertyId"
  );
  await run(
    "Flat02",
    "POST",
    "/v1/properties",
    { body: property("flat", { areaConstructed: 5, bathroomNumber: 1, rooms: 1, conservation: "good", energyCertificateRating: "D", liftAvailable: false }, { contactId, testId: "FLAT02" }) },
    undefined,
    "areaConstructed=5 (< mínimo de schema 11) — error de validación básica esperado."
  );
  await run(
    "Flat03",
    "POST",
    "/v1/properties",
    { body: property("flat", { areaConstructed: 50, areaUsable: 80, bathroomNumber: 1, rooms: 2, conservation: "good", energyCertificateRating: "D", liftAvailable: false, windowsLocation: "external" }, { contactId, testId: "FLAT03" }) },
    undefined,
    "areaConstructed (50) < areaUsable (80) — ambos valores son válidos por schema, es una regla de negocio."
  );
  await run(
    "Flat04",
    "POST",
    "/v1/properties",
    { body: property("flat", { areaConstructed: 90, bathroomNumber: 0, rooms: 2, conservation: "good", energyCertificateRating: "D", liftAvailable: false, windowsLocation: "external" }, { contactId, testId: "FLAT04" }) },
    undefined,
    "conservation=good + bathroomNumber=0 — regla de negocio no documentada en el schema."
  );
  await run(
    "Flat05",
    "POST",
    "/v1/properties",
    {
      body: property(
        "flat",
        { areaConstructed: 90, bathroomNumber: 1, rooms: 2, conservation: "good", energyCertificateRating: "D", liftAvailable: false, windowsLocation: "external", parkingAvailable: false, parkingIncludedInPrice: true },
        { contactId, testId: "FLAT05" }
      ),
    },
    undefined,
    "parkingAvailable=false + parkingIncludedInPrice=true — regla de negocio no documentada en el schema."
  );

  // ── House / CountryHouse / Garage / Office / Commercial ────────────────────
  await run(
    "House01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "house",
        { type: "independent", areaConstructed: 220, areaPlot: 400, bathroomNumber: 3, rooms: 4, conservation: "good", energyCertificateRating: "C", liftAvailable: false, floorsBuilding: 2, garden: true, pool: true, terrace: true, builtYear: 2005 },
        { contactId, testId: "HOUSE01", operationType: "sale", price: 690000 }
      ),
    },
    "propertyId"
  );
  await run(
    "CountryHouse01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "countryhouse",
        { type: "countryhouse", areaConstructed: 300, areaPlot: 5000, bathroomNumber: 2, rooms: 5, conservation: "toRestore", energyCertificateRating: "E", floorsBuilding: 1, garden: true, chimney: true },
        { contactId, testId: "COUNTRYHOUSE01", operationType: "sale", price: 450000 }
      ),
    },
    "propertyId"
  );
  await run(
    "Garage01",
    "POST",
    "/v1/properties",
    // parkingType: el sandbox lo rechaza para España ("cannot be defined for this country") —
    // aparenta ser un campo específico de otro mercado (Italia?) pese a estar en el schema común.
    { body: property("garage", { areaConstructed: 15, garageCapacity: "car_sedan", liftAvailable: true, securityCamera: true }, { contactId, testId: "GARAGE01", operationType: "sale", price: 18000 }) },
    "propertyId"
  );
  await run(
    "Office01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "office",
        { areaConstructed: 180, conservation: "good", officeBuilding: true, roomsSplitted: "withWalls", conditionedAirType: "cold/heat", energyCertificateRating: "C", liftNumber: 2, parkingSpacesNumber: 3, bathroomNumber: 2, builtYear: 2010, windowsLocation: "external" },
        { contactId, testId: "OFFICE01", operationType: "rent", price: 2400 }
      ),
    },
    "propertyId"
  );
  await run(
    "Commercial01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "commercial",
        { type: "retail", areaConstructed: 120, energyCertificateRating: "D", conservation: "good", location: "on_the_street", rooms: 1, bathroomNumber: 1, conditionedAir: true, storage: true },
        { contactId, testId: "COMMERCIAL01", operationType: "rent", price: 1800 }
      ),
    },
    "propertyId"
  );
  await run(
    "Commercial02",
    "POST",
    "/v1/properties",
    {
      // isATransfer + operation=rent exige priceTransfer (regla de negocio no
      // documentada en el schema, descubierta al probar).
      body: property(
        "commercial",
        { type: "retail", areaConstructed: 60, energyCertificateRating: "D", conservation: "good", location: "on_the_street", rooms: 1, isATransfer: true, commercialMainActivity: "restaurant", priceTransfer: 25000 },
        { contactId, testId: "COMMERCIAL02", operationType: "rent", price: 900 }
      ),
    },
    "propertyId"
  );
  await run(
    "Commercial03",
    "POST",
    "/v1/properties",
    {
      // priceTransfer presente (para no chocar con esa otra regla) pero SIN
      // commercialMainActivity: aísla el error que pide el caso de prueba.
      body: property(
        "commercial",
        { type: "retail", areaConstructed: 60, energyCertificateRating: "D", conservation: "good", location: "on_the_street", rooms: 1, isATransfer: true, priceTransfer: 25000 },
        { contactId, testId: "COMMERCIAL03", operationType: "rent", price: 900 }
      ),
    },
    undefined,
    "isATransfer=true sin commercialMainActivity — regla de negocio esperada: actividad obligatoria en traspasos."
  );

  // ── Land ─────────────────────────────────────────────────────────────────
  // roadAccess=true exige accessType (regla de negocio no documentada en el
  // schema): sin él, el sandbox responde 400 "access type must be provided
  // when road access is present".
  await run(
    "Land01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "land",
        { type: "urban", areaPlot: 800, roadAccess: true, accessType: "urban", classificationOther: true, electricity: true, water: true, sewerage: true, sidewalk: true, streetLighting: true, naturalGas: false, location: "inside_town" },
        { contactId, testId: "LAND01", operationType: "sale", price: 180000 }
      ),
    },
    "propertyId"
  );
  // countrybuildable rechaza floorsBuildable/location junto a
  // classificationAgricultural con un genérico "field not allowed for
  // buildable land" (probado varias combinaciones); con sólo
  // classificationOther funciona.
  await run(
    "Land02",
    "POST",
    "/v1/properties",
    {
      body: property(
        "land",
        { type: "countrybuildable", areaPlot: 3000, roadAccess: true, accessType: "road", classificationOther: true },
        { contactId, testId: "LAND02", operationType: "sale", price: 90000 }
      ),
    },
    "propertyId"
  );
  await run(
    "Land03",
    "POST",
    "/v1/properties",
    { body: property("land", { type: "countrynonbuildable", areaPlot: 12000, roadAccess: true, accessType: "track", location: "outside_town" }, { contactId, testId: "LAND03", operationType: "sale", price: 45000 }) },
    "propertyId"
  );
  await run(
    "Land04",
    "POST",
    "/v1/properties",
    { body: property("land", { type: "countrynonbuildable", areaPlot: 12000, roadAccess: true, electricity: true }, { contactId, testId: "LAND04" }) },
    undefined,
    "electricity en un terreno countrynonbuildable — el schema documenta que ese campo no debe mandarse para este tipo."
  );
  await run(
    "Land05",
    "POST",
    "/v1/properties",
    { body: property("land", { type: "urban", areaPlot: 800, roadAccess: false, accessType: "urban", classificationOther: true }, { contactId, testId: "LAND05" }) },
    undefined,
    "accessType enviado con roadAccess=false — el schema documenta que accessType exige roadAccess=true."
  );

  // ── Storage / Building / Room ───────────────────────────────────────────
  await run(
    "StorageRoom01",
    "POST",
    "/v1/properties",
    { body: property("storage", { areaConstructed: 12, access24h: true, security24h: true }, { contactId, testId: "STORAGE01", operationType: "sale", price: 15000 }) },
    "propertyId"
  );
  // propertyTenants es obligatorio (y sólo se admite) en operación de venta —
  // regla de negocio no documentada en el schema.
  await run(
    "Building01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "building",
        { areaConstructed: 1200, energyCertificateRating: "D", floorsBuilding: 5, conservation: "good", parkingSpacesNumber: 4, classificationCommercial: true, liftNumber: 1, propertyTenants: true },
        { contactId, testId: "BUILDING01", operationType: "sale", price: 1500000 }
      ),
    },
    "propertyId"
  );
  await run(
    "Building02",
    "POST",
    "/v1/properties",
    { body: property("building", { areaConstructed: 1200, energyCertificateRating: "D", floorsBuilding: 5, conservation: "good", parkingSpacesNumber: 4 }, { contactId, testId: "BUILDING02" }) },
    undefined,
    "Sin ningún campo classification* — el schema exige al menos uno (anyOf)."
  );
  // occupiedNow=true encadena CUATRO campos obligatorios no documentados en
  // el schema, descubiertos uno a uno en el sandbox: tenantGender,
  // minTenantAge/maxTenantAge, ownerLiving y windowView.
  await run(
    "Room01",
    "POST",
    "/v1/properties",
    {
      body: property(
        "room",
        {
          type: "shared_flat", areaConstructed: 12, tenantNumber: 3, rooms: 4, bathroomNumber: 1,
          smokingAllowed: false, couplesAllowed: false, liftAvailable: true, bedType: "single",
          minimalStay: 1, availableFrom: "2026-09", occupiedNow: true, tenantGender: "both",
          minTenantAge: 18, maxTenantAge: 65, ownerLiving: false, windowView: "street_view",
          petsAllowed: false, furnished: true,
        },
        { contactId, testId: "ROOM01", operationType: "rent", price: 450 }
      ),
    },
    "propertyId"
  );
  await run(
    "Room02",
    "POST",
    "/v1/properties",
    {
      body: property(
        "room",
        { type: "shared_flat", areaConstructed: 12, tenantNumber: 3, rooms: 4, bathroomNumber: 1, smokingAllowed: false, couplesAllowed: false, liftAvailable: true, bedType: "single", minimalStay: 1, availableFrom: "2026-09", occupiedNow: true, petsAllowed: false },
        { contactId, testId: "ROOM02", operationType: "sale", price: 10000 }
      ),
    },
    undefined,
    "type=room con operation=sale — regla de negocio: las habitaciones sólo admiten alquiler."
  );

  // ── Find / Update / Deactivate / Reactivate ────────────────────────────
  const referenceId = Number((flat01.data as { propertyId?: number })?.propertyId ?? (p03.data as { propertyId?: number })?.propertyId ?? 0);

  await run("Property10", "GET", `/v1/properties/${referenceId}`, {}, undefined);
  await run("Property11", "GET", "/v1/properties/999999999", {}, undefined, "propertyId al límite del rango válido pero inexistente en esta cuenta.");
  await run("Property12", "GET", "/v1/properties?page=1&size=100", {}, undefined);

  await run(
    "Property13",
    "PUT",
    `/v1/properties/${referenceId}`,
    {
      body: {
        type: "flat",
        contactId,
        address: { ...BASE_ADDRESS },
        operation: { type: "sale", price: 255000 },
        features: flat01Features,
      },
    },
    undefined,
    "Mismo propertyId de Flat01, precio actualizado."
  );
  await run(
    "Property14",
    "PUT",
    `/v1/properties/${referenceId}`,
    {
      body: {
        type: "house",
        contactId,
        address: { ...BASE_ADDRESS },
        operation: { type: "sale", price: 255000 },
        features: { type: "independent", areaConstructed: 96, bathroomNumber: 2, rooms: 3, conservation: "good", energyCertificateRating: "D" },
      },
    },
    undefined,
    "Mismo propertyId (creado como flat), se envía type=house — se espera 400 por no poder cambiar la tipología."
  );
  await run(
    "Property15",
    "PUT",
    "/v1/properties/999999999",
    { body: { type: "flat", contactId, address: { ...BASE_ADDRESS }, operation: { type: "rent", price: 900 }, features: FLAT_MIN } },
    undefined,
    "propertyId inexistente en esta cuenta."
  );

  await run("Property16", "POST", `/v1/properties/${referenceId}/deactivate`, {}, undefined);
  await run("Property17", "POST", "/v1/properties/999999999/deactivate", {}, undefined, "propertyId inexistente en esta cuenta.");
  await run("Property18", "POST", `/v1/properties/${referenceId}/reactivate`, {}, undefined);
  await run("Property19", "POST", "/v1/properties/999999999/reactivate", {}, undefined, "propertyId inexistente en esta cuenta.");

  // ── Imágenes ─────────────────────────────────────────────────────────────
  const imgPropertyId = referenceId;
  const IMG_A = "https://picsum.photos/id/1015/1600/1200";
  const IMG_B = "https://picsum.photos/id/1016/1600/1200";

  // El PUT de imágenes admite una petición por minuto Y POR ANUNCIO. Como
  // Image03/04/05 reutilizan a propósito el mismo anuncio que Image01 (para
  // demostrar cambios de orden/label/borrado sobre el mismo PUT), hay que
  // esperar el minuto entero entre cada uno o el sandbox devuelve 429.
  const IMAGE_PUT_COOLDOWN_MS = 65_000;

  await run(
    "Image01",
    "PUT",
    `/v1/properties/${imgPropertyId}/images`,
    { body: { images: [{ url: IMG_A, label: "living" }, { url: IMG_B, label: "bedroom" }] } },
    undefined,
    "2 imágenes públicas de prueba (picsum.photos), no son fotos reales de ninguna ficha."
  );
  await sleep(2000);
  await run("Image02", "GET", `/v1/properties/${imgPropertyId}/images`, {}, undefined);

  console.log(`  … esperando ${IMAGE_PUT_COOLDOWN_MS / 1000}s (límite: 1 PUT de imágenes por minuto y anuncio) …`);
  await sleep(IMAGE_PUT_COOLDOWN_MS);
  await run(
    "Image03",
    "PUT",
    `/v1/properties/${imgPropertyId}/images`,
    { body: { images: [{ url: IMG_B, label: "bedroom" }, { url: IMG_A, label: "living" }] } },
    undefined,
    "Mismas 2 imágenes, orden invertido respecto a Image01."
  );

  console.log(`  … esperando ${IMAGE_PUT_COOLDOWN_MS / 1000}s …`);
  await sleep(IMAGE_PUT_COOLDOWN_MS);
  await run(
    "Image04",
    "PUT",
    `/v1/properties/${imgPropertyId}/images`,
    { body: { images: [{ url: IMG_B, label: "kitchen" }, { url: IMG_A, label: "terrace" }] } },
    undefined,
    "Mismas 2 imágenes, labels distintas a las de Image01/03."
  );

  console.log(`  … esperando ${IMAGE_PUT_COOLDOWN_MS / 1000}s …`);
  await sleep(IMAGE_PUT_COOLDOWN_MS);
  await run(
    "Image05",
    "PUT",
    `/v1/properties/${imgPropertyId}/images`,
    { body: { images: [{ url: IMG_A, label: "terrace" }] } },
    undefined,
    "Sólo 1 de las 2 imágenes: la omitida se borra según la documentación del PUT."
  );
  await run("Image06", "DELETE", `/v1/properties/${imgPropertyId}/images`, {}, undefined);

  // ── Limpieza: baja de todo lo que quedó activo ──────────────────────────
  console.log("\n▸ Limpieza: dando de baja los anuncios de prueba creados…");
  const propertyIds = results
    .filter((r) => r.ok && typeof r.entityId === "number" && r.path === "/v1/properties")
    .map((r) => r.entityId as number);
  for (const id of propertyIds) {
    try {
      await call(`/v1/properties/${id}/deactivate`, { method: "POST" });
      await sleep(200);
    } catch {
      /* mejor esfuerzo */
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n${results.length} resultados guardados en ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  process.exit(1);
});
