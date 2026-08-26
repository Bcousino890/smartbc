// SmartLink 2.0 · QA de la capa de barrio contra PRODUCCIÓN.
//
// Pide los SmartLinks públicos de verdad y comprueba, sobre el HTML servido:
//   1. aparece "Vivir en <barrio curado>" con el nombre canónico esperado
//      (incluidas las zonas que sólo resuelven por alias);
//   2. la intro está y no contiene minutos (los minutos se calculan, no se
//      escriben);
//   3. si la propiedad tiene coordenadas → hay POIs con "≈ N min";
//      si NO las tiene → NO hay ni un minuto en pantalla;
//   4. los minutos que salen son plausibles (1..40) y el modo coherente;
//   5. las zonas NO resolubles siguen sin bloque de barrio (Chile, etc.).
//
// Uso: node scripts/qa-neighborhood-layer.mjs [baseUrl]

const BASE = process.argv[2] ?? "https://bcousinoprop.com";

// slug | referencia | barrio esperado (null = no debe resolver) | tiene coords
const CASES = [
  ["alquiler-de-piso-en-calle-de-serrano-uy6y", "BC-1408", "Castellana", true],
  ["calle-velazquez-120-bajo-b-28006-madrid-madrid-x5u4", "BC-0984", "Castellana", false],
  ["calle-diego-de-leon-56-jlh6", "BC-0910", "Lista", true],
  ["exclusivo-piso-en-lista-barrio-de-salamanca-9kxg", "BC-1289", "Lista", false],
  ["exclusivo-piso-en-calle-del-principe-de-vergara-lista-9nhz", "BC-1210", "Lista", true],
  ["alquiler-de-piso-en-calle-de-jorge-juan-ztko", "BC-1386", "Goya", true],
  ["exclusivo-piso-en-goya-57a9", "BC-1401", "Goya", true],
  ["alquiler-de-piso-en-paseo-de-la-habana-v0z5", "BC-1240", "El Viso", true],
  // BC-1209 se archivó el 2026-08-21 (deja de ser pública, 404 correcto).
  ["alquiler-de-piso-en-calle-de-rodriguez-marin-el-viso-0gbf", "BC-1391", "El Viso", true],
  ["alquiler-de-piso-en-calle-de-cochabamba-bernabeu-e14i", "BC-1368", "Hispanoamérica", true],
  ["alquiler-de-piso-en-calle-de-domingo-fernandez-nueva-espana-yuvh", "BC-1267", "Nueva España", true],
  ["alquiler-de-piso-en-fuencarral-2mxh", "BC-1100", "Malasaña", true],
  ["alquiler-de-piso-en-calle-de-hortaleza-uqbp", "BC-1182", "Chueca", true],
  ["alquiler-de-piso-en-calle-de-la-colegiata-oz3n", "BC-1378", "Lavapiés", true],
  ["alquiler-de-duplex-en-calle-de-palafox-trafalgar-fkp2", "BC-1395", "Trafalgar", true],
  ["alquiler-de-piso-en-calle-de-jose-abascal-21-bw85", "BC-1124", "Ríos Rosas", false],
  ["alquiler-de-piso-en-calle-de-menorca-53x7", "BC-1290", "Ibiza", true],
  ["alquiler-de-piso-en-conde-de-cartagena-jb8a", "BC-1390", "Niño Jesús", true],
  ["alquiler-de-piso-en-calle-del-doctor-esquerdo-madrid-65-apm4", "BC-1328", "Estrella", true],
  ["exclusivo-piso-en-goya-barrio-de-salamanca-u3kt", "BC-1327", "Fuente del Berro", true],
  ["salamanca-fuente-del-berro-apartamento-exterior-kmct", "BC-1385", "Fuente del Berro", false],
  ["alquiler-de-duplex-en-calle-de-bejar-12-b7pk", "BC-1356", "Guindalera", true],
  ["alquiler-de-piso-en-goya-hp51", "BC-1410", "Barrio de Salamanca", true],
  ["piso-en-venta-en-calle-tramontana-pozuelo-de-alarcon-c7vh", "BC-1277", "Prado de Somosaguas", true],
  ["atico-en-venta-en-avenida-de-los-angeles-qytl", "BC-1301", "Somosaguas", true],
  // "Centro Comercial - Hospital" resultó ser el núcleo de Los Bomberos, en
  // Torrelodones: resuelve por alias a la capa municipal.
  ["piso-en-venta-en-avenida-de-la-fontanilla-15-6qgl", "BC-1017", "Torrelodones", false],
  // Negativos deliberados: zonas que NO deben resolver contra ningún barrio.
  // "Colina" es la comuna chilena (Chicureo), no el barrio de Ciudad Lineal:
  // si algún día resuelve, el cliente vería POIs de Madrid en una casa de Chile.
  ["increible-casa-en-condominio-0e0x", "BC-1238", null, false],
  ["casa-en-chicureo-ixo2", "BC-1232", null, true],
];

