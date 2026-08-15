// Tests del receptor de la ingesta de Idealista.
//
//   npm run test:idealista-ingest
//
// Corre contra la base de datos REAL (la del .env.local que se cargue), con un
// idealista_id de prueba que se borra al final. Comprueba lo único que de
// verdad puede romper este receptor sin que nadie se entere:
//
//   1. que el mismo payload dos veces NO duplique nada (ni ficha, ni fotos, ni
//      teléfonos, ni eventos, ni snapshots);
//   2. que un cambio real SÍ genere el evento correcto;
//   3. que las URLs de foto se normalicen al perfil SIN marca de agua;
//   4. que un envío parcial no borre lo que no viene.
//
// Los dos primeros son los que sostienen todo lo demás: si la idempotencia
// falla, cada refresco de mercado multiplica la base de datos.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { IdealistaListingSchema } from "../lib/api/v1/idealista/schema.ts";
import { upsertIdealistaListing } from "../lib/api/v1/idealista/upsert.ts";

// ─── Entorno ────────────────────────────────────────────────────────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Carga mínima de .env.local: el script corre fuera de Next, que es quien
// normalmente inyecta estas variables.
for (const file of [".env.local", ".env.production"]) {
  try {
    for (const line of readFileSync(join(ROOT, file), "utf-8").split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* el fichero puede no existir; se intenta el siguiente */
  }
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

// ─── Utilidades de test ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
    if (detail !== undefined) console.log(`     ${JSON.stringify(detail)}`);
  }
}

const TEST_ID = `test-ingest-${Date.now()}`;

async function cleanup(): Promise<void> {
  const { data } = await db
    .from("idealista_market_listings")
    .select("id")
    .eq("idealista_id", TEST_ID)
    .maybeSingle();
  if (data?.id) {
    // Los sub-recursos caen por ON DELETE CASCADE.
    await db.from("idealista_market_listings").delete().eq("id", data.id);
  }
}

async function countRows(table: string, listingId: string): Promise<number> {
  const { count } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);
  return count ?? 0;
}

// ─── Payloads ───────────────────────────────────────────────────────────────

// Foto con un perfil de tamaño "malo" (el que sirve CON marca de agua). El
// receptor debe reescribirla a WEB_DETAIL_TOP-L-L.
const WATERMARKED_PHOTO =
  "https://img3.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/cc/1234567.jpg";
const EXPECTED_PHOTO =
  "https://img3.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/aa/bb/cc/1234567.jpg";

