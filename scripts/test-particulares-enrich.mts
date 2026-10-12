/**
 * Test del enriquecimiento de anuncios de particulares desde la descripción
 * (lib/particulares/enrich-from-description.ts, módulo PURO).
 *
 * Cada caso sale de un texto REAL medido en el CRM el 2026-10-12 (ver CLAUDE.md → «Enriquecer particulares…»).
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-particulares-enrich.mts
 */
import {
  addNumberToAddress,
  addressHasNumber,
  allPhoneKeys,
  applyGeoVerdict,
  candidateKey,
  distanceMeters,
  findAddressMentions,
  findPhoneMentions,
  hashDescription,
  looksLikeAgencyText,
  looksLikeScamTemplate,
  planEnrichment,
  prettyStreet,
  sameStreet,
  spreadFromRows,
  verifyWithGeocode,
  type EnrichRow,
  type PhoneSpreadEntry,
  type Proposal,
} from "../lib/particulares/enrich-from-description.ts";
import { isGenericOwnerName } from "../lib/particulares/enrich-names.ts";
import { streetKey } from "../lib/particulares/linking-core.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const base: EnrichRow = {
  id: "r1",
  portal: "idealista",
  advertiser_type: "particular",
  description: "",
  address: null,
  zone: null,
  municipality: "Madrid",
  owner_name: "Particular",
  phone: null,
  phone2: null,
  location_precision: null,
  latitude: null,
  longitude: null,
};
const clean = (): PhoneSpreadEntry => ({ props: 1, pro: 0 });
const plan = (description: string, over: Partial<EnrichRow> = {}, spread: ((k: string) => PhoneSpreadEntry | undefined) | null = clean) =>
  planEnrichment({ ...base, description, ...over }, { spread }).proposals;
const pick = (ps: Proposal[], field: string, decision?: string) => ps.filter((p) => p.field === field && (!decision || p.decision === decision));

// ── A) Teléfono ────────────────────────────────────────────────────────────
console.log("A) teléfono: formatos");
const phones = (t: string) => findPhoneMentions(t).filter((m) => !m.bad).map((m) => m.value);
check("«Whatsapp 693 249 247»", phones("Déjenme un WhatsApp 693 249 247.")[0] === "+34693249247", phones("Déjenme un WhatsApp 693 249 247."));
check("«610-56-15-12»", phones("llame al 610-56-15-12 por favor")[0] === "+34610561512");
check("«6 3 0 08 25 66»", phones("llamar a Jorge 6 3 0 08 25 66 Se vende")[0] === "+34630082566");
check("«6 1 0 5 6 1 5 1 2»", phones("Teléfono: 6 1 0 5 6 1 5 1 2")[0] === "+34610561512");
check("«+34 663-041-932» y «(+34) 635 129 061»", phones("whatsapp +34 663-041-932")[0] === "+34663041932" && phones("al Teléfono: (+34) 635 129 061 POR")[0] === "+34635129061");
check("«+ 3 4 6 3 0 6 7 3 4 3 5»", phones("WHATSAPP T + 3 4 6 3 0 6 7 3 4 3 5 Ven")[0] === "+34630673435");
check("«644.256024» y «627. 865. 647»", phones("telefono 644.256024.")[0] === "+34644256024" && phones("directo es el 627. 865. 647, escríbeme")[0] === "+34627865647");
check("«915303240-649813930» → dos números", phones("cercanos. 915303240-649813930.ABSTENERSE").length === 2, phones("cercanos. 915303240-649813930.ABSTENERSE"));
check("internacional con + («+33 6 74 84 91 60»)", phones("WhatsApp: + 3 3 6 7 4 8 4 9 1 6 0.")[0] === "+33674849160", phones("WhatsApp: + 3 3 6 7 4 8 4 9 1 6 0."));
check("«2026 630 746 816»: ventana de 9 cifras ambigua", findPhoneMentions("desde 2026 630 746 816 llamar")[0]?.ambiguousRun === true);

