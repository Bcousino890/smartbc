// SmartLink 2.0 · tests deterministas del sprint (sin red, sin IA, sin BD).
// npm run test:smartlink
//
// Cubre las piezas puras del sistema: fallback splitter, validación de claims
// (conflictos/duplicados/boilerplate — incluido el caso real del benchmark:
// specs=2 dormitorios vs "tres dormitorios"), taxonomía de features, tiempos
// a POIs por geometría y selección de hero-vídeo.

import { splitDescriptionForFallback } from "../lib/services/story/fallback";
import { validateClaims } from "../lib/services/story/validate";
import type { StoryClaim } from "../lib/services/story/types";
import { groupFeatures } from "../lib/property-features-taxonomy";
import { computePoiTravel } from "../lib/geo/poi-distance";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 1) Fallback splitter ──
console.log("Fallback determinista:");
{
  const short = "Piso exterior reformado con dos dormitorios y balcón a la calle en finca clásica con portero, listo para entrar a vivir en el corazón de Recoletos junto al Retiro.";
  const shortBlocks = splitDescriptionForFallback(short);
  check("descripción corta → 1 bloque intacto", shortBlocks.length === 1 && shortBlocks[0] === short.trim());

  const sentence =
    "Este piso con cinco balcones exteriores se encuentra en el barrio de Almagro a escasos pasos del metro. ";
  const long = sentence.repeat(20); // ~340 palabras
  const blocks = splitDescriptionForFallback(long);
  const words = (t: string) => (t.match(/\S+/g) ?? []).length;
  check("descripción larga → varios bloques", blocks.length >= 4, `${blocks.length} bloques`);
  check("ningún bloque supera 70 palabras", blocks.every((b) => words(b) <= 70),
    `máx ${Math.max(...blocks.map(words))}`);
  check("no se pierde texto", words(blocks.join(" ")) === words(long));
  check("abreviatura S.XX no parte frase", splitDescriptionForFallback(
    ("Se sitúa en un edificio de principios del S.XX y cuenta con portero en la finca de la calle mayor. ".repeat(10))
  ).every((b) => !/^XX/.test(b)));
}

// ── 2) Validación: el caso real del benchmark ──
console.log("Validación de claims:");
{
  const mk = (source: string, category: StoryClaim["category"]): StoryClaim => ({
    source_text: source, source_field: "description", category,
    fact: source, confidence: 0.9, is_duplicate: false, conflict: false,
  });
  const facts = {
    bedrooms: 2, bathrooms: 2, squareMeters: 88, floor: 3,
    features: ["Portero", "Reformado", "Balcón", "Aire acondicionado", "Armarios empotrados"],
  };
  const claims = [
    mk("La zona de noche se compone de tres dormitorios con armarios de suelo a techo", "private"),
    mk("Cuenta con dos baños completos", "private"),
    mk("Tiene una superficie de 88 m2 bien distribuidos", "overview"),
    mk("El edificio cuenta con portero", "building"),
    mk("Techos altos de casi tres metros y molduras originales", "finishes"),
    mk("En nuestra página web puedes acceder a más inmuebles off-market", "overview"),
    mk("Dispone de un servicio de Call Center 24 horas al día", "overview"),
  ];
  validateClaims(claims, facts);
  check("specs=2 vs 'tres dormitorios' → CONFLICT", claims[0].conflict === true, claims[0].conflict_reason ?? "");
  check("'dos baños' coincide → duplicado, no conflicto", !claims[1].conflict && claims[1].is_duplicate);
  check("'88 m2' → duplicado de specs", claims[2].is_duplicate === true);
  check("'portero' → duplicado de features", claims[3].is_duplicate === true);
  check("'techos de tres metros' NO es conflicto de dormitorios", claims[4].conflict === false);
  check("boilerplate web/off-market descartado", claims[5].category === "boilerplate");
  check("boilerplate call center descartado", claims[6].category === "boilerplate");
}

// ── 3) Taxonomía de features ──
console.log("Taxonomía de features:");
{
  const groups = groupFeatures([
    "Ascensor", "Portero", "Terraza", "Aire acondicionado", "Amueblado",
    "Piscina", "Certificado energético: E", "Chimenea francesa", "Rasgo rarísimo XYZ",
  ]);
  const byGroup = Object.fromEntries(groups.map((g) => [g.group, g.items]));
  check("ascensor/portero/piscina → edificio",
    ["Ascensor", "Portero", "Piscina"].every((f) => byGroup.edificio?.includes(f)));
  check("terraza/AC/amueblado/chimenea → residencia",
    ["Terraza", "Aire acondicionado", "Amueblado", "Chimenea francesa"].every((f) => byGroup.residencia?.includes(f)));
  check("certificado → técnico", byGroup.tecnico?.includes("Certificado energético: E") === true);
  check("no mapeado → OTROS (nunca se pierde)", byGroup.otros?.includes("Rasgo rarísimo XYZ") === true);
}

// ── 4) POIs por geometría ──
console.log("Tiempos a POIs:");
{
  // Piso en Recoletos (Villanueva) → Retiro: ~600m reales.
  const t1 = computePoiTravel(
    { lat: 40.4218, lng: -3.6839 },
    { name: "Parque del Retiro", category: "parque", latitude: 40.4153, longitude: -3.6845, travel_modes: ["walk"] },
  );
  check("Retiro desde Recoletos ≈ a pie <15 min", t1 != null && t1.mode === "walk" && t1.minutes <= 15, JSON.stringify(t1));
  // Lejano y solo drive → coche.
  const t2 = computePoiTravel(
    { lat: 40.5197, lng: -3.6332 },
    { name: "Aeropuerto", category: "transporte", latitude: 40.4936, longitude: -3.5668, travel_modes: ["drive"] },
  );
  check("aeropuerto → en coche", t2 != null && t2.mode === "drive" && t2.minutes >= 10, JSON.stringify(t2));
  // walk-only demasiado lejos → null (no inventar).
  const t3 = computePoiTravel(
    { lat: 40.4218, lng: -3.6839 },
    { name: "Muy lejos", category: "otro", latitude: 40.52, longitude: -3.56, travel_modes: ["walk"] },
  );
  check("walk-only fuera de rango → sin dato (no se inventa)", t3 === null);
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
