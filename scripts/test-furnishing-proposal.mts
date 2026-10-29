/**
 * Tests de la propuesta de mobiliario (migración 0235): textos por defecto,
 * filas → visor (sin rutas de storage), estancias, «misma toma» por
 * proporción, sugerencias y emparejado de la carga múltiple con los nombres
 * reales de la entrega de BC-1781, datos de la ficha y acceso del enlace
 * compartido. Además vigila, leyendo el código, las barreras que no se ven
 * en una prueba pura: solo propuestas publicadas en público, permiso en cada
 * acción, RLS de la migración y estilos acotados al componente.
 * Puros: sin base de datos, red ni IA.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-furnishing-proposal.mts
 */
import { readFileSync } from "node:fs";
import {
  DEFAULT_FURNISHING_TEXTS,
  furnishingContactHref,
  furnishingTeaser,
  isPublishable,
  fileNumber,
  pairByFileNumber,
  resolveTexts,
  roomsInOrder,
  sameAspect,
  suggestFromFileName,
  toViewerImages,
  validatePair,
  type FurnishingImageRow,
} from "../lib/furnishing/proposal.ts";
import { buildFurnishingFacts } from "../lib/furnishing/facts.ts";
import type { Property } from "../lib/types.ts";

let failures = 0;
let passes = 0;
function check(name: string, cond: unknown, detail?: string) {
  if (cond) passes++;
  else {
    failures++;
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`· ${t}`);
}

// Nombres y medidas reales de la entrega (BC-1781 → ficha BC-2138, D1).
const AFTERS = [
  ["01_salon.png", 1534, 1025],
  ["02_salon.png", 1535, 1025],
  ["03_cocina.png", 1086, 1448],
  ["04_dormitorio.png", 1535, 1025],
  ["05_dormitorio.png", 1086, 1448],
  ["06_dormitorio.png", 1535, 1025],
  ["07_dormitorio.png", 1086, 1448],
  ["08_vestidor.png", 1086, 1448],
  ["09_dormitorio.png", 1535, 1025],
  ["10_dormitorio.png", 1086, 1448],
  ["11_bano.png", 1086, 1448],
  ["12_dormitorio.png", 1086, 1448],
  ["13_dormitorio.png", 1534, 1025],
  ["14_exterior.png", 1535, 1025],
  ["15_exterior.png", 1535, 1025],
] as const;
const BEFORE_SIZE = (w: number, h: number) => (w > h ? { width: 2048, height: 1366 } : { width: 1536, height: 2048 });
// Lo que la referencia aprobada marca por imagen (data/properties.json).
const REFERENCE_ROOMS = [
  "Salón y comedor", "Salón y comedor", "Cocina", "Dormitorios", "Dormitorios", "Dormitorios", "Dormitorios",
  "Otros espacios", "Dormitorios", "Dormitorios", "Otros espacios", "Dormitorios", "Dormitorios",
  "Otros espacios", "Otros espacios",
];
const REFERENCE_COMPARE = [true, true, true, true, true, true, true, false, true, true, false, true, true, false, false];

function row(i: number, patch: Partial<FurnishingImageRow> = {}): FurnishingImageRow {
  const [name, w, h] = AFTERS[i];
  const b = BEFORE_SIZE(w, h);
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    position: i,
    label: suggestFromFileName(name).label,
    room: REFERENCE_ROOMS[i],
    compare: REFERENCE_COMPARE[i],
    after_path: `prop-uuid/propuesta/1-despues-${name}`,
    after_url: `https://portal.bcousinoprop.com/storage/v1/object/public/properties-photos/prop-uuid/propuesta/1-despues-${name}`,
    after_width: w,
    after_height: h,
    before_path: `prop-uuid/propuesta/1-antes-${String(i + 1).padStart(2, "0")}.jpg`,
    before_url: `https://portal.bcousinoprop.com/storage/v1/object/public/properties-photos/prop-uuid/propuesta/1-antes-${String(i + 1).padStart(2, "0")}.jpg`,
    before_width: b.width,
    before_height: b.height,
    ...patch,
  };
}
const ROWS = AFTERS.map((_, i) => row(i));

