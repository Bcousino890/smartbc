/**
 * Test del enlazado de anuncios de particulares (lib/particulares/linking-core.ts).
 *
 * Cada caso sale de un patrón REAL medido en el CRM el 2026-10-12:
 *  - mismo piso en Idealista y Fotocasa (teléfono con formatos distintos),
 *  - venta + alquiler del mismo piso (mismo portal y en portales distintos),
 *  - el mismo piso con OTRO teléfono y otro nombre (la pareja),
 *  - edificio con pisos iguales de dueños distintos (NO debe agruparse),
 *  - planta desconocida que unía un 3.º con un 6.º (NO debe agruparse),
 *  - mismo teléfono pero otro piso (solo informativo).
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-particulares-linking.mts
 */
import {
  computeLinks,
  floorNumber,
  phoneKey,
  streetKey,
  type LinkRow,
} from "../lib/particulares/linking-core.ts";
import { normalizeContactPhone } from "../lib/sync/particulares/phone-international.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

let n = 0;
const row = (over: Partial<LinkRow>): LinkRow => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`,
  portal: "idealista",
  operation: "sale",
  is_active: true,
  price: 500000,
  bedrooms: 2,
  bathrooms: 1,
  square_meters: 80,
  floor: null,
  address: "Piso en venta en Calle de Jorge Juan, 92",
  latitude: null,
  longitude: null,
  phone: null,
  phone2: null,
  owner_name: null,
  assigned_to: null,
  n_photos: 10,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

console.log("── normalización ──");
check("teléfono: +34, 0034 y 9 dígitos dan la misma clave",
  phoneKey("+34 600 12 34 56") === phoneKey("0034600123456") && phoneKey("600123456") === phoneKey("+34600123456"));
check("teléfono extranjero: +33 y 0033 dan la misma clave y no se pierde",
  phoneKey("+33 7 12 34 56 78") === phoneKey("0033712345678") && phoneKey("+33 7 12 34 56 78") === "33712345678");
check("teléfono vacío o corto → null", phoneKey("") === null && phoneKey("12345") === null);
const k1 = streetKey("Piso en venta en Calle de Tribaldos, 8");
const k2 = streetKey("Calle de Tribaldos, 8, Canillas");
check("calle: título de Idealista y dirección de Fotocasa coinciden",
  k1.number === "8" && k2.number === "8" && [...k1.tokens].join() === [...k2.tokens].join(), [k1, k2]);
check("calle: «Studio for rent in Calle de Ayala, 81» = «Alquiler de estudio en Calle de Ayala, 81»",
  [...streetKey("Studio for rent in Calle de Ayala, 81").tokens].join() === [...streetKey("Alquiler de estudio en Calle de Ayala, 81").tokens].join());
check("planta: '1ª planta exterior' = 1, 'Bajo exterior' = 0, vacío = null",
  floorNumber("1ª planta exterior con ascensor") === 1 && floorNumber("Bajo exterior") === 0 && floorNumber("") === null);

console.log("── mismo piso, dos portales, mismo teléfono ──");
{
  const i = row({ portal: "idealista", phone: "+34600111222", owner_name: "Francisco", price: 330000, square_meters: 50, bedrooms: 1, floor: "Bajo exterior" });
  const f = row({ portal: "fotocasa", phone: "600 111 222", address: "Calle de Jorge Juan, 92, Goya", price: 335000, square_meters: 50, bedrooms: 1, n_photos: 6, latitude: 40.42, longitude: -3.68 });
  const r = computeLinks([i, f]);
  check("se enlazan con nivel cierto (R1)", r.links.length === 1 && r.links[0].level === "cierto" && r.links[0].rule.startsWith("R1"), r.links);
  check("1 grupo de 2; el principal es el de Idealista (más fotos y con nombre/teléfono)", r.groups.length === 1 && r.groups[0].primary === i.id, r.groups);
  check("el duplicado apunta al principal y el principal lleva el resumen", r.state.get(f.id)?.duplicate_of === i.id && r.state.get(i.id)?.link_summary?.n === 2);
  check("resumen: portales idealista+fotocasa", JSON.stringify(r.state.get(i.id)?.link_summary?.portals) === '["fotocasa","idealista"]');
}

console.log("── venta + alquiler del mismo piso ──");
{
  const sale = row({ operation: "sale", price: 795000, phone: "+34611222333", owner_name: "María", square_meters: 103, bedrooms: 2, floor: "1ª planta exterior", address: "Piso en venta en Calle de Fuencarral, 10" });
  const rent = row({ operation: "rent", price: 2500, phone: "611222333", owner_name: "María", square_meters: 103, bedrooms: 2, floor: "1ª planta exterior", address: "Alquiler de piso en Calle de Fuencarral, 10" });
  const fsale = row({ portal: "fotocasa", operation: "sale", price: 795000, phone: "+34611222333", square_meters: 103, bedrooms: 2, address: "Calle de Fuencarral, 10, Palacio" });
  const r = computeLinks([sale, rent, fsale]);
  check("los 3 anuncios quedan en UNA ficha (venta + alquiler + otro portal)", r.groups.length === 1 && r.groups[0].members.length === 3, r.groups);
  const sm = r.state.get(r.groups[0].primary)?.link_summary;
  check("resumen con las dos operaciones", JSON.stringify(sm?.ops) === '["rent","sale"]', sm);
  check("el filtro por operación puede usar link_ops (rent y sale)", JSON.stringify(r.state.get(r.groups[0].primary)?.link_ops) === '["rent","sale"]');
}

console.log("── otro teléfono y otro nombre (la pareja) ──");
{
  const i = row({ phone: "+34622000111", owner_name: "Carlos", price: 520000, square_meters: 53, bedrooms: 1, floor: "3ª planta exterior" });
  const f = row({ portal: "fotocasa", phone: "+34633999888", owner_name: null, price: 519000, square_meters: 53, bedrooms: 1, address: "Calle de Jorge Juan, 92, Goya" });
  const r = computeLinks([i, f]);
  check("NO se agrupan solos (teléfonos distintos)", r.groups.length === 0, r.groups);
  const l = r.links.find((x) => x.relation === "mismo_inmueble");
  check("queda como PROBABLE «otro contacto» para que el equipo lo confirme", l?.level === "probable" && l.evidence.other_contact === true, l);
  // confirmado a mano → se agrupa y conserva ambos teléfonos
  const r2 = computeLinks([i, f], [{ a: i.id < f.id ? i.id : f.id, b: i.id < f.id ? f.id : i.id, relation: "mismo_inmueble", status: "confirmado" }]);
  check("al confirmarlo se agrupa", r2.groups.length === 1);
  check("la ficha unificada cuenta 2 teléfonos distintos", r2.state.get(r2.groups[0].primary)?.link_summary?.phones === 2);
  // descartado → ya no aparece ni como sugerencia
  const r3 = computeLinks([i, f], [{ a: i.id < f.id ? i.id : f.id, b: i.id < f.id ? f.id : i.id, relation: "mismo_inmueble", status: "descartado" }]);
  check("al descartarlo desaparece", r3.links.filter((x) => x.relation === "mismo_inmueble").length === 0);
}

console.log("── sin teléfono en un lado ──");
{
  const i = row({ phone: null, owner_name: "Nuria", price: 509900, square_meters: 108, bedrooms: 3, floor: "1ª planta exterior", address: "Piso en venta en Calle del Mediodía Grande, 20" });
  const f = row({ portal: "fotocasa", phone: "+34644555666", price: 515000, square_meters: 108, bedrooms: 3, address: "Calle del Mediodía Grande, 20, Palacio" });
  const r = computeLinks([i, f]);
  const l = r.links.find((x) => x.relation === "mismo_inmueble");
  // misma operación, precio 1 %, solo ellos dos en el edificio, pero sin nombre/planta en común → probable
  check("calle + metros + precio ±5 % sin teléfono: se propone (probable o cierto), nunca se pierde", !!l, r.links);
}

console.log("── edificio con pisos iguales de dueños distintos ──");
{
  const mk = (name: string, price: number, fl: string | null, portal = "idealista") =>
    row({ portal, operation: "rent", price, owner_name: name, phone: null, square_meters: 65, bedrooms: 1, bathrooms: 1, floor: fl, address: "Alquiler de piso en Avenida de la Constitución, 85" });
  const rows = [mk("alicia", 1000, null), mk("margarita", 1150, null), mk("juan", 980, null), mk("felisa", 1100, "8ª planta exterior"), mk("carmen", 1100, "2ª planta exterior"),
    row({ portal: "fotocasa", operation: "rent", price: 1040, phone: "+34655000111", square_meters: 65, bedrooms: 1, bathrooms: 1, address: "Avenida de la Constitución, 85, El Barral Ferial" })];
  const r = computeLinks(rows);
  check("ningún grupo (5 pisos iguales de distintos dueños)", r.groups.length === 0, r.groups.map((g) => g.members.length));
  check("ningún enlace estructural queda como «cierto»", r.links.filter((l) => l.relation === "mismo_inmueble" && l.level === "cierto").length === 0, r.links.map((l) => [l.level, l.rule]));
}

console.log("── la planta desconocida no actúa de puente ──");
{
  const sale3 = row({ operation: "sale", price: 520000, phone: "+34600700800", floor: "3ª planta exterior", square_meters: 53, bedrooms: 1, owner_name: "Angela" });
  const rentUnknown = row({ operation: "rent", price: 1600, phone: "+34600700800", floor: null, square_meters: 54, bedrooms: 1, owner_name: "Angela" });
  const rent6 = row({ operation: "rent", price: 1600, phone: "+34600700800", floor: "6ª planta interior", square_meters: 55, bedrooms: 1, owner_name: "Angela" });
  const r = computeLinks([sale3, rentUnknown, rent6]);
  const together = r.groups.find((g) => g.members.includes(sale3.id) && g.members.includes(rent6.id));
  check("el 3.º y el 6.º NO acaban en el mismo grupo aunque compartan teléfono y un intermedio sin planta", !together, r.groups);
}

console.log("── 1.ª interior ≠ 1.ª exterior (dos pisos distintos del mismo edificio) ──");
{
  const mk = (name: string, fl: string, op: "sale" | "rent", price: number) =>
    row({ operation: op, price, owner_name: name, phone: null, floor: fl, square_meters: 70, bedrooms: 1, bathrooms: 1, address: op === "sale" ? "Piso en venta en Calle San Bartolomé, 12" : "Alquiler de piso en Calle San Bartolomé, 12" });
  const r = computeLinks([mk("carmen", "1ª planta interior", "rent", 2100), mk("cs", "1ª planta exterior", "sale", 549000)]);
  check("NO se enlazan (uno interior y otro exterior)", r.links.length === 0 && r.groups.length === 0, r.links);
  const r2 = computeLinks([mk("carmen", "1ª planta exterior", "rent", 2100), mk("carmen", "1ª planta exterior", "sale", 549000)]);
  check("mismo nombre, misma planta y exposición → sí (venta + alquiler)", r2.groups.length === 1, r2.links);
}

console.log("── mismo teléfono, otro inmueble ──");
{
  const a = row({ phone: "+34666111000", square_meters: 90, bedrooms: 3, address: "Calle Mayor, 4" });
  const b = row({ phone: "+34666111000", square_meters: 45, bedrooms: 1, address: "Calle del Pez, 12", operation: "rent", price: 1100 });
  const r = computeLinks([a, b]);
  check("solo enlace informativo «mismo contacto», sin grupo", r.groups.length === 0 && r.links.length === 1 && r.links[0].relation === "mismo_contacto" && r.links[0].level === "informativo", r.links);
}

console.log("── teléfono extranjero ──");
{
  const i = row({ phone: "+33 7 12 34 56 78", square_meters: 70, bedrooms: 2, owner_name: "Jean" });
  const f = row({ portal: "fotocasa", phone: "0033712345678", square_meters: 70, bedrooms: 2, address: "Calle de Jorge Juan, 92" });
  const r = computeLinks([i, f]);
  check("se reconocen por teléfono internacional", r.groups.length === 1, r.links);
}

console.log("── elección del principal ──");
{
  const retired = row({ is_active: false, phone: "+34677000111", portal: "idealista", n_photos: 40, price: 300000, square_meters: 60, bedrooms: 2 });
  const active = row({ is_active: true, phone: "+34677000111", portal: "fotocasa", n_photos: 5, price: 300000, square_meters: 60, bedrooms: 2, address: "Calle de Jorge Juan, 92" });
  const r = computeLinks([retired, active]);
  check("manda el anuncio ACTIVO aunque el retirado tenga más fotos", r.groups[0]?.primary === active.id, r.groups);
  const assigned = row({ is_active: true, assigned_to: "asesor-1", phone: "+34677000111", portal: "idealista", n_photos: 3, price: 300000, square_meters: 60, bedrooms: 2 });
  const r2 = computeLinks([assigned, active]);
  check("manda el que ya tiene asesor asignado (no se esconde trabajo ya hecho)", r2.groups[0]?.primary === assigned.id, r2.groups);
}

console.log("── distancias y contradicciones ──");
{
  const a = row({ phone: "+34688000999", latitude: 40.4, longitude: -3.7, square_meters: 70, bedrooms: 2 });
  const b = row({ portal: "fotocasa", phone: "+34688000999", latitude: 40.5, longitude: -3.6, square_meters: 70, bedrooms: 2, address: "Otra calle, 3" });
  const r = computeLinks([a, b]);
  check("mismo teléfono pero a 14 km: otro inmueble (informativo)", r.groups.length === 0 && r.links[0]?.relation === "mismo_contacto", r.links);
  const c = row({ phone: "+34688000555", square_meters: 70, bedrooms: 2 });
  const d = row({ portal: "fotocasa", phone: "+34688000555", square_meters: 130, bedrooms: 4, address: "Calle X, 1" });
  const r2 = computeLinks([c, d]);
  check("mismo teléfono pero 70 vs 130 m²: no es el mismo piso", r2.groups.length === 0);
}

console.log("── teléfonos de cualquier país (corrige la pérdida del 3,2 % de Fotocasa) ──");
check("España: igual que antes", normalizeContactPhone("+34 600 12 34 56") === "+34600123456" && normalizeContactPhone("600123456") === "+34600123456" && normalizeContactPhone("0034600123456") === "+34600123456");
check("Francia: +33 y 0033 se conservan en E.164", normalizeContactPhone("+33 7 12 34 56 78") === "+33712345678" && normalizeContactPhone("0033712345678") === "+33712345678");
check("Reino Unido: +44 se conserva", normalizeContactPhone("+44 7911 123456") === "+447911123456");
check("basura o corto → null", normalizeContactPhone("12345") === null && normalizeContactPhone("") === null && normalizeContactPhone(null) === null);
check("un +34 inválido NO se acepta como internacional", normalizeContactPhone("+34 123456789") === null);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
