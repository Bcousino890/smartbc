/**
 * Tests de la proyección pública de Viewing Collections.
 *
 * Es la barrera que separa los datos internos del CRM de lo que ve un cliente
 * con el enlace. Todo lo que se comprueba aquí es de seguridad: si alguno de
 * estos tests falla, hay una fuga.
 *
 * Función pura, sin base de datos: se ejecuta en milisegundos.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-viewing-collections-projection.mts
 */
import {
  collapseStopStatus,
  editorialResidenceTitle,
  deriveAvailability,
  firstNameOnly,
  proxyPhotoUrls,
  resolveAreaLocation,
  sanitizePublicAddress,
  toPublicViewingCollection,
} from "../lib/viewing-collections/to-public.ts";
import {
  FORBIDDEN_IN_PUBLIC,
  MONDAY,
  mondayCollection,
  mondayWithArchivedProperty,
  mondayWithHiddenStop,
} from "../lib/viewing-collections/__fixtures__/paul.ts";
import {
  deriveShareState,
  midpointPosition,
  nextPosition,
} from "../lib/viewing-collections/types.ts";
import { randomToken, URL_SAFE_TOKEN_RE } from "../lib/tokens.ts";
import { compareStopsByDay } from "../lib/viewing-collections/order.ts";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ============================================================================
section("🔴 SEGURIDAD · ningún dato interno cruza a la superficie pública");
// ============================================================================

const monday = toPublicViewingCollection(mondayCollection());
const serialized = JSON.stringify(monday);

for (const [key, value] of Object.entries(FORBIDDEN_IN_PUBLIC)) {
  check(
    `no expone ${key}`,
    !serialized.includes(value),
    `encontrado "${value}"`,
  );
}

check(
  "no expone ningún UUID",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
    serialized,
  ),
);

check(
  "no expone rutas de Storage",
  !serialized.includes("/storage/") && !serialized.includes("synced/"),
);

check(
  "no expone el apellido del cliente",
  monday.clientFirstName === "Paul",
  monday.clientFirstName,
);

// ============================================================================
section("🔴 SEGURIDAD · dirección y coordenadas");
// ============================================================================

const exactStop = monday.stops[0];
const areaStop = monday.stops[2]; // 'proposed' → area_only

check(
  "parada confirmada con 'exact' SÍ expone dirección",
  exactStop.exactAddress === "Calle Trafalgar 24, 3ºB",
  String(exactStop.exactAddress),
);
check(
  "parada confirmada con 'exact' SÍ expone coordenadas",
  exactStop.exactLat !== null && exactStop.exactLng !== null,
);

check("parada 'area_only' NO expone dirección", areaStop.exactAddress === null);
check(
  "parada 'area_only' NO expone coordenadas reales",
  areaStop.exactLat === null && areaStop.exactLng === null,
);
check(
  "parada 'area_only' no trae mapa de zona en V1 (sin centroides fiables)",
  areaStop.areaLocation === null,
);
check(
  "la lat/lng real de una parada area_only no aparece en el JSON",
  !serialized.includes("40.4331") || exactStop.exactLat === 40.4331,
);

// Dirección contaminada: la parada 4 lleva la descripción entera volcada.
const pollutedStop = monday.stops[3];
check(
  "dirección contaminada (descripción volcada) se degrada a null",
  pollutedStop.exactAddress === null,
  String(pollutedStop.exactAddress),
);
check(
  "el texto de las condiciones de alquiler no llega al cliente",
  !serialized.includes("CONDICIONES DE ALQUILER"),
);

check(
  "sanitizePublicAddress acepta una dirección normal",
  sanitizePublicAddress("Calle Trafalgar 24, 3ºB") === "Calle Trafalgar 24, 3ºB",
);
check(
  "sanitizePublicAddress rechaza texto largo",
  sanitizePublicAddress("x".repeat(200)) === null,
);
check(
  "sanitizePublicAddress rechaza prosa con muchos puntos",
  sanitizePublicAddress("Calle A. Piso 2. Metro X. Cocina. Salón.") === null,
);
check("resolveAreaLocation devuelve null en V1", resolveAreaLocation("Chamberí", null) === null);