// ── 1 · Textos ──────────────────────────────────────────────────────────────
section("textos del visor");
check("sin propuesta → textos por defecto", JSON.stringify(resolveTexts(null)) === JSON.stringify(DEFAULT_FURNISHING_TEXTS));
check(
  "texto vacío o en blanco → por defecto; propio → se respeta (recortado)",
  (() => {
    const t = resolveTexts({ status: "draft", headline: "  Tu casa  ", subtitle: "   ", disclaimer: null });
    return t.headline === "Tu casa" && t.subtitle === DEFAULT_FURNISHING_TEXTS.subtitle && t.disclaimer === DEFAULT_FURNISHING_TEXTS.disclaimer;
  })(),
);
check("el aviso por defecto dice que el mobiliario es virtual", /propuesta virtual/i.test(DEFAULT_FURNISHING_TEXTS.disclaimer));

// ── 2 · Filas → visor ───────────────────────────────────────────────────────
section("filas → imágenes del visor");
const shuffled = [ROWS[2], ROWS[0], ROWS[1]].map((r, i) => ({ ...r, position: [5, 1, 3][i] }));
const ordered = toViewerImages(shuffled);
check("ordena por position", ordered.map((i) => i.label).join("|") === [ROWS[0], ROWS[1], ROWS[2]].map((r) => r.label).join("|"));
check("numeración 01, 02… por orden, no por nombre de archivo", ordered.map((i) => i.number).join(",") === "01,02,03");
const viewer = toViewerImages(ROWS);
const json = JSON.stringify(viewer);
check("el DTO público no lleva rutas de storage", !json.includes("_path") && !json.includes('"prop-uuid/'));
check("el DTO público no lleva ids de fila", !json.includes("00000000-0000-0000-0000"));
check("conserva la pareja de la fila (después y antes de la misma fila)", viewer.every((v, i) => v.after.url === ROWS[i].after_url && v.before?.url === ROWS[i].before_url));
check("compare de la referencia: baño, vestidor y exteriores sin comparar", viewer.map((v) => v.compare).join() === REFERENCE_COMPARE.join());
check(
  "compare=true sin antes → el visor no compara",
  toViewerImages([row(0, { before_path: null, before_url: null, before_width: null, before_height: null })])[0].compare === false,
);

// ── 3 · Estancias ───────────────────────────────────────────────────────────
section("filtros por estancia");
check(
  "estancias en orden de aparición = las de la referencia",
  roomsInOrder(viewer).join("|") === "Salón y comedor|Cocina|Dormitorios|Otros espacios",
  roomsInOrder(viewer).join("|"),
);
check("sin imágenes → sin estancias", roomsInOrder([]).length === 0);

// ── 4 · Misma toma (proporción) y validación ────────────────────────────────
section("misma toma y validación de la pareja");
check("las 15 parejas de la entrega tienen la misma proporción", AFTERS.every(([, w, h]) => sameAspect(BEFORE_SIZE(w, h), { width: w, height: h })));
check("horizontal contra vertical no es la misma toma", !sameAspect({ width: 2048, height: 1366 }, { width: 1086, height: 1448 }));
check("un recorte del 5 % no pasa", !sameAspect({ width: 1500, height: 1000 }, { width: 1500, height: 1050 }));
const ok = validatePair({ label: "Salón", room: "Salón y comedor", compare: true, after: { width: 1534, height: 1025 }, before: { width: 2048, height: 1366 } });
check("pareja buena → ok", ok.ok);
check("sin después → error", !validatePair({ label: "x", room: "y", compare: false, after: null, before: null }).ok);
check("comparar sin antes → error", !validatePair({ label: "x", room: "y", compare: true, after: { width: 10, height: 10 }, before: null }).ok);
check("sin comparar y sin antes → ok (vista del inmueble)", validatePair({ label: "x", room: "y", compare: false, after: { width: 10, height: 10 }, before: null }).ok);
check("antes de otra proporción → error aunque no se compare", !validatePair({ label: "x", room: "y", compare: false, after: { width: 1534, height: 1025 }, before: { width: 1536, height: 2048 } }).ok);
check("nombre o estancia vacíos → error", !validatePair({ label: " ", room: "y", compare: false, after: { width: 1, height: 1 }, before: null }).ok && !validatePair({ label: "x", room: "", compare: false, after: { width: 1, height: 1 }, before: null }).ok);