console.log("A) teléfono: lo que NO es un teléfono de contacto");
check("líneas de autobús", phones("autobús a escasos minutos (72-73-43-40-9-N2) y metro").length === 0 && phones("líneas de autobuses (8-19-45-47-59-78-85-86-148-247-N13).").length === 0);
check("referencia", phones("Ref: 612345678 del anuncio").length === 0);
check("precio y m²", phones("Precio 650 000 000 €").length === 0 && phones("612345678 m²").length === 0);
check("900/800 gratuito", phones("llame al 900 423 525 ahora").length === 0);
check("bloque de empresa: «Inversora GLA, S.L. 691 103 618»", phones("Inversora GLA, S.L.? 691 103 618 | ✉️.").length === 0);
check("listado de servicios cercanos con «0,15 km · Tel: +34…»", phones("Farmacia Argüelles - Calle de Quintana0,148 kmClínica · Tel: +34915596521Parafarmacia").length === 0);
check("«ABSTENERSE AGENCIAS INMOBILIARIAS Tlf. 641 644 359» SÍ vale (negado)", phones("ABSTENERSE AGENCIAS INMOBILIARIAS Tlf. 641 644 359.").length === 1);
check("«sin comisión de agencia. 633456462» SÍ vale", phones("Venta directa sin comisión de agencia. 633456462.").length === 1);

console.log("A) teléfono: confianza y destino");
let ps = plan("Interesados contactar con Esther 657909682. distribución: la casa");
check("etiquetado + vacío → phone alta/apply", pick(ps, "phone", "apply").length === 1 && pick(ps, "phone")[0].confidence === "alta" && pick(ps, "phone")[0].value === "+34657909682", ps);
ps = plan("Interesados contactar con Esther 657909682. distribución: la casa", {}, null);
check("sin dato de reparto → solo candidato (media)", pick(ps, "phone")[0].decision === "candidate" && pick(ps, "phone")[0].confidence === "media", ps);
ps = plan("Llamar al 657909682 para visitas.", { phone: "+34600111222" });
check("ya hay teléfono → phone2, nunca sustituye", pick(ps, "phone").length === 0 && pick(ps, "phone2", "apply")[0]?.value === "+34657909682", ps);
ps = plan("Llamar al 657909682 para visitas.", { phone: "+34600111222", phone2: "+34600999888" });
check("phone2 ocupado → candidato, no se pisa", pick(ps, "phone2", "apply").length === 0 && pick(ps, "phone2", "candidate").length === 1, ps);
ps = plan("Contacto: 689225011 / 655097177.", { phone: "+34655097177" });
check("«689225011 / 655097177» con el segundo = principal → phone2 alta", pick(ps, "phone2", "apply")[0]?.value === "+34689225011", ps);
ps = plan("Llamar a Isabel 654833379 o Massimo 606594477.");
check("dos números sin teléfono previo → no se aplica ninguno (media)", pick(ps, "phone", "apply").length === 0 && pick(ps, "phone", "candidate").length === 2, ps);
ps = plan("Muy luminoso. 628787772 Llamar por las tardes.");
check("número suelto sin etiqueta → media", pick(ps, "phone")[0]?.confidence === "media" && pick(ps, "phone")[0].decision === "candidate", ps);
ps = plan("Contacto 612345678 y 623456789 y 634567890");
check("varios sin nombres: ninguno alta", pick(ps, "phone", "apply").length === 0, ps);
ps = plan("Llamar al 625 189 754.", { phone: "+34625189574" });
check("casi igual al principal (errata) → no alta", pick(ps, "phone2", "apply").length === 0 && pick(ps, "phone2")[0]?.reason?.includes("errata"), ps);
ps = plan("Whatsapp 663041932", {}, () => ({ props: 13, pro: 0 }));
check("número en ≥3 inmuebles → descartado", pick(ps, "phone", "apply").length === 0 && pick(ps, "phone", "drop")[0]?.rule === "phone.numero_repartido", ps);
ps = plan("Whatsapp 654833379", {}, () => ({ props: 1, pro: 2 }));
check("número que sale en anuncios profesionales → descartado", pick(ps, "phone", "drop")[0]?.rule === "phone.numero_de_agencia", ps);
ps = plan("Whatsapp 654833379", { advertiser_type: "professional" });
check("anuncio de agencia → nada", ps.length === 0);
ps = plan("Este apartamento es de mi hermana. para mas detalles, escribele por whatsapp +34 663-041-932.");
check("plantilla de estafa → nada", ps.length === 0 && looksLikeScamTemplate("belongs to my sister. For more details, write to her on WhatsApp at 602676243"));
ps = plan("Llamar al 657909682 para visitas.", { phone: "+447564436186" });
check("ficha con teléfono extranjero + uno español en el texto → no alta", pick(ps, "phone2", "apply").length === 0, ps);
ps = plan("Whatsapp: +33 6 74 84 91 60");
check("internacional → media", pick(ps, "phone")[0]?.confidence === "media" && pick(ps, "phone")[0].value === "+33674849160", ps);
ps = plan("Somos una agencia inmobiliaria con más de 10 años. Llámanos al 612345678");
check("la descripción habla como agencia → nada alta", pick(ps, "phone", "apply").length === 0 && looksLikeAgencyText("Somos una agencia inmobiliaria"), ps);
check("«ahorrándonos los honorarios de una inmobiliaria» NO es texto de agencia", !looksLikeAgencyText("particular ahorrándonos los honorarios de una inmobiliaria"));
check("allPhoneKeys para el índice", JSON.stringify(allPhoneKeys("a 628787772 y +34 663-041-932")) === JSON.stringify(["34628787772", "34663041932"]), allPhoneKeys("a 628787772 y +34 663-041-932"));

