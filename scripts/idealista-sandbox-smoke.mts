// Recorrido completo del Partner API de Idealista contra el sandbox.
//
//   IDEALISTA_CLIENT_ID=... IDEALISTA_CLIENT_SECRET=... IDEALISTA_FEED_KEY=ilc... \
//   IDEALISTA_CONTACT_ID=123456 \
//   node --experimental-strip-types scripts/idealista-sandbox-smoke.mts
//
// Variables opcionales:
//   IDEALISTA_ENV=prod        → apunta a producción (por defecto, sandbox)
//   IDEALISTA_IMAGE_URL=...   → una foto pública de verdad para probar el PUT
//   IDEALISTA_KEEP=1          → no da de baja el anuncio de prueba al terminar
//
// Ejercita cada endpoint del spec en el orden en que se usan de verdad, y deja
// el anuncio de prueba dado de baja al acabar. El sandbox sólo está garantizado
// de lunes a viernes de 6h a 21h (hora de Madrid), y cada noche lo reescriben
// con una copia de producción, así que lo que se cree aquí desaparece solo.
//
// No toca la base de datos: sólo habla con Idealista.

const CLIENT_ID = process.env.IDEALISTA_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.IDEALISTA_CLIENT_SECRET ?? "";
const FEED_KEY = process.env.IDEALISTA_FEED_KEY ?? "";
const CONTACT_ID = Number(process.env.IDEALISTA_CONTACT_ID ?? "0");
const BASE_URL =
  process.env.IDEALISTA_ENV === "prod"
    ? "https://partners.idealista.com"
    : "https://partners-sandbox.idealista.com";
const IMAGE_URL = process.env.IDEALISTA_IMAGE_URL ?? "";
const KEEP = process.env.IDEALISTA_KEEP === "1";