// React parte cada interpolación con un comentario vacío ("Vivir en
// <!-- -->Castellana"). Se eliminan antes de casar nada, o el HTML servido
// parece no contener los textos que sí contiene.
const decode = (s) =>
  s.replace(/<!--\s*-->/g, "")
   .replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
   .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&nbsp;/g, " ").replace(/&#x2F;/g, "/");

let ok = 0;
const failures = [];

for (const [slug, ref, expected, hasCoords] of CASES) {
  const url = `${BASE}/compartir/${slug}`;
  const problems = [];
  let html = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "smartbc-qa/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = decode(await res.text());
  } catch (e) {
    failures.push({ ref, expected, problems: [`no carga: ${e.message}`] });
    console.log(`✗ ${ref.padEnd(8)} ${String(expected).padEnd(20)} no carga: ${e.message}`);
    continue;
  }

  const heading = html.match(/Vivir en ([^<]{2,60})</);
  const got = heading ? heading[1].trim() : null;
  // La intro curada: el <p> que sigue al título. Sin barrio resuelto no
  // existe, aunque el título pueda caer al nombre crudo de la zona.
  const intro = html.match(/Vivir en [^<]{2,60}<\/h2>\s*<div[^>]*>\s*<p>([^<]{40,900})<\/p>/);
  const minutes = [...html.matchAll(/≈\s*(\d+)\s*min\s*(a pie|en coche)/g)]
    .map((m) => [Number(m[1]), m[2]]);

  if (expected === null) {
    // Lo que importa en un negativo no es el título —que cae al valor crudo
    // del catálogo— ni el párrafo, que puede ser el capítulo de barrio que
    // el Engine saca de la propia descripción y es contenido legítimo. Lo
    // que NO puede pasar es que se muestren tiempos a POIs de otra ciudad.
    if (minutes.length > 0) problems.push(`no debía resolver barrio y muestra ${minutes.length} tiempo(s)`);
  } else {
    if (got !== expected) problems.push(`barrio "${got ?? "(ninguno)"}" ≠ esperado "${expected}"`);
    if (!intro) problems.push("no se encuentra la intro del barrio");
    else if (/\b\d+\s*min/i.test(intro[1])) problems.push("la intro contiene minutos escritos");

    if (hasCoords) {
      if (minutes.length === 0) problems.push("tiene coordenadas pero no muestra ningún POI");
      for (const [n, mode] of minutes) {
        if (n < 1 || n > 40) problems.push(`minuto implausible: ${n} min ${mode}`);
        if (mode === "a pie" && n > 22) problems.push(`${n} min "a pie" supera el techo de 22`);
      }
    } else if (minutes.length > 0) {
      // Regla dura del sprint: sin coordenadas fiables, ningún número.
      problems.push(`SIN coordenadas y muestra ${minutes.length} tiempo(s)`);
    }
  }

  if (problems.length === 0) {
    ok++;
    const detail = minutes.length ? `${minutes.length} POIs` : "sin POIs (sin coords)";
    console.log(`✓ ${ref.padEnd(8)} ${String(expected).padEnd(20)} ${detail}`);
  } else {
    failures.push({ ref, expected, problems });
    console.log(`✗ ${ref.padEnd(8)} ${String(expected).padEnd(20)} ${problems.join(" · ")}`);
  }
}

console.log(`\n[qa] ${ok}/${CASES.length} SmartLinks correctos`);
if (failures.length) {
  console.log(`[qa] fallos:`);
  for (const f of failures) console.log(`   ${f.ref} (${f.expected}): ${f.problems.join(" · ")}`);
  process.exit(1);
}
