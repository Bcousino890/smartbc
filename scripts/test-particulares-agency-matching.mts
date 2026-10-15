/**
 * Test del cruce particulares ↔ propiedades de agencias del CRM
 * (lib/particulares/agency-matching.ts, migración 0199).
 *
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-particulares-agency-matching.mts
 */
import { computeLinks, type LinkRow } from "../lib/particulares/linking-core.ts";
import {
  applyAgencyToState,
  computeAgencyMatches,
  computeAgencyPortalLinks,
  propertyToLinkRow,
  viewRowToLinkRow,
  type AgencyPropertyInput,
} from "../lib/particulares/agency-matching.ts";
import { agencyCore, buildDescIndex, jaccardSets, normRef, photoKey, photoOverlap, sameAgency } from "../lib/particulares/similarity.ts";
import { kindOfAdvertiser, sourceLabel } from "../lib/particulares/source-kind.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

let n = 0;
const uid = (pfx: string) => `${pfx}000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;
const par = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: uid("a"),
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
  phone: "600123456",
  phone2: null,
  owner_name: "Marta",
  assigned_to: null,
  n_photos: 10,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
const prop = (over: Partial<AgencyPropertyInput> = {}): AgencyPropertyInput => ({
  id: uid("b"),
  agency_name: "Housingo",
  operation: "sale",
  status: "available",
  archived_at: null,
  price: 500000,
  bedrooms: 2,
  bathrooms: 1,
  square_meters: 80,
  address: "Calle de Jorge Juan, 92, Madrid",
  latitude: null,
  longitude: null,
  created_at: "2026-09-05T00:00:00Z",
  ...over,
});

console.log("── propiedad → fila del enlazador ──");
const lr = propertyToLinkRow(prop({ bathrooms: 0, square_meters: 0, price: "0" }));
check("baños/m²/precio a 0 = sin dato; sin teléfono; portal agencia",
  lr.bathrooms === null && lr.square_meters === null && lr.price === null && lr.phone === null && lr.portal === "agencia", lr);
check("archivada o vendida = inactiva", !propertyToLinkRow(prop({ status: "sold" })).is_active && !propertyToLinkRow(prop({ archived_at: "2026-01-01" })).is_active);

console.log("── matching estricto ──");
{
  const a = par();
  const p = prop();
  const m = computeAgencyMatches([a], [p]);
  check("misma calle+nº, m², hab., baños y precio: cierto", m.length === 1 && m[0].level === "cierto" && m[0].particular_id === a.id && m[0].property_id === p.id, m);
}
{
  // Mismo teléfono que el de la agencia NO basta: la propiedad no aporta teléfono y calle distinta no enlaza.
  const a = par({ address: "Calle de Alcalá, 10" });
  check("otra calle, aunque coincidan m²/hab./precio: sin enlace", computeAgencyMatches([a], [prop()]).length === 0);
}
{
  const a = par({ square_meters: 120 });
  check("misma calle pero m² muy distintos: sin enlace", computeAgencyMatches([a], [prop()]).length === 0);
}
{
  const a = par({ bedrooms: 3 });
  check("misma calle y m² pero otras habitaciones: sin enlace", computeAgencyMatches([a], [prop()]).length === 0);
}
{
  const a = par({ price: 650000 });
  check("precio +30 % en la misma operación: nunca cierto", computeAgencyMatches([a], [prop()]).every((x) => x.level !== "cierto"));
  check("precio +80 %: sin enlace", computeAgencyMatches([par({ price: 900000 })], [prop()]).length === 0);
}
{
  const a = par({ price: 515000 });
  const m = computeAgencyMatches([a], [prop()]);
  check("precio ±3 %: sigue cierto", m.length === 1 && m[0].level === "cierto", m);
}
{
  const a = par({ operation: "rent", price: 2000 });
  const m = computeAgencyMatches([a], [prop()]);
  check("otra operación: como mucho probable (nunca cierto)", m.every((x) => x.level !== "cierto"), m);
}
{
  const a = par();
  const m = computeAgencyMatches([a], [prop({ bathrooms: 0 })]);
  check("agencia sin baños: no es cierto (solo sugerencia)", m.every((x) => x.level === "probable"), m);
}
{
  // Edificio con dos propiedades iguales de agencia: ambiguo → no cierto.
  const a = par();
  const m = computeAgencyMatches([a], [prop(), prop({ agency_name: "Level" })]);
  check("dos propiedades idénticas en el edificio: ninguna cierta", m.every((x) => x.level !== "cierto"), m);
}
{
  const a = par();
  const p = prop();
  check("descartado a mano: nunca se propone", computeAgencyMatches([a], [p], [{ particular_id: a.id, property_id: p.id, status: "descartado" }]).length === 0);
  const b = par({ address: "Calle de Alcalá, 10", square_meters: 50 });
  const m2 = computeAgencyMatches([b], [p], [{ particular_id: b.id, property_id: p.id, status: "confirmado" }]);
  check("confirmado a mano: siempre cierto", m2.length === 1 && m2[0].level === "cierto", m2);
}
{
  const a = par();
  const b = par({ portal: "fotocasa" });
  const m = computeAgencyMatches([a, b], [prop()]);
  check("no mezcla pares particular↔particular", m.every((x) => x.particular_id === a.id || x.particular_id === b.id) && m.length <= 2);
}

console.log("── resumen (fuente «Agencia») ──");
{
  const a = par();
  const p = prop();
  const rows = [a];
  const res = computeLinks(rows);
  const matches = computeAgencyMatches(rows, [p]);
  applyAgencyToState(res, rows, [p], matches);
  const s = res.state.get(a.id)?.link_summary;
  check("anuncio suelto + agencia: resumen n=2 con portal «agencia» y la agencia",
    !!s && s.n === 2 && s.portals.includes("agencia") && s.agencies?.[0] === "Housingo" && s.offers?.some((o) => o.portal === "agencia") === true, s);
  check("no cambia duplicate_of", res.state.get(a.id)?.duplicate_of === null);
}
{
  // Grupo idealista+fotocasa (mismo teléfono) y la agencia casa con el duplicado: va al principal.
  const a = par({ portal: "idealista" });
  const b = par({ portal: "fotocasa", n_photos: 1, address: "Calle de Jorge Juan, 92, Salamanca" });
  const p = prop();
  const rows = [a, b];
  const res = computeLinks(rows);
  const prim = rows.filter((r) => !res.state.get(r.id)?.duplicate_of);
  const matches = computeAgencyMatches(prim, [p]);
  applyAgencyToState(res, prim, [p], matches);
  const primary = res.groups[0]?.primary;
  const s = primary ? res.state.get(primary)?.link_summary : null;
  check("grupo existente: n=3 en el principal", !!primary && !!s && s.n === 3 && s.portals.includes("agencia"), s);
  const dup = rows.find((r) => r.id !== primary)!;
  check("el duplicado sigue oculto y sin resumen", res.state.get(dup.id)?.duplicate_of === primary && res.state.get(dup.id)?.link_summary === null);
}
{
  const a = par({ operation: "rent", price: 2000 });
  const p = prop();
  const rows = [a];
  const res = computeLinks(rows);
  applyAgencyToState(res, rows, [p], computeAgencyMatches(rows, [p]));
  check("un «probable» no toca la ficha", res.state.get(a.id)?.link_summary == null);
}

console.log("── taxonomía de etiquetas ──");
check("particular", sourceLabel({ kind: "particular", portal: "idealista" }) === "Idealista · Particular");
check("agencia en portal", sourceLabel({ kind: "agencia_portal", portal: "habitaclia", agency: "Acme" }) === "Habitaclia · Agencia Acme");
check("web de agencia", sourceLabel({ kind: "agencia_web", agency: "Housingo" }) === "Web de Housingo");
check("advertiser_type → tipo", kindOfAdvertiser("professional") === "agencia_portal" && kindOfAdvertiser("particular") === "particular" && kindOfAdvertiser(null) === "particular");

console.log("── señales de similitud ──");
check("agencia: Housingo Real Estate S.L. = housingo", sameAgency("Housingo Real Estate S.L.", "HOUSINGO") && agencyCore("Level Real Estate") === "level" && !sameAgency("Level", "Housingo"));
check("referencias: BC-1746 = bc 1746", normRef("BC-1746") === normRef("bc 1746") && normRef("12") === null);
check("foto: mismo fichero con otro tamaño", photoKey("https://img.x.com/a/ab12cd34ef.webp?w=300") === photoKey("https://cdn.y.com/z/ab12cd34ef-800x600.jpg"));
check("fotos: 2 iguales de 4 = fuerte; 1 = no", photoOverlap(["a1a1a1a1", "b2b2b2b2", "c3c3c3c3", "d4d4d4d4"], ["a1a1a1a1", "b2b2b2b2", "x9x9x9x9"]).strong && !photoOverlap(["a1a1a1a1"], ["a1a1a1a1"]).strong);
{
  const T1 = "Luminoso piso exterior reformado integramente en 2022 con cocina abierta suelos de roble salon con balcon a la calle dos dormitorios amplios armarios empotrados aire acondicionado calefaccion central ascensor portero fisico comunidad baja cerca del metro y comercios";
  const T2 = "Luminoso piso exterior reformado integramente en 2022 con cocina abierta, suelos de roble, salon con balcon a la calle. Dos dormitorios amplios, armarios empotrados, aire acondicionado, calefaccion central, ascensor, portero fisico, comunidad baja, cerca del metro y comercios. Contacte con nosotros";
  const T3 = "Coqueto apartamento interior en finca regia necesita reforma parcial cocina independiente salon con dos ambientes un dormitorio principal con vestidor bano con ducha trastero incluido en el precio ideal inversion alquiler turistico zona tranquila junto al parque";
  const idx = buildDescIndex([{ id: "1", description: T1 }, { id: "2", description: T2 }, { id: "3", description: T3 }]);
  const s12 = jaccardSets(idx.of("1")!, idx.of("2")!);
  const s13 = jaccardSets(idx.of("1")!, idx.of("3")!);
  check("descripción: misma ficha reescrita ≈ alta; otro piso ≈ 0", s12 >= 0.5 && s13 < 0.05, { s12, s13 });
}

console.log("── agencias: misma agencia en varios portales (agencia_portal) ──");
const pro = (over: Record<string, unknown> = {}) =>
  viewRowToLinkRow({
    ...par({ phone: "910000000" }),
    id: uid("c"),
    advertiser_type: "professional",
    owner_name: "Acme Inmobiliaria S.L.",
    agency_key: "acme inmobiliaria s.l",
    reference: null,
    external_id: null,
    photos_head: [],
    ...over,
  } as never);
const D1 = "Luminoso piso exterior reformado integramente en 2022 con cocina abierta suelos de roble salon con balcon a la calle dos dormitorios amplios armarios empotrados aire acondicionado calefaccion central ascensor portero fisico comunidad baja cerca del metro y comercios";
{
  const a = pro({ portal: "idealista", description: D1, reference: "AC-100" });
  const b = pro({ portal: "habitaclia", description: D1 + " Referencia AC-100", reference: "AC-100", address: "Calle Jorge Juan 92" });
  const r = computeAgencyPortalLinks([a, b]);
  check("misma agencia, misma referencia en 2 portales: cierto y agrupado", r.links.length === 1 && r.links[0].level === "cierto" && r.groups.length === 1, r.links);
  const ps = r.state.get(r.groups[0].primary)?.link_summary;
  check("el resumen conserva tipo y agencia de cada fuente", !!ps && ps.offers!.every((o) => o.kind === "agencia_portal" && o.agency === "Acme Inmobiliaria S.L."), ps);
}
{
  // Edificio: 3 pisos IGUALES de la misma agencia (mismos m²/hab./precio/calle), descripciones distintas → nada cierto.
  const mk = (desc: string, ref: string) => pro({ portal: "idealista", description: desc, reference: ref });
  const x = mk(D1, "AC-1");
  const y = mk("Piso con terraza y vistas despejadas listo para entrar a vivir parquet flotante ventanas de aluminio doble cristal puerta blindada cocina equipada con electrodomesticos nuevos amplio salon comedor luminoso ideal familias con ninos cerca de colegios y parques", "AC-2");
  const z = pro({ portal: "habitaclia", description: "Excelente oportunidad en edificio senorial piso con mucho encanto techos altos molduras originales balcones corridos suelos hidraulicos restaurados reforma integral reciente calefaccion individual de gas natural zona muy comercial", reference: "AC-3" });
  const r = computeAgencyPortalLinks([x, y, z]);
  check("3 pisos iguales de una agencia con descripción y ref distintas: ninguno cierto, sin grupo", r.links.every((l) => l.level !== "cierto") && r.groups.length === 0, r.links.map((l) => [l.level, l.rule]));
}
{
  // Mismo edificio, mismo piso, pero otro precio/hab.: sin enlace aunque la descripción coincida
  const a = pro({ portal: "idealista", description: D1 });
  const b = pro({ portal: "habitaclia", description: D1, bedrooms: 4 });
  check("misma descripción pero otras habitaciones: veto", computeAgencyPortalLinks([a, b]).links.length === 0);
}
{
  // Sin dirección en uno, pero descripción casi idéntica + m² + misma agencia: cierto o probable (nunca nada)
  const a = pro({ portal: "idealista", description: D1, address: null });
  const b = pro({ portal: "habitaclia", description: D1 + " Visitas con cita previa", address: "Calle Jorge Juan 92" });
  const r = computeAgencyPortalLinks([a, b]);
  check("descripción casi idéntica sin dirección en un lado: se enlaza", r.links.length === 1 && r.links[0].evidence.desc_sim !== undefined, r.links);
}
{
  // Referencias de agencias distintas con el mismo texto "100" no enlazan
  const a = pro({ portal: "idealista", reference: "AB-100", owner_name: "Acme", agency_key: "acme", address: "Calle Mayor 1", square_meters: 60 });
  const b = pro({ portal: "habitaclia", reference: "AB-100", owner_name: "Otra Casa", agency_key: "otra casa", address: "Calle Atocha 9", square_meters: 90 });
  check("misma ref pero otra agencia: no cuenta", computeAgencyPortalLinks([a, b]).links.length === 0);
}
{
  // El id global del portal (idealista) sí vale entre agencias/web
  const a = pro({ portal: "idealista", external_id: "idealista-108765432", address: "Calle de Jorge Juan, 92" });
  const w = prop({ external_id: "108765432" });
  const m = computeAgencyMatches([a], [w]);
  check("web de agencia con el id de Idealista del anuncio: cierto", m.length === 1 && m[0].level === "cierto" && m[0].evidence.ref_equal === true, m);
}
{
  // Web de Housingo vs el anuncio de Housingo en un portal: misma agencia + descripción
  const a = pro({ portal: "idealista", owner_name: "Housingo", agency_key: "housingo", description: D1, address: "Calle de Jorge Juan, 92" });
  const w = prop({ description: D1 + " Housingo", agency_name: "Housingo Real Estate" });
  const m = computeAgencyMatches([a], [w]);
  check("anuncio de Housingo en Idealista vs web de Housingo: cierto con razones", m.length === 1 && m[0].level === "cierto" && Array.isArray(m[0].evidence.reasons) && (m[0].evidence.reasons as string[]).length >= 2, m);
}
{
  // Resumen del grupo: la web de agencia se ve como agencia_web con el nombre
  const a = pro({ portal: "idealista", owner_name: "Housingo", agency_key: "housingo", description: D1 });
  const w = prop({ description: D1, agency_name: "Housingo" });
  const rows = [a];
  const res = computeAgencyPortalLinks(rows);
  applyAgencyToState(res, rows, [w], computeAgencyMatches(rows, [w]));
  const s = res.state.get(a.id)?.link_summary;
  check("resumen: idealista·agencia + web de Housingo", !!s && s.offers!.some((o) => o.kind === "agencia_portal") && s.offers!.some((o) => o.kind === "agencia_web" && o.agency === "Housingo"), s);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
