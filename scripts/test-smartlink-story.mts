// SmartLink 2.0 · tests deterministas del sprint (sin red, sin IA, sin BD).
// npm run test:smartlink
//
// Cubre las piezas puras del sistema: fallback splitter, validación de claims
// (conflictos/duplicados/boilerplate — incluido el caso real del benchmark:
// specs=2 dormitorios vs "tres dormitorios"), taxonomía de features, tiempos
// a POIs por geometría y selección de hero-vídeo.

import { splitDescriptionForFallback } from "../lib/services/story/fallback";
import { validateClaims, extractArea } from "../lib/services/story/validate";
import type { StoryClaim } from "../lib/services/story/types";
import { groupFeatures } from "../lib/property-features-taxonomy";
import { computePoiTravel } from "../lib/geo/poi-distance";
import { extractFloor } from "../lib/floor";
import { enforceStoryInvariants } from "../lib/services/story/structure";

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

// ── 2b) Dedupe sobre el HECHO, no la frase (fix del piloto BC-1416) ──
console.log("Dedupe por hecho (frase multi-hecho):");
{
  const mk = (source: string, fact: string, category: StoryClaim["category"]): StoryClaim => ({
    source_text: source, source_field: "description", category,
    fact, confidence: 0.9, is_duplicate: false, conflict: false,
  });
  const facts = {
    bedrooms: 3, bathrooms: 4, squareMeters: 322, floor: null,
    features: ["Baño en suite", "Ascensor", "Trastero", "Reformado", "Amueblado"],
  };
  const S1 =
    "La zona de noche cuenta con tres amplios dormitorios, todos ellos con baño en suite y carpintería a medida, además de una estancia revestida en madera.";
  // Caso 1: 1 duplicate + 2 unique en la MISMA frase.
  const c1 = [
    mk(S1, "Tres amplios dormitorios con baño en suite.", "private"),
    mk(S1, "Carpintería a medida en dormitorios.", "finishes"),
    mk(S1, "Estancia revestida en madera que funciona como despacho.", "private"),
  ];
  validateClaims(c1, facts);
  check("dup: '3 dormitorios + suite' → duplicate", c1[0].is_duplicate === true && !c1[0].conflict);
  check("unique: 'carpintería a medida' sobrevive", !c1[1].is_duplicate && !c1[1].conflict);
  check("unique: 'estancia en madera' sobrevive", !c1[2].is_duplicate && !c1[2].conflict);

  // Caso 2: 2 duplicates + 1 unique en la misma frase.
  const S2 = "Edificio clásico de 1945 dotado de ascensor, conserjería y trastero.";
  const c2 = [
    mk(S2, "Dispone de ascensor.", "building"),
    mk(S2, "Cuenta con trastero.", "building"),
    mk(S2, "Edificio clásico de 1945 perfectamente conservado.", "building"),
  ];
  validateClaims(c2, facts);
  check("2 dups: ascensor y trastero → duplicate", c2[0].is_duplicate && c2[1].is_duplicate);
  check("unique: '1945' sobrevive al dedupe", !c2[2].is_duplicate && !c2[2].conflict);

  // Caso 3: duplicate y conflict coexistiendo en la misma frase origen.
  const S3 = "La vivienda ofrece cuatro baños y cinco dormitorios amplios.";
  const c3 = [
    mk(S3, "Cuatro baños completos.", "private"),
    mk(S3, "Cinco dormitorios amplios.", "private"),
    mk(S3, "Dormitorios amplios.", "private"),
  ];
  validateClaims(c3, facts);
  check("mismo origen: '4 baños' → duplicate", c3[0].is_duplicate === true);
  check("mismo origen: '5 dormitorios' → CONFLICT (specs=3)", c3[1].conflict === true);
  check("respaldo por frase acotado a la dimensión (private)", c3[2].conflict === true);
}