// ============================================================================
section("🔴 SEGURIDAD · imágenes siempre por el proxy");
// ============================================================================

const allPhotos = monday.stops.flatMap((s) => [
  ...(s.coverPhotoUrl ? [s.coverPhotoUrl] : []),
  ...s.photoUrls,
]);
check(
  `las ${allPhotos.length} URLs de foto van por /p/`,
  allPhotos.every((u) => u.startsWith("/p/")),
  allPhotos.find((u) => !u.startsWith("/p/")),
);
check(
  "las URLs de foto llevan hash de versión",
  allPhotos.every((u) => u.includes("?v=")),
);

const photos = proxyPhotoUrls(mondayCollection().stops[0].property);
check("proxyPhotoUrls deduplica y ordena", photos.length === 2);

// ============================================================================
section("🟠 Q-11 · paradas ocultas y numeración sin huecos");
// ============================================================================

check("con 6 paradas visibles, stopCount = 6", monday.stopCount === 6);
check(
  "numeración 1..6 sin huecos",
  monday.stops.map((s) => s.order).join(",") === "1,2,3,4,5,6",
);

const hidden = toPublicViewingCollection(mondayWithHiddenStop());
check("al ocultar una parada, stopCount = 5", hidden.stopCount === 5);
check(
  "renumera 1..5 sin dejar hueco",
  hidden.stops.map((s) => s.order).join(",") === "1,2,3,4,5",
);
check(
  "la parada oculta no aparece en el JSON",
  !JSON.stringify(hidden).includes("Loft en Alonso Martínez"),
);

// Segunda barrera: aunque la query no filtrase, la proyección sí.
const unfiltered = mondayWithHiddenStop();
check(
  "la proyección filtra aunque la query no lo haga (segunda barrera)",
  toPublicViewingCollection(unfiltered).stops.every(
    (s) => s.title !== "Loft en Alonso Martínez",
  ),
);

// ============================================================================
section("🟡 Estados y disponibilidad");
// ============================================================================

check("confirmed → confirmed", collapseStopStatus("confirmed") === "confirmed");
check("completed → confirmed", collapseStopStatus("completed") === "confirmed");
check("pending → pending", collapseStopStatus("pending") === "pending");
check(
  "proposed → pending (el proceso interno no se filtra)",
  collapseStopStatus("proposed") === "pending",
);
check(
  "declined → cancelled (el motivo comercial no se filtra)",
  collapseStopStatus("declined") === "cancelled",
);
check("cancelled → cancelled", collapseStopStatus("cancelled") === "cancelled");

check(
  "propiedad reservada se marca como reserved, no como available",
  monday.stops[2].availability === "reserved",
);
check(
  "archivada → unavailable",
  deriveAvailability({ status: "archived", archived_at: null }) ===
    "unavailable",
);
check(
  "archived_at → unavailable aunque el status diga otra cosa",
  deriveAvailability({ status: "available", archived_at: "2026-01-01" }) ===
    "unavailable",
);

const archived = toPublicViewingCollection(mondayWithArchivedProperty());
const archivedStop = archived.stops.find(
  (s) => s.title === "Piso en Bilbao",
);
check(
  "propiedad archivada no ofrece enlace",
  archivedStop?.smartLinkUrl === null,
);

// ============================================================================
section("🟡 SmartLinks · cascada de fallback");
// ============================================================================

check(
  "parada con SmartLink apunta a /c/{token} y cuenta como trackeada",
  monday.stops[0].smartLinkUrl === "/c/aaaaaaaaaaaaaaaaaaaaaaaaaaaa" &&
    monday.stops[0].smartLinkTracked === true,
);
const noLink = monday.stops[5];
check(
  "parada sin SmartLink cae al enlace estable /compartir",
  noLink.smartLinkUrl?.startsWith("/compartir/") === true,
  String(noLink.smartLinkUrl),
);
check(
  "el fallback se marca como NO trackeado",
  noLink.smartLinkTracked === false,
);
check(
  "el fallback usa la referencia BC en el slug",
  noLink.smartLinkUrl?.includes("bc0877") === true,
  String(noLink.smartLinkUrl),
);

