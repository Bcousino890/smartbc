/**
 * Tests del PROPERTIES WORKSPACE.
 *
 * Se prueba lo único que puede mentir: la normalización determinista (tipo y
 * amenities) y las derivaciones (health, bloqueos de publicación, atención).
 * Funciones puras con `now` inyectado: sin base de datos y sin reloj.
 *
 * El escenario final usa la forma real de los datos de producción: 20 valores
 * de property_type, features con 290 entradas que no son amenities, y el 76%
 * del catálogo solo con zona.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-properties-workspace.mts
 */
import {
  normalizeAmenities,
  normalizePropertyType,
} from "../lib/properties-workspace/normalize.ts";
import {
  deriveAttention,
  deriveHealth,
  derivePublicationBlockers,
  needsAttention,
  type PropertyFacts,
} from "../lib/properties-workspace/derive.ts";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-08-20T12:00:00.000Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function facts(over: Partial<PropertyFacts> = {}): PropertyFacts {
  return {
    title: "Piso en Serrano",
    description: "Amplio piso reformado…",
    price: 6250,
    bedrooms: 3,
    bathrooms: 2,
    squareMeters: 180,
    propertyType: "Piso",
    propertyTypeOverride: null,
    status: "available",
    publishedWeb: true,
    source: "scrape",
    address: "Calle de Serrano 12",
    latitude: 40.43,
    longitude: -3.68,
    lastSyncedAt: ago(2),
    photoCount: 24,
    hasCover: true,
    videoCount: 1,
    planCount: 0,
    interestSignals: 4,
    upcomingStops: 1,
    ...over,
  };
}

// ── Tipo normalizado ─────────────────────────────────────────────────────────
console.log("\n🏷  TIPO NORMALIZADO (20 valores crudos → 8 conceptos)\n");

const TYPE_CASES: Array<[string | null, string]> = [
  ["Piso", "flat"],
  ["piso", "flat"],
  ["apartamento", "flat"],
  ["Apartamento", "flat"],
  ["Ático", "penthouse"],
  ["atico", "penthouse"],
  ["Aticos-duplex", "penthouse"],
  ["Ático Dúplex", "penthouse"],
  ["Dúplex", "duplex"],
  ["Triplex", "triplex"],
  ["estudio", "studio"],
  ["Estudio", "studio"],
  ["house", "house"],
  ["Casa", "house"],
  ["Chalets-independientes", "house"],
  ["Chalet Independiente", "house"],
  ["Adosados", "townhouse"],
  ["Oficina", "office"],
  ["Locales-comerciales", "commercial"],
  ["Garajes", "garage"],
  [null, "unknown"],
];
let typeOk = true;
for (const [raw, want] of TYPE_CASES) {
  if (normalizePropertyType(raw) !== want) {
    typeOk = false;
    console.log(`     · "${raw}" → ${normalizePropertyType(raw)} (esperaba ${want})`);
  }
}
check("los 21 valores vistos en producción casan con su concepto", typeOk);

check(
  "lo que no está en el mapa sale como 'unknown', jamás se adivina",
  normalizePropertyType("Palacete") === "unknown",
);
check(
  "el override del agente gana a la regla",
  normalizePropertyType("Piso", "penthouse") === "penthouse",
);
check(
  "un override corrupto NO gana: cae a la regla",
  normalizePropertyType("Piso", "castillo") === "flat",
);

// ── Amenities ────────────────────────────────────────────────────────────────
console.log("\n🧹 AMENITIES (el vertedero, separado en tres montones)\n");

const dirty = normalizeAmenities([
  "Ascensor",
  "Con ascensor",
  "Aire acondicionado",
  "Amueblado y cocina equipada",
  "Terraza y balcón",
  "Armarios empotrados",
  "Baño en suite",
  "Portero",
  "Piscina",
  "Reformado",
  // el ruido real de producción:
  "60 m² construidos",
  "5 baños",
  "2 habitaciones",
  "Construido en 1970",
  "1ª planta exterior",
  "Orientación sur",
  "oeste",
  "Consumo:",
  "Emisiones:",
  "No indicado",
  "Segunda mano/buen estado",
  "Plaza de garaje por 150 €/mes adicionales",
  // algo que ninguna regla conoce:
  "Chimenea de mármol",
]);