// ── 2b-bis) Engine v4.1: superficie vs distancia ──
console.log("Superficie vs distancia (v4.1):");
{
  // DEBE detectar superficie
  const areaCases: Array<[string, number]> = [
    ["La vivienda cuenta con 200 m².", 200],
    ["200 m2 construidos.", 200],
    ["200 metros cuadrados.", 200],
    ["Cuenta con 180 metros útiles.", 180],
    ["Superficie construida de 220 m².", 220],
  ];
  for (const [text, expected] of areaCases) {
    check(`área: "${text.slice(0, 32)}…" → ${expected}`, extractArea(text) === expected, String(extractArea(text)));
  }
  // NO debe detectar superficie
  const distanceCases = [
    "A 200 metros del Parque del Retiro.",
    "Parking a menos de 50 metros.",
    "A escasos 300 metros de la Castellana.",
    "La estación está a 150 metros.",
    "A 100 metros andando.",
  ];
  for (const text of distanceCases) {
    check(`distancia: "${text.slice(0, 32)}…" → null`, extractArea(text) === null, String(extractArea(text)));
  }
  // Mixtos: área correcta, distancia ignorada
  check('mixto: "Vivienda de 180 m² situada a 200 metros del Retiro." → 180',
    extractArea("Vivienda de 180 m² situada a 200 metros del Retiro.") === 180,
    String(extractArea("Vivienda de 180 m² situada a 200 metros del Retiro.")));
  check('mixto: "Piso de 150 metros cuadrados, a 50 metros del metro." → 150',
    extractArea("Piso de 150 metros cuadrados, a 50 metros del metro.") === 150,
    String(extractArea("Piso de 150 metros cuadrados, a 50 metros del metro.")));

  // Caso real del catálogo: distancia NO debe generar conflicto de superficie
  const mkc = (source: string, fact: string, category: StoryClaim["category"]): StoryClaim => ({
    source_text: source, source_field: "description", category,
    fact, confidence: 0.9, is_duplicate: false, conflict: false,
  });
  const realFacts = { bedrooms: 3, bathrooms: 2, squareMeters: 427, floor: null, features: [] };
  const realClaims = [mkc("Con parking a menos de 50 metros.", "Parking a menos de 50 metros.", "building")];
  validateClaims(realClaims, realFacts);
  check("BC-1419: 'parking a 50 metros' vs 427 m² → SIN conflicto", realClaims[0].conflict === false,
    realClaims[0].conflict_reason ?? "");

  // Y un conflicto de superficie REAL sigue detectándose
  const realArea = [mkc("La vivienda tiene 200 m² construidos.", "Superficie de 200 m².", "overview")];
  validateClaims(realArea, { bedrooms: 3, bathrooms: 2, squareMeters: 88, floor: null, features: [] });
  check("conflicto real de superficie (200 m² vs 88) SÍ se detecta", realArea[0].conflict === true);
}

// ── 2c) Planta: regresión BC-1416 (contexto de elemento secundario) ──
console.log("Planta (regla contextual):");
{
  const DESC_1416 =
    "Con una superficie de 322 m² construidos, la vivienda presenta una distribución elegante. En la planta baja del edificio, la propiedad dispone de un trastero actualmente acondicionado como gimnasio privado equipado con material NOHRD en nogal.";
  check("BC-1416: 'planta baja del trastero' NO se atribuye a la vivienda → null",
    extractFloor(["Reformado", "Amueblado", "Balcón", "Trastero", "Ascensor"], "Vivienda única de diseño", DESC_1416) === null);
  check("legítimo: 'tercera planta exterior de una finca clásica' → 3",
    extractFloor([], null, "Ubicado en la tercera planta exterior de una finca clásica de 1945, el edificio cuenta con ascensor.") === 3);
  check("feature corta 'Planta 3ª exterior' sigue funcionando → 3",
    extractFloor(["Planta 3ª exterior"], null, null) === 3);
  check("garaje en planta -1 no contamina → null",
    extractFloor([], null, "El garaje se encuentra en la planta -1 del edificio.") === null);
}

