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

// ── 5) Gate SPARSE — alineación con la política aprobada (2026-08-22) ──
console.log("Gate SPARSE (2 capítulos + ≥4 fotos + ≥2 apoyos):");
{
  const { planPublication } = await import("../lib/services/story/gate");
  const mkBlocks = () => [
    { id: "b1", chapter: "living", copy: "Salón amplio con orientación sur y balcón corrido a la calle principal.", status: "generated", claim_ids: ["c1"] },
    { id: "b2", chapter: "kitchen", copy: "Cocina equipada con office y zona de lavadero independiente al fondo.", status: "generated", claim_ids: ["c2"] },
  ];
  const claims = [
    { id: "c1", source_text: "salón amplio con orientación sur y balcón corrido a la calle", fact: "salón amplio con orientación sur y balcón", category: "espacios" },
    { id: "c2", source_text: "cocina equipada con office y zona de lavadero independiente", fact: "cocina equipada con office y lavadero", category: "espacios" },
  ];
  const base = {
    property: { id: "p1", bc_reference: "BC-TEST", slug: "t", zone: "Goya", subzone: null, title: "Piso", description: "d", features: ["Ascensor", "Aire acondicionado", "Exterior"], features_manual: [], status: "available", archived_at: null },
    claims,
    neighborhoodDisplayName: "Goya",
    hasVideo: false, hasPlan: false, hasValidLocation: false,
  };
  const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ position: i, ai_class: null, ai_confidence: null, class_override: null }));

  // La política aprobada: 2 caps + ≥4 fotos + ≥2 apoyos (hood + features) → SPARSE.
  const p4 = planPublication({ ...base, blocks: mkBlocks(), photos: photos(4) } as any);
  check("2 caps + 4 fotos + 2 apoyos → SPARSE publicable", p4.publishable && p4.mode === "sparse", JSON.stringify(p4.storyFailures));

  const p7 = planPublication({ ...base, blocks: mkBlocks(), photos: photos(7) } as any);
  check("2 caps + 7 fotos + 2 apoyos → SPARSE publicable", p7.publishable && p7.mode === "sparse", JSON.stringify(p7.storyFailures));

  // 0-3 fotos sigue siendo fallback: NO se ha bajado ese suelo.
  const p3 = planPublication({ ...base, blocks: mkBlocks(), photos: photos(3) } as any);
  check("2 caps + 3 fotos → sigue en fallback (suelo de 4 intacto)", !p3.publishable);

  // Con un solo apoyo tampoco: el requisito de 2 apoyos no se toca.
  const p1sup = planPublication({ ...base, neighborhoodDisplayName: null, property: { ...base.property, features: [] }, blocks: mkBlocks(), photos: photos(6) } as any);
  check("2 caps + 6 fotos + 1 apoyo → sigue en fallback", !p1sup.publishable);
}

// ── 6) Override humano de planta (migración 0146) ──
console.log("Override de planta:");
{
  const { parseFloorOverride, resolveFloor } = await import("../lib/floor");
  check("'none' → null (sin planta: chalet)", parseFloorOverride("none") === null);
  check("'3' → 3", parseFloorOverride("3") === 3);
  check("sin override → undefined (aplica el parser)", parseFloorOverride(null) === undefined);
  check("valor corrupto → undefined (no inventa)", parseFloorOverride("garbage") === undefined);
  // Caso real BC-0002: "planta baja o sótano" describe un nivel interno del
  // chalet; con override 'none' el key fact no se pinta.
  const desc = "La vivienda se distribuye en tres plantas: planta baja o sótano, planta principal y planta alta.";
  check("BC-0002 sin override → el parser infiere 0 (el caso dudoso)", resolveFloor(null, [], null, desc) === 0);
  check("BC-0002 con override 'none' → null, el key fact Planta no se pinta", resolveFloor("none", [], null, desc) === null);
}