// ── B) Dirección ───────────────────────────────────────────────────────────
console.log("B) dirección: patrones y contexto");
const addr = (t: string) => findAddressMentions(t).map((m) => `${prettyStreet(m.streetText)}, ${m.number}|${m.context}`);
check("«Calle de Orense nº 49»", addr("Piso en la Calle de Orense nº 49 reformado")[0]?.startsWith("Calle de Orense, 49"), addr("Piso en la Calle de Orense nº 49 reformado"));
check("«C/ Serrano, 12, 3ºB»", addr("situado en C/ Serrano, 12, 3ºB")[0]?.startsWith("Calle Serrano, 12|location"), addr("situado en C/ Serrano, 12, 3ºB"));
check("«Avda. de América 14»", addr("ubicado en Avda. de América 14 junto")[0]?.startsWith("Avenida de América, 14"));
check("«a 5 min de la calle Serrano 12» = proximidad", addr("a 5 min de la calle Serrano 12")[0]?.endsWith("proximity"), addr("a 5 min de la calle Serrano 12"));
check("«cerca de la calle Serrano 12» = proximidad", addr("Muy cerca de la calle Serrano 12")[0]?.endsWith("proximity"));
check("«junto al nº…»", addr("junto a Calle Alcalá 20 hay metro")[0]?.endsWith("proximity"));
check("«centro comercial Plaza Río 2» = POI", findAddressMentions("a 300 metros del centro comercial plaza río 2 y").length === 0 || addr("a 300 metros del centro comercial plaza río 2 y")[0].endsWith("poi"));
check("«plaza de garaje 27» no es calle", addr("Plaza de garaje 27 m² con capacidad").length === 0);
check("«Calle X 5 piso interior» (planta) no es portal", addr("calle Fernández de los Ríos, 5 piso interior").length === 0);
check("«calle Serrano 3º» (planta) no es portal", addr("en calle Serrano 3º exterior").length === 0);
check("«Calle Gran Vía, 4th floor» no es portal", addr("on Calle Gran Vía, 4th floor with lift").length === 0);
check("«climalit» no es «cl»", addr("cristal climalit oscilobatiente 3 armarios").length === 0);
check("«Calle Monte Perdido 32» + «a 5 min» después", addr("Piso a reformar en Calle Monte Perdido 32 Excelente comunicación")[0]?.startsWith("Calle Monte Perdido, 32"));
check("tokens de frase («Carretera s A, 5») no son calle", addr("carreteras A5, M30 y M40. Excelente").length === 0);
check("addressHasNumber", addressHasNumber("Calle Mayor, 5") && addressHasNumber("Piso en venta en Calle de Maldonado, Madrid, 38") && addressHasNumber("Calle X, s/n") && !addressHasNumber("Calle de Dulce Chacón, Virgen del Cortijo - Manoteras") && !addressHasNumber(null) && !addressHasNumber("Calle X 28045"));
check("addNumberToAddress", addNumberToAddress("Calle de Dulce Chacón, Virgen del Cortijo", "23") === "Calle de Dulce Chacón, 23, Virgen del Cortijo" && addNumberToAddress("Calle Mayor", "5") === "Calle Mayor, 5");
check("sameStreet tolera errata y artículos", sameStreet(streetKey("Calle de Boadilla del Camino").tokens, streetKey("Calle Bohadilla del Camino").tokens) && sameStreet(streetKey("Calle Poeta Esteban de Villegas").tokens, streetKey("Poeta Esteban Villegas").tokens) && !sameStreet(streetKey("Calle Mayor").tokens, streetKey("Calle Real").tokens));