// ── 2d) Invariantes v4: un bloque/capítulo, ownership, entidades ──
console.log("Invariantes editoriales (v4):");
{
  const mkClaim = (fact: string, category: StoryClaim["category"], source = fact): StoryClaim => ({
    source_text: source, source_field: "description", category,
    fact, confidence: 0.9, is_duplicate: false, conflict: false,
  });
  const claims = [
    mkClaim("Suelos de roble en espiga", "finishes"),                       // 0
    mkClaim("Carpinterías a medida", "finishes"),                            // 1
    mkClaim("Lavandería independiente", "private"),                          // 2
    mkClaim("Cocina Moretti equipada con Miele y Quooker", "kitchen"),       // 3
    mkClaim("Vivienda única de diseño", "overview",
      "Vivienda única de diseño en el corazón de Almagro"),                  // 4
  ];
  const drafts = [
    // Dos bloques del MISMO capítulo (finishes) → debe quedar UNO.
    { chapter: "finishes" as const, copy: "Suelos de roble en espiga.", claim_indexes: [0] },
    { chapter: "finishes" as const, copy: "Carpinterías a medida y suelos de roble.", claim_indexes: [0, 1] },
    // Cocina intentando robar la lavandería (private) → ownership la expulsa.
    { chapter: "kitchen" as const, copy: "Cocina Moretti con Miele y Quooker, junto a lavandería.", claim_indexes: [3, 2] },
    // Entidad sustituida: la fuente dice Almagro; el copy dice Madrid → conflict.
    { chapter: "overview" as const, copy: "Vivienda única de diseño en el corazón de Madrid.", claim_indexes: [4] },
  ];
  const { blocks, unusedValid } = enforceStoryInvariants(drafts, claims);
  const finishes = blocks.filter((b) => b.chapter === "finishes");
  check("un solo bloque por capítulo (finishes ×2 → ×1)", finishes.length === 1);
  check("gana el bloque con más claims propios", finishes[0]?.claim_indexes.length === 2);
  const kitchen = blocks.find((b) => b.chapter === "kitchen");
  check("ownership: la lavandería (private) NO alimenta cocina",
    kitchen != null && !kitchen.claim_indexes.includes(2));
  check("la lavandería queda como claim válido sin usar", unusedValid.includes(2));
  const overview = blocks.find((b) => b.chapter === "overview");
  check("entidad sustituida (Almagro→Madrid) → bloque en conflict",
    overview?.status === "conflict" && /Madrid/.test(overview?.conflictNote ?? ""));
  check("entidad respaldada NO dispara conflicto",
    enforceStoryInvariants(
      [{ chapter: "kitchen", copy: "Cocina Moretti con electrodomésticos Miele.", claim_indexes: [3] }],
      claims,
    ).blocks[0]?.status === "generated");
  check("un claim no alimenta dos bloques",
    (() => {
      const r = enforceStoryInvariants(
        [
          { chapter: "finishes", copy: "Suelos de roble en espiga.", claim_indexes: [0] },
          { chapter: "finishes", copy: "Roble en espiga y carpinterías.", claim_indexes: [0, 1] },
        ],
        claims,
      );
      const all = r.blocks.flatMap((b) => b.claim_indexes);
      return new Set(all).size === all.length;
    })());
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

  // POI con superficie: el Retiro real ocupa ~1,5 km. Una vivienda pegada a
  // su verja sur (Conde de Cartagena, caso real de BC-1390) debe medirse
  // contra el borde del parque, no contra el centroide del polígono, que
  // queda kilómetro y medio hacia dentro y daba "≈ 18 min a pie".
  const RETIRO_BOUNDS = { minLat: 40.4083, minLng: -3.6900, maxLat: 40.4216, maxLng: -3.6746 };
  const enLaVerja = { lat: 40.4087, lng: -3.6735 };
  const sinBbox = computePoiTravel(enLaVerja, {
    name: "Parque del Retiro", category: "parque",
    latitude: 40.4153, longitude: -3.6845, travel_modes: ["walk"],
  });
  const conBbox = computePoiTravel(enLaVerja, {
    name: "Parque del Retiro", category: "parque",
    latitude: 40.4153, longitude: -3.6845, travel_modes: ["walk"],
    bounds: RETIRO_BOUNDS,
  });
  check(
    "parque con envolvente → se mide al borde, no al centro",
    conBbox != null && sinBbox != null && conBbox.minutes < sinBbox.minutes / 2,
    JSON.stringify({ sinBbox, conBbox }),
  );
  check("vivienda en la verja del Retiro ≤ 5 min a pie", conBbox != null && conBbox.minutes <= 5, JSON.stringify(conBbox));

  // Dentro del recinto → distancia cero, nunca negativa ni NaN.
  const dentro = computePoiTravel(
    { lat: 40.4150, lng: -3.6820 },
    {
      name: "Parque del Retiro", category: "parque",
      latitude: 40.4153, longitude: -3.6845, travel_modes: ["walk"],
      bounds: RETIRO_BOUNDS,
    },
  );
  check("punto dentro del recinto → 1 min (mínimo), no negativo", dentro != null && dentro.minutes === 1, JSON.stringify(dentro));
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