function basePayload() {
  return {
    idealista_id: TEST_ID,
    listing_url: `https://www.idealista.com/inmueble/${TEST_ID}/`,
    title: "Piso en venta en Chamberí",
    operation: "sale" as const,
    property_type: "flat",
    status: "active" as const,
    current_price: 450000,
    currency: "eur",
    bedrooms: 3,
    bathrooms: 2,
    constructed_m2: 110,
    description: "Piso reformado con mucha luz en pleno centro.",
    municipality: "Madrid",
    district: "Chamberí",
    advertiser_type: "particular" as const,
    advertiser_name: "María",
    is_promoted: false,
    features_raw: ["Ascensor", "Terraza"],
    badges_raw: ["Nuevo"],
    photos: [{ url: WATERMARKED_PHOTO, order_index: 0, is_main: true }],
    phones: [{ phone: "612 34 56 78" }],
    additional_links: [{ url: "https://ejemplo.es/ficha", label: "Web propia" }],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(`\n🔎 Ingesta de Idealista · id de prueba ${TEST_ID}\n`);
  await cleanup();

  // ── 1 · El contrato valida ──
  console.log("1 · Contrato");
  const parsed = IdealistaListingSchema.safeParse(basePayload());
  check("el payload de ejemplo cumple el contrato", parsed.success,
    parsed.success ? undefined : parsed.error.issues);
  if (!parsed.success) return;

  const strict = IdealistaListingSchema.safeParse({ ...basePayload(), campo_inventado: 1 });
  check("un campo desconocido se rechaza con 400 (no se ignora)", !strict.success);

  const badEnum = IdealistaListingSchema.safeParse({ ...basePayload(), operation: "alquiler" });
  check("un enum mal escrito se rechaza", !badEnum.success);

  const minimal = IdealistaListingSchema.safeParse({ idealista_id: "123" });
  check("solo idealista_id es obligatorio", minimal.success,
    minimal.success ? undefined : minimal.error.issues);

  // ── 2 · Alta ──
  console.log("\n2 · Alta");
  const first = await upsertIdealistaListing(db, parsed.data, { apiClientId: null });
  check("la primera vez crea la ficha", first.action === "created", first.action);
  check("emite NEW_LISTING", first.events_created.includes("NEW_LISTING"), first.events_created);
  check("guarda la foto", first.photos.added === 1, first.photos);
  check("guarda el teléfono", first.phones.added === 1, first.phones);

  const listingId = first.internal_id;
  const { data: stored } = await db
    .from("idealista_market_listings")
    .select("*")
    .eq("id", listingId)
    .single();

  // ── 3 · Fotos sin marca de agua ──
  console.log("\n3 · Fotos");
  const { data: photos } = await db
    .from("idealista_market_photos")
    .select("source_url")
    .eq("listing_id", listingId);
  check(
    "la URL se normaliza al perfil SIN marca de agua",
    photos?.[0]?.source_url === EXPECTED_PHOTO,
    photos?.[0]?.source_url,
  );

  // ── 4 · Teléfono normalizado ──
  const { data: phones } = await db
    .from("idealista_market_phones")
    .select("phone, phone_normalized")
    .eq("listing_id", listingId);
  check(
    "el teléfono se normaliza a +34...",
    phones?.[0]?.phone_normalized === "+34612345678",
    phones?.[0],
  );

  // ── 5 · Idempotencia: el mismo payload otra vez ──
  console.log("\n4 · Idempotencia");
  const again = await upsertIdealistaListing(db, parsed.data, { apiClientId: null });
  check("el mismo payload devuelve unchanged", again.action === "unchanged", again.action);
  check("no emite eventos nuevos", again.events_created.length === 0, again.events_created);

  check("no duplica fotos", (await countRows("idealista_market_photos", listingId)) === 1);
  check("no duplica teléfonos", (await countRows("idealista_market_phones", listingId)) === 1);
  check("no duplica enlaces", (await countRows("idealista_market_links", listingId)) === 1);
  check("no duplica eventos", (await countRows("idealista_market_events", listingId)) === 1);
  check("no duplica snapshots", (await countRows("idealista_market_snapshots", listingId)) === 1);

  const { count: listingCount } = await db
    .from("idealista_market_listings")
    .select("id", { count: "exact", head: true })
    .eq("idealista_id", TEST_ID);
  check("no duplica la ficha", listingCount === 1, listingCount);

  // ── 6 · Bajada de precio ──
  console.log("\n5 · Detección de cambios");
  const cheaper = IdealistaListingSchema.parse({ ...basePayload(), current_price: 420000 });
  const priceDrop = await upsertIdealistaListing(db, cheaper, { apiClientId: null });
  check("una bajada de precio actualiza", priceDrop.action === "updated", priceDrop.action);
  check("emite PRICE_DOWN", priceDrop.events_created.includes("PRICE_DOWN"), priceDrop.events_created);

  const { data: priceEvent } = await db
    .from("idealista_market_events")
    .select("old_value, new_value")
    .eq("listing_id", listingId)
    .eq("event_type", "PRICE_DOWN")
    .single();
  check(
    "el evento guarda el precio anterior y el nuevo",
    Number(priceEvent?.old_value) === 450000 && Number(priceEvent?.new_value) === 420000,
    priceEvent,
  );

  // Subida de precio.
  const dearer = IdealistaListingSchema.parse({ ...basePayload(), current_price: 460000 });
  const priceUp = await upsertIdealistaListing(db, dearer, { apiClientId: null });
  check("una subida emite PRICE_UP", priceUp.events_created.includes("PRICE_UP"), priceUp.events_created);

  // Cambio de anunciante: particular → profesional.
  const agency = IdealistaListingSchema.parse({
    ...basePayload(),
    current_price: 460000,
    advertiser_type: "professional" as const,
    advertiser_name: "Inmobiliaria X",
  });
  const advChange = await upsertIdealistaListing(db, agency, { apiClientId: null });
  check(
    "pasar de particular a profesional emite ADVERTISER_CHANGED",
    advChange.events_created.includes("ADVERTISER_CHANGED"),
    advChange.events_created,
  );

  // Promoción.
  const promoted = IdealistaListingSchema.parse({
    ...basePayload(),
    current_price: 460000,
    advertiser_type: "professional" as const,
    advertiser_name: "Inmobiliaria X",
    is_promoted: true,
  });
  const promo = await upsertIdealistaListing(db, promoted, { apiClientId: null });
  check("destacar el anuncio emite PROMOTED", promo.events_created.includes("PROMOTED"), promo.events_created);

  // ── 7 · Envío parcial: no borra lo que no viene ──
  console.log("\n6 · Envío parcial");
  const partial = IdealistaListingSchema.parse({
    idealista_id: TEST_ID,
    current_price: 400000,
  });
  await upsertIdealistaListing(db, partial, { apiClientId: null });
  const { data: afterPartial } = await db
    .from("idealista_market_listings")
    .select("title, description, bedrooms")
    .eq("id", listingId)
    .single();
  check("un envío solo con precio no borra el título", afterPartial?.title === stored.title, afterPartial);
  check("ni la descripción", !!afterPartial?.description);
  check("ni los dormitorios", afterPartial?.bedrooms === 3, afterPartial?.bedrooms);
  check(
    "y no borra las fotos que no venían",
    (await countRows("idealista_market_photos", listingId)) === 1,
  );

  // ── 8 · Estados ──
  console.log("\n7 · Estados");
  const missing = IdealistaListingSchema.parse({ idealista_id: TEST_ID, status: "missing" as const });
  const miss = await upsertIdealistaListing(db, missing, { apiClientId: null });
  check("status missing emite MISSING", miss.events_created.includes("MISSING"), miss.events_created);

  const { data: missingRow } = await db
    .from("idealista_market_listings")
    .select("status, missing_since")
    .eq("id", listingId)
    .single();
  check("anota missing_since aunque no venga en el payload", !!missingRow?.missing_since, missingRow);

  const back = IdealistaListingSchema.parse({ idealista_id: TEST_ID, status: "reactivated" as const });
  const reactivated = await upsertIdealistaListing(db, back, { apiClientId: null });
  check(
    "status reactivated emite REACTIVATED",
    reactivated.events_created.includes("REACTIVATED"),
    reactivated.events_created,
  );

  const { data: backRow } = await db
    .from("idealista_market_listings")
    .select("status, reactivated_at, missing_since")
    .eq("id", listingId)
    .single();
  check("'reactivated' se guarda como status active", backRow?.status === "active", backRow?.status);
  check("anota reactivated_at", !!backRow?.reactivated_at);
  check("limpia missing_since al volver", backRow?.missing_since === null, backRow?.missing_since);

  // ── 9 · Dry-run no escribe ──
  console.log("\n8 · Dry-run");
  const dryId = `${TEST_ID}-dry`;
  const dry = IdealistaListingSchema.parse({ ...basePayload(), idealista_id: dryId });
  const dryResult = await upsertIdealistaListing(db, dry, { apiClientId: null, dryRun: true });
  check("dry-run informa de lo que haría", dryResult.action === "created", dryResult.action);
  const { count: dryCount } = await db
    .from("idealista_market_listings")
    .select("id", { count: "exact", head: true })
    .eq("idealista_id", dryId);
  check("dry-run NO escribe", dryCount === 0, dryCount);

  // ── Limpieza ──
  await cleanup();
  const { count: afterCleanup } = await db
    .from("idealista_market_listings")
    .select("id", { count: "exact", head: true })
    .eq("idealista_id", TEST_ID);
  check("\n(limpieza) la ficha de prueba se ha borrado", afterCleanup === 0);
}

run()
  .then(() => {
    console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} OK · ${failed} fallos\n`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("\n💥 Error inesperado:", err);
    await cleanup().catch(() => {});
    process.exit(1);
  });