console.log("B) dirección: reglas");
const fotocasa = { portal: "fotocasa", address: "Calle de Dulce Chacón, Virgen del Cortijo - Manoteras", zone: "Virgen del Cortijo - Manoteras", municipality: null };
ps = plan("Piso de lujo en venta – Calle Dulce Chacón 23, 6º – Madrid. Venta a puerta cerrada", fotocasa);
check("calle del texto = calle de la ficha, sin número → alta", pick(ps, "address", "apply")[0]?.value === "Calle de Dulce Chacón, 23, Virgen del Cortijo - Manoteras", ps);
ps = plan("situado en la calle Dulce Chacón 23, a 5 min de la calle Serrano 12", fotocasa);
check("«a 5 min de la calle Serrano 12» no confunde: solo se propone la calle de la ficha", pick(ps, "address", "apply").length === 1 && pick(ps, "address", "apply")[0].value.includes("23"), ps);
ps = plan("Cerca de la calle Dulce Chacón 23 hay un parque", fotocasa);
check("«cerca de la calle de la ficha 23» → nada", pick(ps, "address", "apply").length === 0, ps);
ps = plan("En la calle Serrano 12 hay una farmacia", fotocasa);
check("calle distinta a la de la ficha → descartado", pick(ps, "address", "apply").length === 0 && pick(ps, "address", "drop").length >= 1, ps);
ps = plan("situado en la calle Dulce Chacón 23", { ...fotocasa, address: "Calle de Dulce Chacón, 21, Virgen del Cortijo" });
check("la ficha ya trae número → no se toca", pick(ps, "address").length === 0, ps);
ps = plan("Se alquila piso en calle Dulce Chacón 23 y 25", fotocasa);
check("«23 y 25» (rango) o dos números para la misma calle → media, no se aplica sola", pick(ps, "address", "apply").length === 0 && pick(ps, "address", "candidate").length >= 1, ps);
ps = plan("piso de 45 m², Alquiler de piso en C. de Galileo, 7, Arapiles, Madrid, barrio Arapiles", { address: null, zone: "Arapiles", owner_name: "Raquel" });
check("título del portal en la descripción → alta con dirección limpia", pick(ps, "address", "apply")[0]?.value === "Calle de Galileo, 7", ps);
ps = plan("Se alquila apartamento en calle Valencia 18, en pleno centro de Madrid", { address: null, zone: "Lavapiés" });
check("sin calle en la ficha y texto libre → candidato (hace falta Nominatim)", pick(ps, "address", "apply").length === 0 && pick(ps, "address", "candidate")[0]?.confidence === "media" && !!pick(ps, "address")[0].geo, ps);
ps = plan("Se alquila piso en Calle Navacerrada 4.", { address: null, zone: "Zona Estación", owner_name: "Alquiler de piso en Calle Navacerrada, 7" });
check("el título del portal ya trae otra dirección → se descarta la del texto", pick(ps, "address", "apply").length === 0 && pick(ps, "address", "drop")[0]?.rule === "address.contradice_titulo_del_portal", ps);
ps = plan("Se alquila apartamento en calle Valencia 18, Madrid", { address: null, zone: "Lavapiés", title: "Piso en alquiler en Calle de Valencia, 18" });
check("columna `title` con la misma dirección → nada que añadir", pick(ps, "address").length === 0, ps);

