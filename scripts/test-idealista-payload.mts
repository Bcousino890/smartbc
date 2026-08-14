// Comprueba que lo que genera el mapper del Partner API encaja con los JSON
// Schema oficiales de Idealista (los de `lib/services/idealista/partner-api/schemas`,
// descargados de https://partners.idealista.com/api-reference/).
//
//   npm run test:idealista
//
// Es la red de seguridad que sustituye a "probar contra el sandbox y ver qué
// falla": si un nombre de campo, un enum o un rango dejan de cuadrar, aquí
// salta antes de tocar producción.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createFsSchemaStore,
  formatSchemaIssues,
  validateAgainstSchema,
} from "../lib/services/idealista/partner-api/schema-validator.ts";
import {
  buildPropertyPayload,
  buildPropertyUpdatePayload,
  normalizeFloor,
  normalizePhone,
  type IdealistaListingRow,
  type MapperOptions,
} from "../lib/services/idealista/partner-api/mapper.ts";

const SCHEMAS_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "services",
  "idealista",
  "partner-api",
  "schemas"
);
const store = createFsSchemaStore(SCHEMAS_ROOT);

const OPTIONS: MapperOptions = {
  scope: "idealista",
  country: "Spain",
  language: "es",
  sendCode: true,
};

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function expectValid(name: string, payload: unknown, schemaPath: string) {
  const issues = validateAgainstSchema(payload, schemaPath, store);
  check(name, issues.length === 0, formatSchemaIssues(issues).join("\n      "));
}

function expectInvalid(name: string, payload: unknown, schemaPath: string) {
  const issues = validateAgainstSchema(payload, schemaPath, store);
  check(name, issues.length > 0, "el validador lo dio por bueno y no debería");
}

/** Ficha completa y correcta: un piso en venta. */
function baseRow(): IdealistaListingRow {
  return {
    reference_code: "BC-1042",
    property_type: "flat",
    operation: "sale",
    square_meters: 88,
    built_square_meters: 96,
    bedrooms: 3,
    bathrooms: 2,
    floor: "3",
    is_last_floor: false,
    condition: "good",
    construction_year: 1998,
    address_street: "Calle Mayor",
    address_number: "14",
    has_no_number: false,
    address_postal_code: "03001",
    address_city: "Alicante",
    address_block: null,
    address_door: "B",
    address_visibility: "exact",
    building_name: "Residencial Mar",
    latitude: 38.3452,
    longitude: -0.4815,
    cadastral_reference: "9872023VH5797S0001WX",
    price: 249000,
    total_rental_price: null,
    community_fees: 65,
    rental_type: null,
    sale_exception: "none",
    max_tenants: null,
    equipment_type: null,
    windows_location: "exterior",
    has_elevator: true,
    heating_type: "individual",
    heating_fuel: "gas-natural",
    has_terrace: true,
    has_balcony: false,
    has_parking: true,
    has_storage: true,
    has_pool: false,
    has_garden: false,
    has_wardrobes: true,
    has_ac: true,
    has_adapted_access: false,
    has_wheelchair_access: false,
    pets_allowed: false,
    children_recommended: true,
    is_penthouse: false,
    is_studio: false,
    is_duplex: false,
    orientation_north: false,
    orientation_south: true,
    orientation_east: true,
    orientation_west: false,
    energy_class: "D",
    energy_performance: 145.5,
    emission_rating: "E",
    emission_value: 32.25,
    description: "Benjamín Cousiño Propiedades presenta un piso reformado en el centro.",
    external_link: "https://benjamincousino.com/propiedad/bc-1042",
    contact_id: "884411",
  };
}

console.log("\n▸ Alta de propiedad (property_create.json)");
{
  const { payload, errors, warnings } = buildPropertyPayload(baseRow(), OPTIONS);
  check("una ficha completa no da errores de mapeo", errors.length === 0, errors.join(" | "));
  expectValid("el payload cumple el schema de alta", payload, "property/property_create.json");
  check("manda code para que el alta sea idempotente", payload.code === "BC-1042");
  check("la operación es un objeto, no un array", !Array.isArray(payload.operation) && payload.operation.type === "sale");
  check("el precio va como entero", Number.isInteger(payload.operation.price) && payload.operation.price === 249000);
  check("la dirección usa streetName/streetNumber/town", payload.address.streetName === "Calle Mayor" && payload.address.streetNumber === "14" && payload.address.town === "Alicante");
  check("las coordenadas van planas en address", payload.address.latitude === 38.3452 && payload.address.longitude === -0.4815);
  check("la descripción va como array con idioma", payload.descriptions?.[0]?.language === "es");
  check("calefacción individual + gas natural → individual_gas", payload.features.heatingType === "individual_gas");
  check("la certificación energética va dentro de features", payload.features.energyCertificateRating === "D");
  check("sin avisos raros en una ficha completa", warnings.length === 0, warnings.join(" | "));
}