check(
  "'Ascensor' y 'Con ascensor' son UNA amenity de edificio",
  dirty.building.includes("lift") && dirty.building.filter((a) => a === "lift").length === 1,
);
check(
  "'Amueblado y cocina equipada' produce DOS claves",
  dirty.unit.includes("furnished") && dirty.unit.includes("equipped_kitchen"),
);
check(
  "'Terraza y balcón' también",
  dirty.unit.includes("terrace") && dirty.unit.includes("balcony"),
);
check("portero y piscina van al edificio", dirty.building.includes("concierge") && dirty.building.includes("pool"));
check(
  "metros, baños, año, planta y orientación NO son amenities (ni leftover)",
  !JSON.stringify(dirty).includes("m²") &&
    !dirty.leftover.some((f) => /baños|planta|Construido|Orientación|oeste/i.test(f)),
);
check(
  "lo desconocido se conserva en crudo, no se tira",
  dirty.leftover.includes("Chimenea de mármol"),
);
check(
  "features_manual del agente entra en la misma normalización",
  normalizeAmenities([], ["Trastero"]).unit.includes("storage"),
);
check(
  "el precio de la plaza de garaje es ruido (lleva €), no amenity",
  !dirty.leftover.some((f) => f.includes("€")),
);

// ── Bloqueos de publicación ──────────────────────────────────────────────────
console.log("\n🌐 CONTRATO DE PUBLICACIÓN (bloqueos V1, y solo esos)\n");

check("una ficha completa no tiene bloqueos", derivePublicationBlockers(facts()).length === 0);
check(
  "sin foto NI portada se bloquea",
  derivePublicationBlockers(facts({ photoCount: 0, hasCover: false })).includes("no_photos"),
);
check(
  "archivada se bloquea por estado",
  derivePublicationBlockers(facts({ status: "archived" })).includes("invalid_status"),
);
check(
  "sin plano, sin vídeo y sin coordenadas NO se bloquea: eso es mejora",
  derivePublicationBlockers(
    facts({ planCount: 0, videoCount: 0, latitude: null, longitude: null }),
  ).length === 0,
);

// ── Health ───────────────────────────────────────────────────────────────────
console.log("\n💚 PROPERTY HEALTH (palabras defendibles, no un 0-100)\n");

check("una ficha redonda es excelente", deriveHealth(facts(), NOW).overall === "excellent");

check(
  "un estudio con 0 dormitorios NO pierde por ello",
  deriveHealth(facts({ propertyType: "estudio", bedrooms: 0 }), NOW).dimensions.core ===
    "excellent",
);

check(
  "solo-zona es INCOMPLETO en ubicación, no urgencia — es el 76% del catálogo",
  (() => {
    const h = deriveHealth(facts({ address: null, latitude: null, longitude: null }), NOW);
    return h.dimensions.location === "incomplete" && h.overall === "excellent";
  })(),
);

check(
  "publicada con bloqueos = atención (incoherencia)",
  deriveHealth(facts({ description: null, publishedWeb: true }), NOW).dimensions.publication ===
    "needs_attention",
);

check(
  "lista y sin publicar es 'bien': una decisión, no un fallo",
  deriveHealth(facts({ publishedWeb: false }), NOW).dimensions.publication === "good",
);

check(
  "manual no puede quedarse rancia: no tiene origen que sincronizar",
  deriveHealth(facts({ source: "manual", lastSyncedAt: null }), NOW).dimensions.freshness ===
    "good",
);

check(
  "scrape sin sincronizar 40 días arrastra el global a 'atención'",
  (() => {
    const h = deriveHealth(facts({ lastSyncedAt: ago(40) }), NOW);
    return h.dimensions.freshness === "needs_attention" && h.overall === "needs_attention";
  })(),
);

check(
  "disponible sin una sola señal de demanda avisa (comercialmente lo es)",
  deriveHealth(facts({ interestSignals: 0, upcomingStops: 0 }), NOW).dimensions.demand ===
    "needs_attention",
);

// ── Atención ─────────────────────────────────────────────────────────────────
console.log("\n🎯 ATENCIÓN (operativo mete en cola; mejora no tiñe de rojo)\n");

check(
  "ESCENARIO D · disponible + sync >30d = atención operativa, sin auto-archivar",
  (() => {
    const a = deriveAttention(facts({ lastSyncedAt: ago(37) }), NOW);
    return a.operational.includes("stale_sync") && needsAttention(a);
  })(),
);

check(
  "sin plano es MEJORA: 686 pisos sin plano no son 686 urgencias",
  (() => {
    const a = deriveAttention(facts({ planCount: 0 }), NOW);
    return a.enhancements.includes("no_plan") && !a.operational.includes("stale_sync") && !needsAttention(a);
  })(),
);

check(
  "disponible sin fotos SÍ es operativo",
  needsAttention(deriveAttention(facts({ photoCount: 0, hasCover: false }), NOW)),
);

check(
  "una archivada no reclama nada",
  (() => {
    const a = deriveAttention(facts({ status: "archived", photoCount: 0 }), NOW);
    return a.operational.length === 0 && a.enhancements.length === 0;
  })(),
);

check(
  "publicada con datos incompletos es incoherencia operativa",
  deriveAttention(facts({ description: null }), NOW).operational.includes(
    "publication_inconsistency",
  ),
);

// ============================================================================
console.log(`\n${failures === 0 ? "✅ TODO OK" : `❌ ${failures} FALLO(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