// ── 6b) Geometría del mosaico de teselas (Luxury Location Module) ──
console.log("Mosaico del mapa:");
{
  const { buildMosaic, latLngToTile, contextZoomForWidth } = await import("../lib/geo/tile-math");
  // Se contrasta contra la MISMA proyección calculada por otro camino
  // (Web Mercator con ln·tan en vez de asinh: equivalentes matemáticamente,
  // implementaciones distintas). Comprobación real, no una constante copiada.
  const t = latLngToTile(40.4168, -3.7038, 15);
  const n = 2 ** 15;
  const expX = ((-3.7038 + 180) / 360) * n;
  const phi = (40.4168 * Math.PI) / 180;
  const expY = ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * n;
  check("proyección coincide con Web Mercator por otra vía",
    Math.abs(t.x - expX) < 1e-6 && Math.abs(t.y - expY) < 1e-6,
    JSON.stringify({ got: t, expX, expY }));

  const W = 900, H = 520;
  const m = buildMosaic({ lat: 40.4168, lng: -3.7038, zoom: 15, width: W, height: H });
  check("cubre todo el contenedor sin huecos", m.tiles.length >= Math.ceil(W / 256) * Math.ceil(H / 256), `${m.tiles.length} teselas`);
  const covered = m.tiles.every((x) => x.left > -256 && x.top > -256 && x.left < W && x.top < H);
  check("ninguna tesela fuera del lienzo", covered);
  check("todas las teselas dentro del rango del zoom",
    m.tiles.every((x) => x.x >= 0 && x.x < 2 ** 15 && x.y >= 0 && x.y < 2 ** 15));

  // El centro proyecta exactamente al centro: el marcador cae sobre la casa.
  const c = m.project(40.4168, -3.7038);
  check("el centro proyecta al centro del contenedor",
    Math.abs(c.left - W / 2) < 0.01 && Math.abs(c.top - H / 2) < 0.01, JSON.stringify(c));
  // Un punto al norte proyecta ARRIBA (y crece hacia el sur).
  const north = m.project(40.4268, -3.7038);
  check("un POI al norte se dibuja por encima del centro", north.top < c.top);
  const east = m.project(40.4168, -3.6938);
  check("un POI al este se dibuja a la derecha", east.left > c.left);

  // El zoom se adapta al ancho para enseñar una porción comparable de ciudad.
  const zMobile = contextZoomForWidth(358, 40.42);
  const zDesktop = contextZoomForWidth(1100, 40.42);
  check("móvil usa menos zoom que escritorio para el mismo barrio", zMobile < zDesktop, `${zMobile} vs ${zDesktop}`);
  check("zoom siempre en rango de contexto de barrio (13-17)",
    [zMobile, zDesktop].every((z) => z >= 13 && z <= 17), `${zMobile}/${zDesktop}`);
}

