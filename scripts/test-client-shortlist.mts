/**
 * Garantías del Private Client Shortlist.
 *
 * Igual que la suite de Viewing Collections: prueba la PROYECCIÓN y las
 * reglas de orden en aislamiento, sin levantar nada. Lo que se comprueba aquí
 * es lo que no puede romperse nunca — que el contrato público no filtre, y que
 * la lista se lea en el orden que el cliente espera.
 */
import {
  toPublicClientShortlist,
  compareShortlistItems,
  shortlistZoneLabel,
  type RawShortlist,
  type RawShortlistItem,
} from "../lib/client-shortlist/to-public.ts";
import { linkStateOf } from "../lib/client-shortlist/types.ts";
import {
  allowShortlistWrite,
  resetShortlistRateLimit,
} from "../lib/client-shortlist/rate-limit.ts";

let failures = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

// ── Fixture: el caso Paul ───────────────────────────────────────────────────
function prop(over: Partial<any> = {}): any {
  return {
    id: "p1",
    slug: "alquiler-de-piso-en-calle-de-jorge-juan-1234",
    title: "Alquiler de piso en Calle de Jorge Juan",
    zone: "Salamanca",
    subzone: "Goya",
    bedrooms: 3,
    bathrooms: 2,
    square_meters: 140,
    price: 5300,
    currency: "eur",
    operation: "rent",
    status: "available",
    archived_at: null,
    bc_reference: "BC-1386",
    // Campos internos que NO deben salir jamás. Se meten a propósito para que
    // el test falle si alguien los reenvía sin querer.
    owner_name: "Doña Internal",
    owner_phone: "+34 600 000 000",
    internal_notes: "El dueño baja de precio",
    source_url: "https://www.idealista.com/inmueble/99999999/",
    external_id: "IDEALISTA-99999999",
    address: "Calle de Jorge Juan 41, 4º D",
    latitude: 40.4257,
    longitude: -3.6789,
    property_photos: [
      { url: "https://x.supabase.co/storage/v1/object/synced/1.webp", position: 0 },
      { url: "https://x.supabase.co/storage/v1/object/synced/2.webp", position: 1 },
    ],
    ...over,
  };
}

function item(over: Partial<RawShortlistItem> = {}): RawShortlistItem {
  return {
    id: "i1",
    origin: "bcp_curated",
    decision: "undecided",
    rank: null,
    client_comment: null,
    position: 1,
    property: prop(),
    ...over,
  } as RawShortlistItem;
}

function shortlist(over: Partial<RawShortlist> = {}): RawShortlist {
  return {
    client: { full_name: "Paul Ashford" },
    language: "en",
    country: "es",
    status: "reviewing",
    submitted_at: null,
    revision: 3,
    items: [item()],
    ...over,
  };
}