// ── 5 · Sugerencias y emparejado de la carga múltiple ───────────────────────
section("sugerencias a partir del nombre");
const sug = AFTERS.map(([n]) => suggestFromFileName(n));
check("estancia sugerida = la de la referencia en las 15", sug.every((s, i) => s.room === REFERENCE_ROOMS[i]), sug.map((s) => s.room).join(","));
check("comparar sugerido = el de la referencia en las 15", sug.every((s, i) => s.compare === REFERENCE_COMPARE[i]));
check("dormitorios numerados («Dormitorio · vista 04»)", sug[3].label === "Dormitorio · vista 04" && sug[11].label === "Dormitorio · vista 12");
check("nombre sin pista → «Vista NN», Otros espacios", suggestFromFileName("16_IMG.png").label === "Vista 16" && suggestFromFileName("16_IMG.png").room === "Otros espacios");
check("número inicial", fileNumber("07_dormitorio.png") === 7 && fileNumber("15.jpg") === 15 && fileNumber("salon.png") === null && fileNumber("2026101_x.png") === null);
check("sin número inicial → el último del nombre", fileNumber("antes-11.jpg") === 11 && fileNumber("despues-01_salon.png") === 1 && fileNumber("BC-1781_03.jpg") === 3);

section("emparejado por número");
const f = (name: string) => ({ name });
const afterFiles = AFTERS.map(([n]) => f(n));
const beforeFiles = AFTERS.map((_, i) => f(`${String(i + 1).padStart(2, "0")}.jpg`)).reverse();
const plan = pairByFileNumber(afterFiles, beforeFiles);
check("15 parejas", plan.pairs.length === 15);
check("cada después con el antes de su mismo número (aunque lleguen desordenados)", plan.pairs.every((p) => p.before && fileNumber(p.before.name) === fileNumber(p.after.name)));
check("en orden numérico", plan.pairs.map((p) => p.number).join(",") === AFTERS.map((_, i) => i + 1).join(","));
check("nada sobrante", plan.unmatchedBefores.length === 0 && plan.unnumbered.length === 0 && plan.duplicates.length === 0);
const prefixed = pairByFileNumber([f("despues-01_salon.png"), f("despues-08_vestidor.png")], [f("antes-08.jpg"), f("antes-01.jpg"), f("portada.jpg")]);
check("nombres con prefijo también se emparejan", prefixed.pairs.length === 2 && prefixed.pairs.every((p) => p.before && fileNumber(p.before.name) === p.number) && prefixed.unnumbered.map((x) => x.name).join() === "portada.jpg");
const partial = pairByFileNumber([f("01_salon.png"), f("02_salon.png"), f("salon.png"), f("01_otra.png")], [f("01.jpg"), f("09.jpg"), f("01b.jpg")]);
check("después sin antes → pareja con before null", partial.pairs.find((p) => p.number === 2)?.before === null);
check("antes sin después → se avisa", partial.unmatchedBefores.map((x) => x.name).join() === "09.jpg");
check("sin número → se avisa, no se empareja por posición", partial.unnumbered.some((x) => x.name === "salon.png"));
check("número repetido → se avisa", partial.duplicates.map((x) => x.name).sort().join() === "01_otra.png,01b.jpg");

// ── 6 · Publicación, acceso y datos de la ficha ─────────────────────────────
section("publicación y acceso desde la ficha compartida");
check("borrador → no publicable", !isPublishable({ status: "draft", headline: null, subtitle: null, disclaimer: null }, ROWS));
check("publicada sin imágenes → no publicable", !isPublishable({ status: "published", headline: null, subtitle: null, disclaimer: null }, []));
check("publicada con imágenes → publicable", isPublishable({ status: "published", headline: null, subtitle: null, disclaimer: null }, ROWS));
check("sin propuesta → sin acceso", furnishingTeaser(null, "/x") === null && furnishingTeaser({ images: [] }, "/x") === null);
const noCompareFirst = toViewerImages([row(7), row(0)].map((r, i) => ({ ...r, position: i })));
const teaser = furnishingTeaser({ images: noCompareFirst }, "/compartir/bc2138-x/propuesta");
check("portada del acceso = la primera imagen amueblada que compara", teaser?.coverUrl === ROWS[0].after_url && teaser?.count === 2);