console.log("B) dirección: confirmación con Nominatim");
const geoProp = pick(plan("situado en la calle Valencia 18, Madrid", { address: "Calle de Valencia, Lavapiés", zone: "Lavapiés", latitude: 40.4105, longitude: -3.7007 }), "address")[0];
check("calle de la ficha → alta con geo trusted", geoProp?.confidence === "alta" && geoProp.geo?.trusted === true && geoProp.geo.number === "18", geoProp);
const gRow = { ...base, municipality: "Madrid", latitude: 40.4105, longitude: -3.7007 };
const hitOk = { lat: 40.4107, lng: -3.7005, hasHouseNumber: true, houseNumber: "18", road: "Calle de Valencia", city: "Madrid" };
check("distanceMeters", Math.round(distanceMeters(40.4105, -3.7007, 40.4107, -3.7005)) < 40);
let v = verifyWithGeocode(gRow, geoProp.geo!, hitOk);
check("Nominatim confirma (número, calle, municipio, pin ≤1,5 km)", v.confirmed, v);
check("→ guarda coordenadas", applyGeoVerdict(geoProp, v).saveCoords === true);
v = verifyWithGeocode(gRow, geoProp.geo!, { ...hitOk, houseNumber: "20" });
check("otro número → sin confirmar, la dirección alta se queda como texto sin coordenadas", !v.confirmed && applyGeoVerdict(geoProp, v).saveCoords === false && applyGeoVerdict(geoProp, v).proposal.decision === "apply", v);
v = verifyWithGeocode(gRow, geoProp.geo!, { ...hitOk, lat: 40.5, lng: -3.5 });
check("pin del portal a >1,5 km → contradice: pasa a candidato", v.conflictsWithPin && applyGeoVerdict(geoProp, v).proposal.decision === "candidate", v);
v = verifyWithGeocode(gRow, geoProp.geo!, { ...hitOk, city: "Getafe" });
check("otro municipio → no confirma", !v.confirmed, v);
v = verifyWithGeocode(gRow, geoProp.geo!, null);
check("sin resultado → no confirma, sin romper", !v.confirmed && !v.conflictsWithPin, v);
const noStreet = pick(plan("Se alquila apartamento en calle Valencia 18, en pleno centro de Madrid", { address: null, zone: "Lavapiés" }), "address")[0];
const up = applyGeoVerdict(noStreet, verifyWithGeocode({ ...base, municipality: "Madrid" }, noStreet.geo!, hitOk));
check("sin calle en la ficha + Nominatim confirma → SUBE a alta", up.proposal.decision === "apply" && up.proposal.confidence === "alta" && up.saveCoords, up);
check("sin calle en la ficha y sin municipio ni pin → no sube", !verifyWithGeocode({ ...base, municipality: null }, noStreet.geo!, hitOk).confirmed);