// ── 6c) DESTINATION FOCUS: encuadre de vivienda + destino ──
console.log("Destination focus:");
{
  const { fitTwoPoints, buildMosaic } = await import("../lib/geo/tile-math");
  const casa = { lat: 40.4265, lng: -3.6866 };   // Recoletos
  const retiro = { lat: 40.4153, lng: -3.6845 }; // Parque del Retiro
  const W = 900, H = 520, PAD = 120;
  const v = fitTwoPoints({ a: casa, b: retiro, width: W, height: H, padding: PAD, maxZoom: 16 });
  const m = buildMosaic({ lat: v.lat, lng: v.lng, zoom: v.zoom, width: W, height: H });
  const pc = m.project(casa.lat, casa.lng);
  const pd = m.project(retiro.lat, retiro.lng);
  // El padding que se pide es una PREFERENCIA; la garantía del encuadre es el
  // margen mínimo (10% del lado menor), porque el zoom solo puede ser entero y
  // ceñirse al nivel bueno vale más que respetar un padding holgado.
  const MARGEN = Math.max(24, Math.min(W, H) * 0.1);
  const dentro = (p: { left: number; top: number }) =>
    p.left >= MARGEN && p.left <= W - MARGEN && p.top >= MARGEN && p.top <= H - MARGEN;
  check("vivienda y destino caben los DOS con margen digno", dentro(pc) && dentro(pd), JSON.stringify({ pc, pd, v, MARGEN }));
  check("ninguno queda pegado a un borde", pc.left > 8 && pd.left > 8 && pc.top > 8 && pd.top > 8);
  check("no se acerca más de lo que permite el contexto", v.zoom <= 16);
  // Regresión: floor() perdía un nivel entero de zoom y se veía media ciudad
  // para dos puntos a poco más de un kilómetro.
  const spanM = (900 * 156543.03392 * Math.cos((casa.lat * Math.PI) / 180)) / 2 ** v.zoom;
  check("el encuadre es ajustado, no media ciudad (<3,5 km de ancho)",
    spanM < 3500, `${Math.round(spanM)} m de ancho a z${v.zoom}`);

  // Dos puntos casi encima: el encuadre no debe dispararse a zoom absurdo.
  const casi = { lat: 40.4266, lng: -3.6867 };
  const vz = fitTwoPoints({ a: casa, b: casi, width: W, height: H, padding: PAD, maxZoom: 16 });
  check("destino pegado a la vivienda → zoom acotado", vz.zoom === 16, String(vz.zoom));

  // La ficha contextual vive en una banda superior reservada: tras encuadrar
  // en un lienzo más bajo y bajar el contenido, NINGÚN marcador puede caer
  // dentro de esa banda (en móvil la ficha ocupa casi todo el ancho y no hay
  // escape horizontal posible).
  const { shiftViewVertically } = await import("../lib/geo/tile-math");
  const BAND = 168, MW = 358, MH = 420;
  const fittedM = fitTwoPoints({
    a: casa, b: retiro, width: MW, height: MH - BAND,
    padding: Math.max(48, Math.round(Math.min(MW, MH - BAND) * 0.12)), maxZoom: 16,
  });
  const shifted = shiftViewVertically(fittedM, -BAND / 2);
  const mm = buildMosaic({ lat: shifted.lat, lng: shifted.lng, zoom: shifted.zoom, width: MW, height: MH });
  const mc = mm.project(casa.lat, casa.lng);
  const md = mm.project(retiro.lat, retiro.lng);
  check("móvil: ningún marcador cae en la banda de la ficha",
    mc.top > BAND - 20 && md.top > BAND - 20, JSON.stringify({ mc, md, BAND }));
  check("móvil: los dos siguen dentro del lienzo",
    [mc, md].every((p) => p.top < MH - 8 && p.left > 0 && p.left < MW), JSON.stringify({ mc, md }));
}

// ── 6d) Universidades: catálogo EXISTENTE, cálculo del propio módulo ──
console.log("Universidades cercanas:");
{
  const { findNearbyUniversities } = await import("../lib/geo/universities-nearby");
  const { UNIVERSITIES } = await import("../lib/data/universities");
  const cerca = findNearbyUniversities({ lat: 40.4265, lng: -3.6866 });
  check("devuelve universidades para una propiedad de Madrid", cerca.length > 0, String(cerca.length));
  check("máximo 5", cerca.length <= 5, String(cerca.length));
  check("ordenadas de más cerca a más lejos",
    cerca.every((u, i) => i === 0 || cerca[i - 1].minutes <= u.minutes));
  check("una entrada por universidad (no dos campus de la misma)",
    new Set(cerca.map((u) => u.name)).size === cerca.length);
  check("los nombres salen del catálogo existente",
    cerca.every((u) => UNIVERSITIES.some((x) => (x.shortName ?? x.name) === u.name)));
  check("conserva la semántica de modo del módulo",
    cerca.every((u) => u.mode === "walk" || u.mode === "drive"));
  check("sin coordenadas → ninguna (no se inventan tiempos)",
    findNearbyUniversities({ lat: null, lng: null }).length === 0);
}

// ── 7) Promoción dinámica del estado de experiencia (baseline) ──
console.log("Experience state (promoción automática facts_led → story):");
{
  const { deriveExperienceState } = await import("../lib/db/queries/story");
  check("sin story aprobada → facts_led",
    deriveExperienceState({ hasApprovedVersion: false }) === "facts_led");
  // El MISMO input, con la story ya aprobada: se promociona solo — sin
  // migración, sin flag manual, sin backfill, sin estado por propiedad.
  check("al aprobar (nota SPARSE) → sparse, automático",
    deriveExperienceState({ hasApprovedVersion: true, approvedNotes: "Publicación SPARSE segura" }) === "sparse");
  check("al aprobar con conflictos pendientes → partial",
    deriveExperienceState({ hasApprovedVersion: true, approvedNotes: "Publicación parcial", hasPendingConflictBlocks: true }) === "partial");
  check("al aprobar sin pendientes → complete",
    deriveExperienceState({ hasApprovedVersion: true, approvedNotes: null, hasPendingConflictBlocks: false }) === "complete");
}

