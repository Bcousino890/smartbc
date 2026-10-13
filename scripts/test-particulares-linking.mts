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

console.log("── normalización ampliada (abreviaturas, nº, planta tras el número, plantas en inglés, phone2) ──");
{
  const eq = (a: string, b: string) => {
    const x = streetKey(a), y = streetKey(b);
    return x.number === y.number && x.number != null && [...x.tokens].join() === [...y.tokens].join();
  };
  check("«C/ Orense, 49» = «Piso en venta en Calle de Orense, 49»", eq("C/ Orense, 49", "Piso en venta en Calle de Orense, 49"));
  check("«Avda. de América 12 2ºB» = «Avenida de América, 12»", eq("Avda. de América 12 2ºB", "Avenida de América, 12"));
  check("«Calle de Orense, nº 49, 3º izq» = «Calle de Orense 49»", eq("Calle de Orense, nº 49, 3º izq", "Calle de Orense 49"));
  check("«Calle de Albasanz, 14 - Bis» tiene número 14", streetKey("Dúplex en venta en Calle de Albasanz, 14 - Bis").number === "14");
  check("«Gral. Pardiñas, 96» = «Calle del General Pardiñas, 96»", eq("Gral. Pardiñas, 96", "Calle del General Pardiñas, 96"));
  check("«Calle Mayor, s/n» no inventa número", streetKey("Calle Mayor, s/n").number === null);
  check("planta en inglés: '3rd floor exterior' = 3, 'Ground floor exterior' = 0", floorNumber("3rd floor exterior") === 3 && floorNumber("Ground floor exterior") === 0 && floorNumber("1st floor interior") === 1);
  check("teléfono con 0 delante y con paréntesis", phoneKey("0600123456") === phoneKey("(+34) 600-123-456"));
  const p2a = row({ phone: "+34600000001", phone2: "+34611222333", square_meters: 90, bedrooms: 3, price: 400000 });
  const p2b = row({ portal: "fotocasa", phone: "611 222 333", square_meters: 90, bedrooms: 3, price: 400000, address: "Calle de Jorge Juan, 92" });
  check("el phone2 de uno casa con el teléfono del otro", computeLinks([p2a, p2b]).groups.length === 1);
}

console.log("── CASO REAL: Idealista 112792896 (PART-2026-290000) ↔ Fotocasa 191083740 ──");
{
  // Idealista: Calle de Orense 49, +34610561512, 970.000 €, 127 m², 4 hab, 2 baños.
  // El de Fotocasa aún no está en el CRM: datos sintéticos equivalentes (mismo teléfono y precio,
  // calle con otro formato, sin planta, y un baño más porque Fotocasa cuenta el aseo).
  const idea = row({ id: "11111111-1111-1111-1111-112792896000", portal: "idealista", operation: "sale", price: 970000, square_meters: 127, bedrooms: 4, bathrooms: 2,
    floor: "3ª planta exterior", address: "Piso en venta en Calle de Orense, 49", phone: "+34610561512", owner_name: "Particular", n_photos: 24, latitude: 40.4571, longitude: -3.6944 });
  const fc = (over: Partial<LinkRow> = {}) => row({ id: "22222222-2222-2222-2222-191083740000", portal: "fotocasa", operation: "sale", price: 970000, square_meters: 127, bedrooms: 4, bathrooms: 2,
    floor: null, address: "C/ Orense, 49, Castillejos", phone: "610 56 15 12", owner_name: null, n_photos: 12, latitude: 40.4572, longitude: -3.6943, ...over });
  const r = computeLinks([idea, fc()]);
  check("se agrupan: cierto R1, 1 grupo de 2 con Idealista como principal", r.groups.length === 1 && r.links[0]?.level === "cierto" && r.groups[0].primary === idea.id, r.links);
  const r2 = computeLinks([idea, fc({ bathrooms: 3 })]);
  check("con 3 baños en Fotocasa (2 vs 3) SIGUE siendo cierto: cada portal cuenta los aseos a su manera", r2.groups.length === 1 && r2.links[0]?.level === "cierto" && /baños/.test(r2.links[0].rule), r2.links);
  const r3 = computeLinks([idea, fc({ bathrooms: 4 })]);
  check("con 2 vs 4 baños NO se agrupa (contradicción real)", r3.groups.length === 0, r3.links);
  const r4 = computeLinks([idea, fc({ price: 1000000, address: "Calle de Orense, 49" })]);
  check("precio +3 % y calle abreviada de otra forma: cierto", r4.groups.length === 1, r4.links);
  const r5 = computeLinks([idea, fc({ price: 1250000 })]);
  check("precio +29 %: solo probable (no se agrupa solo)", r5.groups.length === 0 && r5.links[0]?.level === "probable", r5.links);
  const r6 = computeLinks([idea, fc({ operation: "rent", price: 3800 })]);
  check("el mismo piso en ALQUILER en Fotocasa también cuelga de la misma ficha (venta + alquiler)", r6.groups.length === 1 && JSON.stringify(r6.state.get(idea.id)?.link_ops) === '["rent","sale"]', r6.links);
  const [a, b] = idea.id < fc().id ? [idea.id, fc().id] : [fc().id, idea.id];
  const r7 = computeLinks([idea, fc()], [{ a, b, relation: "mismo_inmueble", status: "descartado" }]);
  check("una persona lo descarta: manda siempre, no se vuelve a agrupar", r7.groups.length === 0 && r7.links.every((l) => l.relation !== "mismo_inmueble"), r7.links);
  const r8 = computeLinks([idea, fc({ square_meters: 150, bedrooms: 5, price: 1500000 })], [{ a, b, relation: "mismo_inmueble", status: "confirmado" }]);
  check("una persona lo confirma: se agrupa aunque los datos ya no cuadren", r8.groups.length === 1 && r8.links.some((l) => l.level === "cierto"), r8.links);
}