console.log("\n▸ Modificación (property_modify.json)");
{
  const { payload } = buildPropertyUpdatePayload(baseRow(), OPTIONS);
  expectValid("el payload de update cumple el schema", payload, "property/property_modify.json");
  check("el update NO manda code", !("code" in payload));
  check("el update SÍ manda type (lo exige el schema)", payload.type === "flat");
}

console.log("\n▸ Tipologías");
{
  const cases: Array<[string, string]> = [
    ["flat", "flat"],
    ["penthouse", "flat"],
    ["studio", "flat"],
    ["duplex", "flat"],
    ["house", "house"],
    ["chalet", "house"],
    ["semi-detached", "house"],
    ["villa", "house"],
    ["garage", "garage"],
    ["storage", "storage"],
    ["land", "land"],
    ["office", "office"],
    ["local", "commercial"],
  ];

  for (const [crmType, idealistaType] of cases) {
    const row = baseRow();
    row.property_type = crmType;
    const { payload, errors } = buildPropertyPayload(row, OPTIONS);
    check(`${crmType} → ${idealistaType}`, payload.type === idealistaType);
    check(`${crmType}: sin errores de mapeo`, errors.length === 0, errors.join(" | "));
    expectValid(`${crmType}: cumple el schema`, payload, "property/property_create.json");
  }
}

console.log("\n▸ Subtipologías y banderas");
{
  const penthouse = baseRow();
  penthouse.property_type = "penthouse";
  check("ático marca features.penthouse", buildPropertyPayload(penthouse, OPTIONS).payload.features.penthouse === true);

  const villa = baseRow();
  villa.property_type = "villa";
  check("villa marca features.type=villa", buildPropertyPayload(villa, OPTIONS).payload.features.type === "villa");

  const semi = baseRow();
  semi.property_type = "semi-detached";
  check("adosado marca features.type=semidetached", buildPropertyPayload(semi, OPTIONS).payload.features.type === "semidetached");
}

console.log("\n▸ Alquiler");
{
  const row = baseRow();
  row.operation = "rent";
  row.price = null;
  row.total_rental_price = 1250;
  row.rental_type = "residential";
  row.equipment_type = "furnished";
  row.max_tenants = 4;
  row.pets_allowed = true;

  const { payload, errors } = buildPropertyPayload(row, OPTIONS);
  check("sin errores", errors.length === 0, errors.join(" | "));
  expectValid("el alquiler cumple el schema", payload, "property/property_create.json");
  check("usa el precio total con gastos", payload.operation.price === 1250 && payload.operation.type === "rent");
  check("equipamiento → equipped_kitchen_and_furnished", payload.features.equipment === "equipped_kitchen_and_furnished");
  check("residencial marca features.residential", payload.features.residential === true);
  check("inquilinos y mascotas viajan", payload.features.tenantNumber === 4 && payload.features.petsAllowed === true);

  const temporary = baseRow();
  temporary.operation = "rent";
  temporary.total_rental_price = 900;
  temporary.rental_type = "temporary";
  check("temporal marca seasonalRental", buildPropertyPayload(temporary, OPTIONS).payload.features.seasonalRental === true);
}

console.log("\n▸ Reglas que Idealista rechazaría");
{
  const noContact = baseRow();
  noContact.contact_id = null;
  check("sin contacto → error de mapeo", buildPropertyPayload(noContact, OPTIONS).errors.length > 0);

  const noAddress = baseRow();
  noAddress.latitude = null;
  noAddress.longitude = null;
  noAddress.address_number = null;
  check("sin dirección ni coordenadas → error", buildPropertyPayload(noAddress, OPTIONS).errors.length > 0);

  const onlyCoords = baseRow();
  onlyCoords.address_street = null;
  onlyCoords.address_number = null;
  onlyCoords.address_postal_code = null;
  check("solo con coordenadas se puede publicar", buildPropertyPayload(onlyCoords, OPTIONS).errors.length === 0);

  // Confirmado contra el sandbox real: con type="urban", roadAccess=true SIN
  // accessType ni ningún classification* da 400 (dos reglas que no están en
  // el `required` del schema, sólo accessType aparece en la descripción).
  const land = baseRow();
  land.property_type = "land";
  const landMapped = buildPropertyPayload(land, OPTIONS);
  check("solar: manda accessType", landMapped.payload.features.accessType !== undefined);
  check(
    "solar: manda al menos un classification*",
    Object.keys(landMapped.payload.features).some((k) => k.startsWith("classification"))
  );

  const noPrice = baseRow();
  noPrice.price = null;
  check("sin precio → error", buildPropertyPayload(noPrice, OPTIONS).errors.length > 0);

  const newBuild = baseRow();
  newBuild.condition = "new";
  check(
    "obra nueva → error (la API sólo admite segunda mano)",
    buildPropertyPayload(newBuild, OPTIONS).errors.some((e) => e.includes("Obra nueva"))
  );

  // Confirmado contra el sandbox real (2026-08-14): bathroomNumber=0 con
  // conservation="good" da 400 "bathroom number not valid".
  const noBathrooms = baseRow();
  noBathrooms.bathrooms = 0;
  check("0 baños → error de mapeo (regla de negocio confirmada en sandbox)", buildPropertyPayload(noBathrooms, OPTIONS).errors.length > 0);

  // Confirmado también: areaUsable debe ser estrictamente menor que
  // areaConstructed, si no, 400 "usable area cannot be greater or equal...".
  const usableTooBig = baseRow();
  usableTooBig.square_meters = 100; // areaUsable
  usableTooBig.built_square_meters = 90; // areaConstructed
  const usableMapped = buildPropertyPayload(usableTooBig, OPTIONS);
  check("areaUsable >= areaConstructed → se omite areaUsable, no error", usableMapped.errors.length === 0 && usableMapped.payload.features.areaUsable === undefined);
  check("...con aviso", usableMapped.warnings.some((w) => w.includes("superficie útil")));

  const tinyFlat = baseRow();
  tinyFlat.built_square_meters = 8;
  tinyFlat.square_meters = 8;
  const tiny = buildPropertyPayload(tinyFlat, OPTIONS);
  expectInvalid("una vivienda de 8 m² la rechaza el schema (mínimo 11)", tiny.payload, "property/property_create.json");
}