// ── 8) PROPERTY PRELUDE · contrato editorial (v2 · opening spread) ──
console.log("Property Prelude:");
{
  const {
    validatePrelude, validatePreludeHeadline, parsePreludeCompletion,
    collectPreludeEvidence, MIN_EVIDENCE_CLAIMS,
  } = await import("../lib/services/story/prelude");
  const EV = [
    "vivienda reformada que conserva elementos originales",
    "Se trata de una vivienda reformada, en la que se han querido conservar muchos de los elementos originales",
    "doble salón con balcones a la calle Ayala",
    "El doble salón se abre a los balcones de la calle Ayala",
    "comedor independiente y cocina con office",
    "comedor independiente, cocina con cerramiento de cristal, península y office",
    "edificio de 1925 con molduras y carpintería originales",
    "La finca, construida en 1925, conserva molduras y carpintería originales",
  ];
  const BUENO = [
    "Una vivienda reformada en una finca de 1925 que ha conservado las molduras y la carpintería originales del edificio. La intervención no borró ese carácter: lo ordenó, dejando que la arquitectura siga marcando el ritmo de las estancias. El resultado es una casa serena, de líneas continuas y proporciones reconocibles.",
    "Los balcones a la calle Ayala abren la zona social al exterior y separan con naturalidad el uso de día del descanso. La distribución se entiende de un vistazo, sin pasillos que sobren ni transiciones forzadas entre una zona y otra.",
  ].join("\n\n");

  const ok = validatePrelude(BUENO, { operation: "rent" }, EV);
  check("apertura editorial válida pasa", ok.ok, ok.failures.join(" · "));
  check("longitud v2 en rango objetivo (70-110)", ok.words >= 70 && ok.words <= 110, String(ok.words));
  check("se compone en dos párrafos", ok.paragraphs === 2, String(ok.paragraphs));

  // §6: el año va en CIFRA. El texto en letra era el estilo de la v1 y ahora
  // se rechaza — es lo que fuerza la regeneración del catálogo.
  const rYear = validatePrelude(BUENO.replace("1925", "mil novecientos veinticinco"), { operation: "rent" }, EV);
  check("año en letra → rechazado (debe ir en cifra)",
    !rYear.ok && rYear.failures.some((f) => f.includes("letra")), rYear.failures.join(" · "));
  const rFake = validatePrelude(BUENO.replace("1925", "1890"), { operation: "rent" }, EV);
  check("año inventado (no está en la evidencia) → rechazado",
    !rFake.ok && rFake.failures.some((f) => f.includes("sin respaldo")), rFake.failures.join(" · "));

  // REGRESIÓN BC-1420: "se vende" fabricado en un alquiler. El caso que
  // motivó todo el contrato — jamás debe volver a cruzar.
  const bc1420 = BUENO.replace("Una vivienda reformada", "Una vivienda que se vende sin amueblar, reformada,");
  const r1 = validatePrelude(bc1420, { operation: "rent" }, EV);
  check("REGRESIÓN BC-1420: 'se vende' en un alquiler → rechazado",
    !r1.ok && r1.failures.some((f) => f.includes("venta")), r1.failures.join(" · "));
  check("y 'amueblado' también se rechaza (dato estructurado)",
    r1.failures.some((f) => f.includes("amueblado")));

  const r2 = validatePrelude(BUENO.replace("Una vivienda reformada", "Una vivienda que se alquila, reformada,"), { operation: "sale" }, EV);
  check("'se alquila' en una venta → rechazado", !r2.ok && r2.failures.some((f) => f.includes("alquiler")));

  const r3 = validatePrelude(BUENO.replace("las estancias", "las estancias de 40 m2"), { operation: "rent" }, EV);
  check("cifra que no es un año → rechazada (Key Facts)",
    !r3.ok && r3.failures.some((f) => f.includes("cifras")), r3.failures.join(" · "));
  const r3b = validatePrelude(BUENO.replace("el ritmo de las estancias", "el ritmo de los tres dormitorios"), { operation: "rent" }, EV);
  check("cuenta de estancias en letra → rechazada", !r3b.ok, r3b.failures.join(" · "));

  const rFloor = validatePrelude(BUENO.replace("Una vivienda reformada", "Una vivienda en una quinta planta, reformada,"), { operation: "rent" }, EV);
  check("menciona la planta → rechazado (Key Fact duplicado)",
    !rFloor.ok && rFloor.failures.some((f) => f.includes("planta")), rFloor.failures.join(" · "));

  const r4 = validatePrelude(BUENO.replace("Una vivienda reformada", "Una vivienda espectacular y única"), { operation: "rent" }, EV);
  check("adjetivos de portal → rechazado", !r4.ok && r4.failures.some((f) => f.includes("portal")));

  // §5 v2: copy que ocupa sitio sin decir nada.
  const r5 = validatePrelude(BUENO.replace("La distribución se entiende de un vistazo", "La distribución elegante lo gobierna todo"), { operation: "rent" }, EV);
  check("copy genérico ('distribución elegante') → rechazado",
    !r5.ok && r5.failures.some((f) => f.includes("genérico")), r5.failures.join(" · "));

  // §4: el Prelude no se come el contenido de los capítulos.
  const r6 = validatePrelude(
    "Una vivienda reformada de 1925 en la que el salón, la cocina y el comedor se ordenan en torno al recibidor. Los dormitorios y los baños ocupan el ala privada, y la terraza cierra el recorrido por la casa.\n\nLa carpintería original marca el carácter de un conjunto que la reforma se limitó a poner en valor sin alterar su lógica.",
    { operation: "rent" }, EV);
  check("enumerar estancias → rechazado (eso lo hacen los capítulos)",
    !r6.ok && r6.failures.some((f) => f.includes("enumera")), r6.failures.join(" · "));

  const r7 = validatePrelude("Una vivienda reformada con carácter.", { operation: "rent" }, EV);
  check("texto demasiado corto → evidencia insuficiente", !r7.ok);
  const r8 = validatePrelude(BUENO + "\n\n" + BUENO, { operation: "rent" }, EV);
  check("demasiado largo / demasiados párrafos → rechazado", !r8.ok);
  const r9 = validatePrelude(BUENO.replace("\n\n", " "), { operation: "rent" }, EV);
  check("un solo párrafo largo → rechazado (vuelve a ser el párrafo suelto)",
    !r9.ok && r9.failures.some((f) => f.includes("un solo párrafo")), r9.failures.join(" · "));

  const r10 = validatePrelude(BUENO.replace("la calle Ayala", "el Palacio de Cristal de Malasaña"), { operation: "rent" }, EV);
  check("entidad sin respaldo en la evidencia → rechazado",
    !r10.ok && r10.failures.some((f) => f.includes("entidades")), r10.failures.join(" · "));

  // Lecciones del piloto v1 (2026-08-22), vigentes en v2:
  const r11 = validatePrelude(BUENO.replace("La intervención no borró ese carácter", "La caldera, la vitrocerámica y la lavadora quedaron nuevas"), { operation: "rent" }, EV);
  check("PILOTO BC-1376: inventario de electrodomésticos → rechazado",
    !r11.ok && r11.failures.some((f) => f.includes("equipamiento")), r11.failures.join(" · "));
  const r12 = validatePrelude(BUENO.replace("lo ordenó", "redujo su coste de mantenimiento"), { operation: "rent" }, EV);
  check("PILOTO BC-0056: 'coste de mantenimiento' → rechazado", !r12.ok);
  const r13 = validatePrelude(BUENO.replace("lo ordenó", "la dejó lista para entrar a vivir"), { operation: "rent" }, EV);
  check("PILOTO BC-0917: frase de portal → rechazado", !r13.ok);

  // dual: las dos familias de operación prohibidas
  const r14 = validatePrelude(BUENO.replace("La intervención", "Ideal para su compra. La intervención"), { operation: "sale", dualOperation: true }, EV);
  check("dual: lenguaje de venta también rechazado", !r14.ok);

  // ── TITULAR editorial (§2) ──
  const h1 = validatePreludeHeadline("Arquitectura de 1925 y una reforma que la respeta", { operation: "rent" }, EV);
  check("titular específico y respaldado pasa", h1.ok, h1.failures.join(" · "));
  const h2 = validatePreludeHeadline("Una vivienda única", { operation: "rent" }, EV);
  check("titular eslogan vacío → rechazado", !h2.ok, h2.failures.join(" · "));
  const h3 = validatePreludeHeadline("Carácter", { operation: "rent" }, EV);
  check("titular demasiado corto → rechazado", !h3.ok && h3.failures.some((f) => f.includes("corto")));
  const h4 = validatePreludeHeadline(
    "Un carácter clásico con interiores definidos por el detalle y la proporción exacta",
    { operation: "rent" }, EV);
  check("titular demasiado largo → rechazado", !h4.ok && h4.failures.some((f) => f.includes("largo")));
  const h5 = validatePreludeHeadline("Molduras originales y luz de la calle Ayala.", { operation: "rent" }, EV);
  check("titular con punto final → rechazado", !h5.ok && h5.failures.some((f) => f.includes("punto")));
  // El límite \b de JavaScript es ASCII: "Única" y "Última" empezaban por
  // vocal acentuada y se colaban enteras por el contrato (652 titulares
  // auditados lo destaparon). Estos dos casos vigilan los límites Unicode.
  const hAcc = validatePreludeHeadline("Única vivienda de 1925 con molduras", { operation: "rent" }, EV);
  check("titular con adjetivo acentuado ('Única') → rechazado",
    !hAcc.ok && hAcc.failures.some((f) => f.includes("portal")), hAcc.failures.join(" · "));
  const hFloor = validatePreludeHeadline("Última planta con carpintería original", { operation: "rent" }, EV);
  check("titular con 'Última planta' → rechazado (Key Fact)",
    !hFloor.ok && hFloor.failures.some((f) => f.includes("planta")), hFloor.failures.join(" · "));
  const hMkt = validatePreludeHeadline("Encanto de 1925 con molduras originales", { operation: "rent" }, EV);
  check("titular marketinero ('Encanto') → rechazado", !hMkt.ok, hMkt.failures.join(" · "));

  const hGen = validatePreludeHeadline("Luz y amplitud en una vivienda contemporánea", { operation: "rent" }, EV);
  check("titular intercambiable → rechazado (valdría para cientos)",
    !hGen.ok && hGen.failures.some((f) => f.includes("intercambiable")), hGen.failures.join(" · "));
  const hAnchored = validatePreludeHeadline("Luz y amplitud tras las molduras de 1925", { operation: "rent" }, EV);
  check("el mismo titular con un ancla propia sí pasa", hAnchored.ok, hAnchored.failures.join(" · "));

  const h6 = validatePreludeHeadline("Lujo y elegancia en Malasaña", { operation: "rent" }, EV);
  check("titular con adjetivo de portal y entidad sin respaldo → rechazado", !h6.ok);

  // El parser separa titular y cuerpo; el contrato juzga después.
  const parsed = parsePreludeCompletion(`TITULAR: Molduras originales y una reforma contenida\n\nPárrafo uno.\n\nPárrafo dos.`);
  // El modelo escribe el rótulo como le parece: seis titulares llegaron a
  // producción con "TÍTULAR:" pegado por no contemplar la falta de ortografía.
  const parsedTypo = parsePreludeCompletion(`TÍTULAR: Bajo de 1930 con patio privado\n\nUno.\n\nDos.`);
  check("el parser tolera el rótulo mal escrito ('TÍTULAR')",
    parsedTypo.headline === "Bajo de 1930 con patio privado", parsedTypo.headline);
  check("parser separa titular y cuerpo",
    parsed.headline === "Molduras originales y una reforma contenida" &&
    parsed.body === "Párrafo uno.\n\nPárrafo dos.", JSON.stringify(parsed));

  // evidencia: solo claims seguros, sin duplicados de key facts ni barrio
  const evidence = collectPreludeEvidence([
    { id: "a", fact: "doble salón con balcones", source_text: "s1", category: "living" },
    { id: "b", fact: "tres dormitorios", source_text: "s2", category: "private", conflict: true },
    { id: "c", fact: "88 m2", source_text: "s3", category: "overview", is_duplicate: true },
    { id: "d", fact: "en el corazón de Salamanca", source_text: "s4", category: "barrio" },
    { id: "e", fact: "cocina con office", source_text: "s5", category: "kitchen" },
  ]);
  check("evidencia excluye conflictos, duplicados y barrio",
    JSON.stringify(evidence.claimIds) === JSON.stringify(["a", "e"]), JSON.stringify(evidence.claimIds));
  check("umbral mínimo de evidencia declarado", MIN_EVIDENCE_CLAIMS >= 3);
}