console.log("── mismo teléfono, otra calle: NO se fusiona (falso positivo medido) ──");
{
  const a = row({ phone: "+34646286438", price: 1400, operation: "rent", square_meters: 40, bedrooms: 1, address: "Calle de San Bartolomé, 18, Chueca-Justicia, Madrid", latitude: 40.4220, longitude: -3.6970 });
  const b = row({ phone: "+34646286438", price: 1400, operation: "rent", square_meters: 41, bedrooms: 1, address: "Calle de Hortaleza, 41, Chueca-Justicia, Madrid", latitude: 40.4233, longitude: -3.6975, portal: "fotocasa" });
  const r = computeLinks([a, b]);
  check("mismo dueño, mismos metros y precio pero otra calle a 150 m → probable, sin grupo", r.groups.length === 0 && r.links[0]?.level === "probable", r.links);
  const c = row({ phone: "+34633610110", operation: "sale", price: 418000, square_meters: 96, bedrooms: 3, bathrooms: 1, address: "Calle de los Yébenes, 116, Aluche, Madrid" });
  const d = row({ portal: "fotocasa", phone: "+34633610110", operation: "sale", price: 418000, square_meters: 96, bedrooms: 3, bathrooms: 1, address: "Calle de los Yébenes, 8, Aluche" });
  check("mismo teléfono, mismo precio, número distinto sin coordenadas → probable", computeLinks([c, d]).groups.length === 0);
  const e = row({ phone: "+34614609448", operation: "sale", price: 1125000, square_meters: 130, bedrooms: 2, bathrooms: 2, address: "Calle de Bonetero, 13", latitude: 40.46000, longitude: -3.6800 });
  const f = row({ portal: "fotocasa", phone: "+34614609448", operation: "sale", price: 1125000, square_meters: 130, bedrooms: 2, bathrooms: 2, address: "Calle de Bonetero, 9", latitude: 40.46030, longitude: -3.6803 });
  check("número distinto pero coordenadas a <60 m (geocodificación del portal): sí cierto", computeLinks([e, f]).groups.length === 1);
}

console.log("── coordenadas: «cierto» solo con < 60 m + metros + habitaciones + MISMA planta ──");
{
  const base = { latitude: 40.4500, longitude: -3.7000, square_meters: 95, bedrooms: 3, bathrooms: 2, price: 600000, address: null as string | null };
  const a = row({ ...base, floor: "4ª planta exterior" });
  const b = row({ ...base, portal: "fotocasa", floor: "4ª planta exterior", latitude: 40.45020 });
  check("22 m, misma planta: cierto (R3)", computeLinks([a, b]).groups.length === 1);
  const c = row({ ...base, portal: "fotocasa", floor: null, latitude: 40.45020 });
  const rc = computeLinks([a, c]);
  check("22 m pero sin planta en un lado: solo probable", rc.groups.length === 0 && rc.links[0]?.level === "probable", rc.links);
  const d = row({ ...base, portal: "fotocasa", floor: "4ª planta exterior", latitude: 40.45080 });
  const rd = computeLinks([a, d]);
  check("89 m aunque coincida todo: solo probable", rd.groups.length === 0 && rd.links[0]?.level === "probable", rd.links);
  const e = row({ ...base, portal: "fotocasa", floor: "2ª planta exterior", latitude: 40.45020 });
  check("22 m pero planta distinta (4.ª vs 2.ª): ningún enlace", computeLinks([a, e]).links.length === 0);
}