// ── C) Responsable ─────────────────────────────────────────────────────────
console.log("C) responsable");
const owner = (t: string, over: Partial<EnrichRow> = {}) => pick(plan(t, over), "owner_name");
check("«Soy Elena, mejor contacta»", owner("RíoSoy Elena, mejor contacta por wasap")[0]?.value === "Elena" && owner("RíoSoy Elena, mejor contacta por wasap")[0].decision === "apply", owner("RíoSoy Elena, mejor contacta por wasap"));
check("«Me llamo Pablo»", owner("Me llamo Pablo y alquilo mi piso")[0]?.value === "Pablo");
check("«llamar a Jorge»", owner("NO AGENCIAS. Por favor, llamar a Jorge 6 3 0 08 25 66")[0]?.value === "Jorge");
check("«preguntar por Sonia»", owner("contactar por télefono o Whatsapp y preguntar por Sonia: 653124691.")[0]?.value === "Sonia");
check("«Un saludo, Ana»", owner("Gracias por su atención. Un saludo, Ana")[0]?.value === "Ana");
check("«Contacto: Lucía Características básicas» (solo el nombre)", owner("Precio: 760.000 € Contacto: Lucía Características básicas: 94 m²")[0]?.value === "Lucía");
check("«Mi nombre es María José»", owner("Mi nombre es María José y vendo")[0]?.value === "María José");
check("owner_name real → nunca", owner("Soy Elena, mejor contacta", { owner_name: "Carlos" }).length === 0);
check("título del anuncio en owner_name = genérico", owner("Soy Elena, mejor contacta", { owner_name: "Alquiler de piso en Calle de Atocha, 22" }).length === 1);
check("teléfono en owner_name = genérico", owner("Soy Elena, mejor contacta", { owner_name: "639183349" }).length === 1);
check("agencia → nunca", owner("Soy Elena, mejor contacta", { advertiser_type: "professional" }).length === 0);
check("«Contacto: Para más información» no es un nombre", owner("Contacto: Para más información llame").length === 0);
check("«Contacto: Exclusivo / Cerca / Inmueble / Gencias» no son nombres", owner("CONTACTO EXCLUSIVO PARA PARTICULARES. NO CONTACTAR AGENCIAS. Contacto Inmueble exterior").length === 0);
check("«Contacto: Sol» (barrio) no es nombre; «llamar a Pilar» sí", owner("Piso junto al metro. Contacto: Sol, cerca").length === 0 && owner("Interesados llamar a Pilar al 612345678")[0]?.value === "Pilar");
check("dos nombres → media (candidato)", owner("Llamar a Isabel 654833379 o a Massimo 606594477")[0]?.decision === "candidate", owner("Llamar a Isabel 654833379 o a Massimo 606594477"));
check("texto de agencia → nada alta", owner("Somos una agencia inmobiliaria. Soy Elena").every((p) => p.decision !== "apply"));
check("isGenericOwnerName", isGenericOwnerName("Particular") && isGenericOwnerName("") && isGenericOwnerName("Anuncio Particular") && !isGenericOwnerName("María") && !isGenericOwnerName("Javier Redondo"));

// ── D) Trazabilidad ────────────────────────────────────────────────────────
console.log("D) trazabilidad");
check("hashDescription estable y sensible al cambio", hashDescription("abc") === hashDescription("abc") && hashDescription("abc") !== hashDescription("abd"));
check("candidateKey estable entre formatos", candidateKey({ field: "phone", value: "+34 600-111-222" }) === candidateKey({ field: "phone", value: "+34600111222" }));
ps = plan("Interesados contactar con Esther 657909682.");
check("toda propuesta lleva evidencia con el número", ps.every((p) => p.evidence.length > 0 && p.evidence.length <= 200) && pick(ps, "phone")[0].evidence.includes("657909682"));
const sp = spreadFromRows([
  { id: "a", advertiser_type: "particular", address: "Calle Mayor, 5", zone: "Sol" },
  { id: "b", advertiser_type: "particular", address: "Piso en venta en Calle Mayor, 5", zone: "Sol" },
  { id: "c", advertiser_type: "professional", address: null },
]);
check("spreadFromRows: el mismo piso en dos anuncios cuenta una vez; el profesional aparte", sp.props === 1 && sp.pro === 1, sp);
check("sin descripción → nada", planEnrichment({ ...base, description: null }).proposals.length === 0);

console.log(`\n${ok} OK, ${fail} fallos`);
process.exit(fail ? 1 : 0);