// ============================================================================
section("🟡 Formato y localización");
// ============================================================================

check(
  "la fecha se formatea como lunes",
  monday.dateLabel.toLowerCase().startsWith("lunes"),
  monday.dateLabel,
);
check("17/08/2026 es lunes", new Date(`${MONDAY}T12:00:00`).getDay() === 1);
check("la franja se formatea", monday.windowLabel === "10:00 – 14:00");
// es-ES no agrupa los millares hasta 5 dígitos (CLDR minimumGroupingDigits=2),
// así que 1750 se escribe sin punto y 17500 sí lo lleva.
check(
  "el precio se formatea con la moneda y el locale del país",
  monday.stops[0].priceLabel === "1750 €/mes",
  monday.stops[0].priceLabel,
);
const bigPrice = toPublicViewingCollection(
  mondayCollection({
    stops: mondayCollection().stops.map((s, i) =>
      i === 0
        ? { ...s, property: { ...s.property, price: 17500 } }
        : s,
    ),
  }),
);
check(
  "un precio de 5 dígitos sí lleva separador de millares",
  bigPrice.stops[0].priceLabel === "17.500 €/mes",
  bigPrice.stops[0].priceLabel,
);
check(
  "la hora se muestra en la zona del itinerario (08:00Z → 10:00 CEST)",
  monday.stops[0].timeLabel === "10:00",
  String(monday.stops[0].timeLabel),
);
check("la duración se formatea", monday.stops[0].durationLabel === "30 min");
check(
  "la zona incluye subzona",
  monday.stops[0].zoneLabel === "Chamberí · Trafalgar",
);

check("firstNameOnly con nombre compuesto", firstNameOnly("Paul Cabrera") === "Paul");
check("firstNameOnly con null", firstNameOnly(null) === "Cliente");
check(
  "firstNameOnly no devuelve un email como nombre",
  firstNameOnly("paul@ejemplo.com") === "Cliente",
);

// ============================================================================
section("🟡 Agente");
// ============================================================================

check("el agente aparece con su nombre", monday.agent.displayName === "María López");
check(
  "el WhatsApp del agente se construye con los dígitos",
  monday.agent.whatsappUrl === "https://wa.me/34694209763",
  String(monday.agent.whatsappUrl),
);

const noAgent = toPublicViewingCollection(
  mondayCollection({ agent: null }),
);
check(
  "sin agente cae al contacto de la agencia",
  noAgent.agent.displayName === "Benjamín Cousiño Propiedades",
);

// ============================================================================
section("🟡 Estado derivado del enlace");
// ============================================================================

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

check(
  "activo",
  deriveShareState({ expires_at: future, revoked_at: null }) === "active",
);
check(
  "caducado",
  deriveShareState({ expires_at: past, revoked_at: null }) === "expired",
);
check(
  "revocado gana sobre caducado",
  deriveShareState({ expires_at: future, revoked_at: past }) === "revoked",
);

// ============================================================================
section("🟡 Posiciones (drag & drop)");
// ============================================================================

check("primera parada = 100", nextPosition([]) === 100);
check(
  "siguiente parada = max + 100",
  nextPosition([{ position: 100 }, { position: 300 }]) === 400,
);
check("punto medio entre 100 y 300", midpointPosition(100, 300) === 200);
check("insertar al principio", midpointPosition(null, 200) === 100);
check("insertar al final", midpointPosition(500, null) === 600);
check(
  "sin hueco devuelve null (hay que renumerar)",
  midpointPosition(100, 101) === null,
);

// ============================================================================
section("🟡 Tokens");
// ============================================================================

const tok = randomToken();
check("longitud 28", tok.length === 28, `${tok.length}`);
check("alfabeto URL-safe", URL_SAFE_TOKEN_RE.test(tok), tok);
check(
  "1000 tokens sin colisión",
  new Set(Array.from({ length: 1000 }, () => randomToken())).size === 1000,
);

// ============================================================================
section("🟡 Títulos editoriales (transformación de presentación)");
// ============================================================================