section("datos de la vivienda (del registro)");
const base = {
  id: "slug", title: "Piso", zone: "El Viso", city: "Madrid", bedrooms: 4, bathrooms: 3, squareMeters: 180,
  price: 1250000, operation: "venta", bcReference: "BC-2138", propertyTypeLabel: "Piso",
} as unknown as Property;
const facts = buildFurnishingFacts(base);
check("venta: operación, precio, zona, m², dormitorios, baños", facts.join(" | ") === "Venta · Piso | 1.250.000 € | El Viso, Madrid | 180 m² | 4 dormitorios | 3 baños", facts.join(" | "));
// Mismo formatPrice que la ficha compartida (es-ES no agrupa 4 cifras: «2400»).
check("alquiler: /mes", /^2\.?400 €\/mes$/.test(buildFurnishingFacts({ ...base, operation: "alquiler", price: 2400 } as Property)[1]));
check("precio 0 → a consultar", buildFurnishingFacts({ ...base, price: 0 } as Property)[1] === "Precio a consultar");
check("sin dirección exacta (solo zona y ciudad)", !facts.some((x) => /calle|c\//i.test(x)));
check("contacto con la referencia en el asunto", furnishingContactHref("BC-2138") === "mailto:contacto@bcousinoprop.com?subject=Consulta%20sobre%20BC-2138");

// ── 7 · Barreras que viven en el código ─────────────────────────────────────
section("barreras en el código");
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const queries = read("lib/db/queries/furnishing.ts");
const publicFn = queries.slice(queries.indexOf("export async function getFurnishingPublic"));
check("lectura pública: solo propuestas publicadas", publicFn.includes('.eq("status", "published")'));
check("lectura pública: solo la propiedad que resolvió el enlace", (publicFn.match(/\.eq\("property_id", propertyId\)/g) ?? []).length === 2);
const actions = read("app/(admin)/admin/propiedades/furnishing-actions.ts");
const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
check("acciones esperadas", ["uploadFurnishingPair", "updateFurnishingImage", "reorderFurnishingImages", "deleteFurnishingImage", "saveFurnishingProposal"].every((n) => exported.includes(n)), exported.join(","));
check("cada acción pasa por gate() (properties/edit + staff)", exported.every((n) => {
  const body = actions.slice(actions.indexOf(`export async function ${n}`)).split(/\nexport async function /)[0];
  return /await gate\(/.test(body);
}) && /checkPermission\("properties", "edit"/.test(actions) && /requireStaff\(/.test(actions));
check("las escrituras sobre una imagen filtran por la propiedad", (actions.match(/\.eq\("property_id", propertyId\)/g) ?? []).length >= 6);
const route = read("app/api/admin/properties/upload/[kind]/route.ts");
check("la subida entra por la ruta excluida del middleware", /furnishing: uploadFurnishingPair/.test(route));

const mig = read("supabase/migrations/0235_property_furnishing_proposals.sql");
check("migración en transacción propia", /^BEGIN;/m.test(mig) && /^COMMIT;/m.test(mig));
check("migración idempotente", (mig.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length === 2 && /CREATE INDEX IF NOT EXISTS/.test(mig) && (mig.match(/DROP POLICY IF EXISTS/g) ?? []).length === (mig.match(/CREATE POLICY/g) ?? []).length);
check("RLS en las dos tablas", (mig.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 2);
check("ninguna política para anon", !/TO anon/i.test(mig) && (mig.match(/is_staff\(\)/g) ?? []).length === 6);
check("comparar exige antes (CHECK)", /NOT compare OR before_path IS NOT NULL/.test(mig));

const css = read("components/furnishing/furnishing-viewer.module.css")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/@media[^{]*\{/g, "");
const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim())).filter(Boolean);
const leaking = selectors.filter((sel) => !sel.startsWith("."));
check("estilos acotados: todo selector empieza por una clase del módulo", leaking.length === 0, leaking.join(" ; "));

console.log(`\n${passes} ok, ${failures} fallos`);
if (failures > 0) process.exit(1);