if (!CLIENT_ID || !CLIENT_SECRET || !FEED_KEY) {
  console.error("Faltan IDEALISTA_CLIENT_ID, IDEALISTA_CLIENT_SECRET o IDEALISTA_FEED_KEY.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
let token = "";

function ok(name: string, detail = "") {
  passed++;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function ko(name: string, detail = "") {
  failed++;
  console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
}

async function getToken(scope: "read" | "write"): Promise<string> {
  const basic = Buffer.from(
    `${encodeURIComponent(CLIENT_ID)}:${encodeURIComponent(CLIENT_SECRET)}`
  ).toString("base64");

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: `grant_type=client_credentials&scope=${scope}`,
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} pidiendo el token: ${body}`);
  const data = JSON.parse(body) as { access_token?: string };
  if (!data.access_token) throw new Error(`Sin access_token: ${body}`);
  return data.access_token;
}

interface CallResult {
  status: number;
  body: unknown;
  raw: string;
}

async function call(method: string, path: string, body?: unknown): Promise<CallResult> {
  const headers: Record<string, string> = {
    feedKey: FEED_KEY,
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* algunas respuestas vienen vacías */
  }
  return { status: res.status, body: parsed, raw };
}

function reference(): string {
  return `SMOKE-${Date.now().toString(36).toUpperCase()}`;
}

console.log(`\n▸ Entorno: ${BASE_URL}\n`);

// ── 1. Autenticación ────────────────────────────────────────────────────────
console.log("▸ Autenticación");
try {
  token = await getToken("write");
  ok("token de escritura obtenido");
  await getToken("read");
  ok("token de lectura obtenido");
} catch (err) {
  ko("no se pudo autenticar", err instanceof Error ? err.message : String(err));
  console.log("\nSin token no se puede seguir.\n");
  process.exit(1);
}

// ── 2. Cuenta ───────────────────────────────────────────────────────────────
console.log("\n▸ Cuenta");
{
  const res = await call("GET", "/v1/customer/publishinfo");
  const info = (res.body as { publishInfo?: { publishedAds: number; maxPublishedAds: number } })?.publishInfo;
  if (res.status === 200 && info) {
    ok("publishinfo", `${info.publishedAds}/${info.maxPublishedAds} anuncios`);
  } else {
    ko("publishinfo", `HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
  }
}

// ── 3. Contactos ────────────────────────────────────────────────────────────
console.log("\n▸ Contactos");
let contactId = CONTACT_ID;
{
  const res = await call("GET", "/v1/contacts?page=1&size=100");
  const contacts = (res.body as { contacts?: Array<{ contactId: number; agent?: boolean }> })?.contacts ?? [];
  if (res.status === 200) {
    ok("find all", `${contacts.length} contacto(s)`);
    if (!contactId && contacts[0]?.contactId) {
      contactId = contacts[0].contactId;
      console.log(`      usando el contacto ${contactId} para las pruebas`);
    }
  } else {
    ko("find all", `HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
  }

  if (!contactId) {
    const res2 = await call("POST", "/v1/contacts", {
      name: "Pruebas SmartBC",
      email: `smoke-${Date.now()}@benjamincousino.com`,
      primaryPhoneNumber: "600123456",
      primaryPhonePrefix: "34",
    });
    const created = (res2.body as { contactId?: number })?.contactId;
    if (res2.status === 201 && created) {
      contactId = created;
      ok("alta de contacto", `contactId ${created}`);
    } else {
      ko("alta de contacto", `HTTP ${res2.status}: ${res2.raw.slice(0, 300)}`);
    }
  }

  if (contactId) {
    const res3 = await call("GET", `/v1/contacts/${contactId}`);
    res3.status === 200
      ? ok("find por id")
      : ko("find por id", `HTTP ${res3.status}: ${res3.raw.slice(0, 200)}`);
  }
}

if (!contactId) {
  console.log("\nSin contacto no se puede publicar. Pasa IDEALISTA_CONTACT_ID.\n");
  process.exit(1);
}

// ── 4. Anuncios ─────────────────────────────────────────────────────────────
console.log("\n▸ Anuncios");
const code = reference();
let propertyId = 0;

const property = {
  type: "flat",
  code,
  reference: code,
  contactId,
  scope: "idealista",
  address: {
    visibility: "full",
    streetName: "Calle Mayor",
    streetNumber: "14",
    postalCode: "03001",
    town: "Alicante",
    country: "Spain",
    floor: "3",
    latitude: 38.3452,
    longitude: -0.4815,
    precision: "exact",
  },
  operation: { type: "sale", price: 249000 },
  features: {
    areaConstructed: 96,
    areaUsable: 88,
    bathroomNumber: 2,
    rooms: 3,
    conservation: "good",
    energyCertificateRating: "D",
    liftAvailable: true,
    heatingType: "individual_gas",
    windowsLocation: "external",
    terrace: true,
    storage: true,
  },
  descriptions: [{ language: "es", text: "Anuncio de prueba de la integración. No es real." }],
};

{
  const res = await call("POST", "/v1/properties", property);
  const created = (res.body as { propertyId?: number })?.propertyId;
  if (res.status === 201 && created) {
    propertyId = created;
    ok("alta", `propertyId ${created}`);
  } else {
    ko("alta", `HTTP ${res.status}: ${res.raw.slice(0, 600)}`);
  }
}

if (propertyId) {
  {
    const res = await call("GET", `/v1/properties/${propertyId}`);
    res.status === 200 ? ok("find por id") : ko("find por id", `HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
  }
  {
    // El PUT exige `type` (aunque no se pueda cambiar) y NO admite `code`.
    const { code: _code, ...modify } = property;
    const res = await call("PUT", `/v1/properties/${propertyId}`, {
      ...modify,
      operation: { type: "sale", price: 245000 },
    });
    res.status === 200 ? ok("modificación") : ko("modificación", `HTTP ${res.status}: ${res.raw.slice(0, 600)}`);
  }
  {
    const res = await call("POST", "/v1/properties", property);
    res.status === 409
      ? ok("alta repetida → 409 (el code hace el alta idempotente)")
      : ko("alta repetida", `esperaba 409, llegó HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
  }
  {
    const res = await call("GET", "/v1/properties?page=1&size=100");
    const total = (res.body as { totalProperties?: number })?.totalProperties;
    res.status === 200 ? ok("find all", `${total ?? "?"} anuncio(s)`) : ko("find all", `HTTP ${res.status}`);
  }

  // ── 5. Imágenes ───────────────────────────────────────────────────────────
  console.log("\n▸ Imágenes");
  if (IMAGE_URL) {
    const res = await call("PUT", `/v1/properties/${propertyId}/images`, {
      images: [{ url: IMAGE_URL, label: "living" }],
    });
    res.status === 202 || res.status === 200
      ? ok("envío de fotos")
      : ko("envío de fotos", `HTTP ${res.status}: ${res.raw.slice(0, 400)}`);

    const res2 = await call("GET", `/v1/properties/${propertyId}/images`);
    const images = (res2.body as { images?: Array<{ imageId?: number; originalMD5CheckSum?: string }> })?.images ?? [];
    res2.status === 200
      ? ok("consulta de fotos", `${images.length} foto(s); checksum: ${images[0]?.originalMD5CheckSum ?? "aún sin procesar"}`)
      : ko("consulta de fotos", `HTTP ${res2.status}`);
  } else {
    console.log("  · omitido (pasa IDEALISTA_IMAGE_URL con una foto pública para probarlo)");
  }

  // ── 6. Clonado ────────────────────────────────────────────────────────────
  console.log("\n▸ Clonado");
  {
    const res = await call("POST", `/v1/properties/${propertyId}/clone`, {
      operation: { type: "rent", price: 1200 },
    });
    const clone = (res.body as { propertyId?: number })?.propertyId;
    if (res.status === 201 && clone) {
      ok("clonado en alquiler", `propertyId ${clone}`);
      if (!KEEP) await call("POST", `/v1/properties/${clone}/deactivate`);
    } else {
      ko("clonado", `HTTP ${res.status}: ${res.raw.slice(0, 400)}`);
    }
  }

  // ── 7. Baja y alta ────────────────────────────────────────────────────────
  console.log("\n▸ Baja y reactivación");
  {
    const res = await call("POST", `/v1/properties/${propertyId}/deactivate`);
    res.status === 200 ? ok("baja") : ko("baja", `HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
  }
  {
    const res = await call("POST", `/v1/properties/${propertyId}/reactivate`);
    res.status === 200
      ? ok("reactivación")
      : ko("reactivación", `HTTP ${res.status}: ${res.raw.slice(0, 300)} (un 409 aquí sólo lo resuelve el gestor de cuenta)`);
  }

  if (!KEEP) {
    await call("POST", `/v1/properties/${propertyId}/deactivate`);
    console.log(`\n  · anuncio de prueba ${propertyId} dado de baja (usa IDEALISTA_KEEP=1 para dejarlo activo)`);
  }
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} correcta(s), ${failed} fallida(s)\n`);
process.exit(failed === 0 ? 0 : 1);