// ── 9) REGLA DE MICRO-CAPÍTULO · presentación editorial ──
console.log("Micro-capítulos:");
{
  const { isMicroChapter, microChapterFact, informationUnits } = await import("../lib/services/story/micro-chapter");
  // El caso que motivó la regla.
  check("'Finca construida en 1941.' no sostiene un capítulo",
    isMicroChapter("building", "Finca construida en 1941."));
  check("un capítulo con dos datos SÍ se queda, por corto que sea",
    !isMicroChapter("building", "Edificio de 1910 con portería y patio interior."));
  check("dos frases ya sostienen capítulo",
    !isMicroChapter("kitchen", "Cocina funcional. Está integrada en el salón."));
  check("puro adjetivo sin hecho → micro",
    isMicroChapter("finishes", "El hogar es moderno, elegante y cómodo."));
  check("un dato breve pero distintivo se queda (Velux)",
    !isMicroChapter("private", "Dormitorio diáfano en planta superior con ventanas tipo Velux."));
  check("no es solo longitud: texto largo nunca es micro",
    !isMicroChapter("building", "Finca construida en 1941 " + "y ".repeat(20)));
  check("estancias distintas cuentan por separado",
    informationUnits("Salón y comedor independiente") === 2, String(informationUnits("Salón y comedor independiente")));
  check("el dato rescatado pierde el punto final",
    microChapterFact("Finca construida en 1941.") === "Finca construida en 1941");
}