console.log("── pin aproximado: no cuenta como coordenada para enlazar ──");
{
  const base = { latitude: 40.4500, longitude: -3.7000, square_meters: 95, bedrooms: 3, bathrooms: 2, price: 600000, address: null as string | null, floor: "4ª planta exterior" };
  const exact = row({ ...base, location_precision: "exact" });
  const near = row({ ...base, portal: "fotocasa", latitude: 40.45020, location_precision: "exact" });
  check("dos pines exactos a 22 m: cierto (R3, como siempre)", computeLinks([exact, near]).groups.length === 1);
  const nearApprox = row({ ...base, portal: "fotocasa", latitude: 40.45020, location_precision: "approximate" });
  const r1 = computeLinks([exact, nearApprox]);
  check("a 22 m pero uno aproximado: no enlaza por coordenadas", r1.groups.length === 0 && r1.links.length === 0, r1.links);
  const farApprox = row({ ...base, portal: "fotocasa", latitude: 40.4560, location_precision: "approximate" }); // ~670 m
  check("aproximado a ~670 m: tampoco se veta (el pin puede estar así de desplazado)", computeLinks([exact, farApprox]).links.length === 0);
  const veryFar = row({ ...base, portal: "fotocasa", latitude: 40.48, location_precision: "approximate" }); // ~3,3 km
  check("aproximado a >1,5 km: sigue sin enlazar", computeLinks([exact, veryFar]).links.length === 0);
  const phoneA = row({ ...base, phone: "+34688111222", location_precision: "exact" });
  const phoneB = row({ ...base, portal: "fotocasa", phone: "+34688111222", latitude: 40.4560, location_precision: "approximate", address: null });
  check("mismo teléfono + mismas características, pin aproximado a ~670 m: el teléfono sigue enlazando", computeLinks([phoneA, phoneB]).links.some((l) => l.relation === "mismo_inmueble"));
}

console.log("── planta en inglés vs español (misma publicación de Idealista en dos idiomas) ──");
{
  const mk = (floor: string, addr: string) => row({ phone: "+34670000001", floor, address: addr, square_meters: 60, bedrooms: 2, bathrooms: 1, price: 1500, operation: "rent" });
  const es = mk("4ª planta exterior", "Alquiler de piso en Calle de Embajadores, 74");
  const en = mk("4th floor exterior", "Flat / apartment for rent in Calle de Embajadores, 74");
  check("«4ª planta» y «4th floor» son la misma planta", computeLinks([es, en]).links.some((l) => l.relation === "mismo_inmueble"));
  const en3 = mk("3rd floor exterior", "Flat / apartment for rent in Calle de Embajadores, 74");
  check("«4ª planta» vs «3rd floor» se contradicen", computeLinks([es, en3]).links.every((l) => l.relation !== "mismo_inmueble"));
}

console.log("── dirección limpia (0186) y direcciones solo-barrio: no contradicen ni enlazan por sí solas ──");
{
  const kb = streetKey("Pinar del Rey · Hortaleza");
  check("«Pinar del Rey · Hortaleza»: sin número (no es calle)", kb.number === null && kb.tokens.has("pinar"), kb);
  const kg = streetKey("Goya");
  check("«Goya» solo-barrio: sin número", kg.number === null && kg.tokens.has("goya"), kg);
  const ko = streetKey("Calle de Orense, 49");
  check("«Calle de Orense, 49»: calle + número", ko.number === "49" && [...ko.tokens].join() === "orense", ko);
  const base = { phone: "+34688000111", square_meters: 70, bedrooms: 2, bathrooms: 1, price: 400000 };
  // mismo teléfono y características: una calle y un barrio (no se contradicen) = cierto
  const street = row({ ...base, address: "Calle de Orense, 49" });
  const barrio = row({ ...base, portal: "fotocasa", address: "Goya" });
  check("calle vs solo-barrio con mismo teléfono: cierto (no hay contradicción)", computeLinks([street, barrio]).links.some((l) => l.level === "cierto"));
  // sin teléfono: dos solo-barrio iguales NO enlazan por coincidir en barrio
  const b1 = row({ address: "Goya", phone: null, owner_name: "Ana", price: 400000, square_meters: 70 });
  const b2 = row({ address: "Goya", portal: "fotocasa", phone: null, owner_name: "Ana", price: 400000, square_meters: 70 });
  check("dos solo-barrio «Goya» sin teléfono, mismos m²/hab/precio: ningún enlace", computeLinks([b1, b2]).links.length === 0, computeLinks([b1, b2]).links);
  const p1 = row({ address: "Pinar del Rey · Hortaleza", phone: null, price: 300000, square_meters: 60, bedrooms: 2 });
  const p2 = row({ address: "Pinar del Rey · Hortaleza", portal: "fotocasa", phone: null, price: 300000, square_meters: 60, bedrooms: 2 });
  check("dos «Pinar del Rey · Hortaleza» sin teléfono: ningún enlace", computeLinks([p1, p2]).links.length === 0);
}