console.log("\n▸ Normalización de campos con formato cerrado");
{
  check("planta baja → bj", normalizeFloor("Bajo") === "bj");
  check("entreplanta → en", normalizeFloor("entreplanta") === "en");
  check("sótano → st", normalizeFloor("Sótano") === "st");
  check("semisótano → ss", normalizeFloor("semisótano") === "ss");
  check("'3ª' → 3", normalizeFloor("3ª") === "3");
  check("'0' → bj", normalizeFloor("0") === "bj");
  check("'-1' se mantiene", normalizeFloor("-1") === "-1");
  check("planta 99 no vale", normalizeFloor("99") === null);
  check("texto libre no vale", normalizeFloor("ático izquierda") === null);

  const weirdFloor = baseRow();
  weirdFloor.floor = "planta principal";
  const mapped = buildPropertyPayload(weirdFloor, OPTIONS);
  check("una planta ilegible avisa y no rompe", mapped.warnings.length > 0 && mapped.errors.length === 0);
  expectValid("y el payload sigue siendo válido", mapped.payload, "property/property_create.json");

  check("teléfono con prefijo 34", normalizePhone("+34 600 123 456") === "600123456");
  check("teléfono con espacios", normalizePhone("965 12 34 56") === "965123456");
  check("teléfono corto no vale", normalizePhone("123") === null);
}

console.log("\n▸ Certificado energético");
{
  const pending = baseRow();
  pending.energy_class = "pending";
  check("'en trámite' → in_process", buildPropertyPayload(pending, OPTIONS).payload.features.energyCertificateRating === "in_process");

  const none = baseRow();
  none.energy_class = "";
  const mappedNone = buildPropertyPayload(none, OPTIONS);
  check("sin certificado → unknown + aviso", mappedNone.payload.features.energyCertificateRating === "unknown" && mappedNone.warnings.length > 0);

  const emissionsPending = baseRow();
  emissionsPending.emission_rating = "pending";
  check(
    "emisiones 'en trámite' se omiten (su enum sólo admite A-G)",
    buildPropertyPayload(emissionsPending, OPTIONS).payload.features.energyCertificateEmissionsRating === undefined
  );
}

console.log("\n▸ Otros cuerpos del API");
{
  expectValid("imágenes", { images: [{ url: "https://cdn.example.com/a.jpg", label: "living" }] }, "image/images_process.json");
  expectInvalid("imágenes con label inventada", { images: [{ url: "https://x.com/a.jpg", label: "salon" }] }, "image/images_process.json");
  expectInvalid("imágenes vacías", { images: [] }, "image/images_process.json");
  expectValid("vídeo", { url: "https://cdn.example.com/v.mp4", order: 1 }, "video/video_create.json");
  expectInvalid("vídeo con order 7", { url: "https://cdn.example.com/v.mp4", order: 7 }, "video/video_create.json");
  expectValid("tour virtual", { url: "https://my.matterport.com/show/?m=abc" }, "virtualtour/virtualtour_create.json");
  expectValid("contacto", { name: "Benjamín", email: "hola@benjamincousino.com", primaryPhoneNumber: "600123456", primaryPhonePrefix: "34" }, "contact/contact_create.json");
  expectInvalid("contacto sin teléfono", { name: "Benjamín", email: "hola@benjamincousino.com" }, "contact/contact_create.json");
  expectInvalid("contacto con teléfono con letras", { name: "B", email: "a@b.com", primaryPhoneNumber: "600ABC456" }, "contact/contact_create.json");
}

console.log(`\n${failures === 0 ? "✅" : "❌"} ${checks - failures}/${checks} comprobaciones correctas\n`);
process.exit(failures === 0 ? 0 : 1);