// ── 10) HERO · srcset honesto ──
console.log("Hero media:");
{
  const mod = await import("../app/compartir/[slug]/hero-srcset");
  const { heroSrcSet } = mod;
  check("sin dimensiones conocidas NO se declara srcset",
    heroSrcSet("/p/x/0?v=1", null) === undefined);
  check("una foto pequeña tampoco (no hay nada que ofrecer)",
    heroSrcSet("/p/x/0?v=1", 500) === undefined);
  const ss = heroSrcSet("/p/x/0?v=1", 1600) ?? "";
  check("nunca promete más píxeles de los que hay",
    ss.length > 0 && !/\b(1920|2560|3200)w/.test(ss), ss);
  check("el último candidato es el ancho real del original",
    ss.endsWith("w=1600 1600w"), ss.slice(-30));
  check("los anchos van con & cuando la url ya trae query",
    ss.startsWith("/p/x/0?v=1&w=640 640w"), ss.slice(0, 30));

  // El perfil del CDN de Idealista: la descarga prueba el grande y cae al
  // seguro. Es lo que separaba a BC-1421 (850px) del resto (1600px).
  const { idealistaSourceCandidates } = await import("../lib/sync/scrapers/idealista");
  const cands = idealistaSourceCandidates(
    "https://img4.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/71/33/71/785432477.jpg",
  );
  check("se prueba primero el perfil grande y luego el seguro",
    cands.length === 2 && cands[0].includes("WEB_DETAIL_TOP-XL-L") && cands[1].includes("WEB_DETAIL_TOP-L-L"),
    cands.join(" | "));
  check("una url que no es del CDN de Idealista se deja intacta",
    idealistaSourceCandidates("https://example.com/foto.jpg").length === 1);
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