console.log("── «cierto» con calle o número distintos (medido 2026-10-13: 27 en la BD) ──");
{
  const mk = (address: string, portal: string, lat: number) =>
    row({ phone: "+34699222333", square_meters: 90, bedrooms: 3, bathrooms: 2, price: 700000, portal, address, latitude: lat, longitude: -3.7, location_precision: "exact" });
  // misma calle, portales distintos (31 vs 37 en el mismo portal), pin a 19 m
  const a = mk("Calle de Aguilafuente, 31, Valdezarza", "fotocasa", 40.4500);
  const b = mk("Calle de Aguilafuente, 37, Valdezarza", "fotocasa", 40.45017);
  const r1 = computeLinks([a, b]);
  check("mismo portal, nº 31 vs 37, pin a 19 m: probable, no cierto", r1.links.length === 1 && r1.links[0].level === "probable", r1.links);
  // calles distintas con el pin a 19 m
  const c = mk("Plaza conde de toreno, 1", "idealista", 40.4500);
  const d = mk("Calle de San Bernardino, 2, Universidad - Malasaña", "fotocasa", 40.45017);
  const r2 = computeLinks([c, d]);
  check("calles distintas con el pin a 19 m: probable, no cierto", r2.links.length === 1 && r2.links[0].level === "probable", r2.links);
  // mismo portal Δ=2 cross-portal y a 5 m: se mantiene (un portal redondea el número)
  const e = mk("Paseo del Rey, 24, Argüelles", "fotocasa", 40.4500);
  const f = mk("Paseo del Rey, 26", "idealista", 40.450045);
  check("misma calle, entre portales, nº ±2 y pin a 5 m: sigue cierto", computeLinks([e, f]).links.some((l) => l.level === "cierto"));
  // Δ=4 entre portales: probable
  const g = { ...mk("Paseo del Rey, 22, Argüelles", "fotocasa", 40.4500), price: 650000 };
  check("misma calle, nº ±4 y precio distinto: probable", computeLinks([g, f]).links.every((l) => l.level !== "cierto"));
  // mismo número pero pin a 40 m y calle igual: cierto (nada se contradice)
  const h = mk("Calle de Fernando el Católico, 40", "idealista", 40.4500);
  const i = mk("Calle de Fernando el Católico, 40, Gaztambide", "fotocasa", 40.45036);
  check("misma calle y número: cierto", computeLinks([h, i]).links.some((l) => l.level === "cierto"));
}

console.log("── teléfonos de cualquier país (corrige la pérdida del 3,2 % de Fotocasa) ──");
check("España: igual que antes", normalizeContactPhone("+34 600 12 34 56") === "+34600123456" && normalizeContactPhone("600123456") === "+34600123456" && normalizeContactPhone("0034600123456") === "+34600123456");
check("Francia: +33 y 0033 se conservan en E.164", normalizeContactPhone("+33 7 12 34 56 78") === "+33712345678" && normalizeContactPhone("0033712345678") === "+33712345678");
check("Reino Unido: +44 se conserva", normalizeContactPhone("+44 7911 123456") === "+447911123456");
check("basura o corto → null", normalizeContactPhone("12345") === null && normalizeContactPhone("") === null && normalizeContactPhone(null) === null);
check("un +34 inválido NO se acepta como internacional", normalizeContactPhone("+34 123456789") === null);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