for (const [input, expected] of [
  ["Alquiler de piso en Calle de Jorge Juan", "Jorge Juan"],
  ["Piso en venta en Calle José Abascal", "José Abascal"],
  ["Ático en venta en finca señorial en Calle del General Oráa", "General Oráa"],
  ["Piso reformado en alquiler en Almagro, con terraza", "Piso reformado en alquiler en Almagro, con terraza"],
  ["Piso en venta en Guindalera", "Piso en venta en Guindalera"],
  ["Chalet en Avenida de la Fontanilla, 15", "Fontanilla"],
  ["Piso en Calle Velázquez 55, 2º Derecha", "Velázquez"],
] as const) {
  const got = editorialResidenceTitle(input);
  check(`"${input.slice(0, 42)}…" → "${expected.slice(0, 30)}"`, got === expected, got);
}

// ============================================================================
section("🟡 i18n · la colección habla el idioma del cliente");
// ============================================================================

const enCol = toPublicViewingCollection(
  mondayCollection({
    itinerary: { ...mondayCollection().itinerary, language: "en" },
  }),
);
check("language=en en el contrato", enCol.language === "en");
check(
  "fecha en inglés",
  enCol.dateLabel.startsWith("Monday"),
  enCol.dateLabel,
);
check(
  "sufijo de alquiler traducido",
  enCol.stops[0].priceLabel.endsWith("/month"),
  enCol.stops[0].priceLabel,
);
check(
  "duración traducida (min)",
  enCol.stops[0].durationLabel === "30 min",
  String(enCol.stops[0].durationLabel),
);

const arCol = toPublicViewingCollection(
  mondayCollection({
    itinerary: { ...mondayCollection().itinerary, language: "ar" },
  }),
);
check("language=ar", arCol.language === "ar");
check(
  "fecha árabe con dígitos latinos",
  /2026/.test(arCol.dateLabel),
  arCol.dateLabel,
);
check(
  "sufijo árabe de alquiler",
  arCol.stops[0].priceLabel.includes("شهري"),
  arCol.stops[0].priceLabel,
);

const badLang = toPublicViewingCollection(
  mondayCollection({
    itinerary: { ...mondayCollection().itinerary, language: "xx" },
  }),
);
check("idioma desconocido cae a español", badLang.language === "es");


// ── Orden de jornada ────────────────────────────────────────────────────────
// Una jornada se lee en el reloj, no en el orden en que el agente añadió las
// propiedades. Fue un fallo real: el cliente veía 19:00 antes que 18:00.
{
  const s = (
    position: number,
    scheduled_at: string | null,
    created_at = "2026-01-01T00:00:00Z",
  ) => ({ position, scheduled_at, created_at });

  const ordered = [
    s(1, null),                          // sin hora, añadida la primera
    s(2, "2026-08-17T17:00:00Z"),
    s(3, "2026-08-17T13:00:00Z"),
    s(4, null),                          // sin hora, añadida después
    s(5, "2026-08-17T15:00:00Z"),
  ]
    .slice()
    .sort(compareStopsByDay);

  check(
    "las paradas con hora van primero y en orden de reloj",
    ordered[0].scheduled_at === "2026-08-17T13:00:00Z" &&
      ordered[1].scheduled_at === "2026-08-17T15:00:00Z" &&
      ordered[2].scheduled_at === "2026-08-17T17:00:00Z",
  );
  check(
    "las que no tienen hora quedan al final, en el orden del agente",
    ordered[3].scheduled_at === null &&
      ordered[3].position === 1 &&
      ordered[4].position === 4,
  );

  // Misma hora exacta: manda el orden manual, y no baila entre recargas.
  const tie = [s(9, "2026-08-17T12:00:00Z"), s(2, "2026-08-17T12:00:00Z")]
    .slice()
    .sort(compareStopsByDay);
  check("con la misma hora decide el orden manual", tie[0].position === 2);
}

// ============================================================================
console.log(
  `\n${failures === 0 ? "✅ TODO OK" : `❌ ${failures} FALLO(S)`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