// ============================================================================
section("🔴 SEGURIDAD · el contrato público no filtra");
// ============================================================================
{
  const out = toPublicClientShortlist(shortlist());
  const serialized = JSON.stringify(out);

  const forbidden: Array<[string, RegExp]> = [
    ["owner_*", /owner_(name|phone|email)|Doña Internal/i],
    ["notas internas", /internal_notes|baja de precio/i],
    ["URL de origen", /idealista\.com|source_url/i],
    ["external_id", /external_id|IDEALISTA-/],
    ["ruta de Storage", /storage\/v1\/object|synced\//],
    ["dirección exacta", /Jorge Juan 41|address/i],
    ["coordenadas", /latitude|longitude|40\.4257|-3\.6789/],
    ["id de propiedad", /"p1"/],
  ];
  for (const [label, re] of forbidden) {
    check(`sin ${label}`, !re.test(serialized), serialized.match(re)?.[0]);
  }

  check(
    "las fotos van SIEMPRE por el proxy /p/",
    out.properties[0].photoUrls.every((u) => u.startsWith("/p/")),
  );
  check(
    "solo se manda el nombre de pila",
    out.clientFirstName === "Paul",
    out.clientFirstName,
  );
  check(
    "el título es editorial, no el del portal",
    out.properties[0].title === "Jorge Juan",
    out.properties[0].title,
  );
  check(
    "la ubicación es zona y subzona, nunca la calle",
    out.properties[0].zoneLabel === "Salamanca · Goya",
    out.properties[0].zoneLabel,
  );
}

// ============================================================================
section("Orden de lectura");
// ============================================================================
{
  const cmp = (
    decision: string,
    rank: number | null,
    position: number,
  ): any => ({ decision, rank, position });

  const sorted = [
    cmp("not_for_me", null, 1),
    cmp("must_visit", 2, 5),
    cmp("undecided", null, 3),
    cmp("must_visit", 1, 9),
    cmp("maybe", null, 2),
  ].sort(compareShortlistItems);

  check(
    "las prioritarias van primero y por el orden del cliente",
    sorted[0].rank === 1 && sorted[1].rank === 2,
  );
  check("después las que faltan por decidir", sorted[2].decision === "undecided");
  check("luego las alternativas", sorted[3].decision === "maybe");
  check("y al final las descartadas", sorted[4].decision === "not_for_me");
}

// ============================================================================
section("Zona sin subzona ni duplicados");
// ============================================================================
{
  check(
    "sin subzona, solo la zona",
    shortlistZoneLabel(prop({ subzone: null })) === "Salamanca",
  );
  check(
    "subzona igual a zona no se repite",
    shortlistZoneLabel(prop({ subzone: "Salamanca" })) === "Salamanca",
  );
}

// ============================================================================
section("Estado del ENLACE (distinto del estado del trabajo)");
// ============================================================================
{
  const future = new Date(Date.now() + 864e5).toISOString();
  const past = new Date(Date.now() - 864e5).toISOString();

  check("activo", linkStateOf({ revoked_at: null, expires_at: future }) === "active");
  check("caducado", linkStateOf({ revoked_at: null, expires_at: past }) === "expired");
  check(
    "revocado gana sobre caducado",
    linkStateOf({ revoked_at: past, expires_at: future }) === "revoked",
  );
}

// ============================================================================
section("Decisiones del cliente en la proyección");
// ============================================================================
{
  const out = toPublicClientShortlist(
    shortlist({
      status: "submitted",
      submitted_at: "2026-08-18T21:41:00Z",
      items: [
        item({ id: "a", decision: "must_visit", rank: 2, position: 1 }),
        item({ id: "b", decision: "must_visit", rank: 1, position: 2 }),
        item({
          id: "c",
          decision: "not_for_me",
          position: 3,
          client_comment: "Demasiado lejos del colegio",
        }),
        item({ id: "d", origin: "client_added", position: 4 }),
      ],
    }),
  );

  check("marca que ya está enviada", out.submitted === true);
  check("con su fecha en el idioma del cliente", Boolean(out.submittedAtLabel));
  check(
    "el orden respeta el rank",
    out.properties[0].itemId === "b" && out.properties[1].itemId === "a",
  );
  check(
    "el comentario del cliente viaja tal cual",
    out.properties.find((p) => p.itemId === "c")?.comment ===
      "Demasiado lejos del colegio",
  );
  check(
    "una añadida por el cliente NO se disfraza de curación",
    out.properties.find((p) => p.itemId === "d")?.origin === "client_added",
  );
  check(
    "la revisión viaja para detectar estado rancio",
    out.revision === 3,
  );
}

// ============================================================================
section("Freno de escritura");
// ============================================================================
{
  resetShortlistRateLimit();
  let allowed = 0;
  for (let i = 0; i < 200; i++) if (allowShortlistWrite("tok-a")) allowed++;
  check(
    "un bucle se corta dentro del minuto",
    allowed > 0 && allowed < 200,
    `permitidas ${allowed}`,
  );
  check(
    "y no afecta a otro cliente",
    allowShortlistWrite("tok-b") === true,
  );
  resetShortlistRateLimit();
}

// ============================================================================
console.log(`\n${failures === 0 ? "✅ TODO OK" : `❌ ${failures} FALLO(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
