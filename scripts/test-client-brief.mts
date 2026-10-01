/**
 * Tests del encargo del cliente y del cruce con propiedades.
 *
 * Lo que se vigila:
 *  · que venta y alquiler no se contaminen (en venta no hay estudiantes ni
 *    estancia: el match de antes filtraba por `stay` también en venta y a
 *    ningún comprador le salía una sola sugerencia);
 *  · que solo se descarte una propiedad con evidencia EXPLÍCITA;
 *  · que lo que ve el cliente (`reasons`) no lleve nunca un aviso interno.
 *
 * Funciones puras, sin base de datos.
 *
 * Ejecutar:
 *   npm run test:client-brief
 */
import {
  appliesTo,
  briefFromRow,
  briefGaps,
  buildPreferencesPayload,
  EMPTY_BRIEF,
  profileForOperation,
  validateBrief,
  type BriefInput,
} from "../lib/clients/brief.ts";
import {
  detectPropertyType,
  effectivePrice,
  evaluateMatch,
  exclusionLabel,
  zoneLikePattern,
  type MatchProperty,
} from "../lib/clients/brief-match.ts";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

const brief = (over: Partial<BriefInput>): BriefInput => ({ ...EMPTY_BRIEF, ...over });

const prop = (over: Partial<MatchProperty>): MatchProperty => ({
  zone: "Salamanca",
  subzone: "Recoletos",
  bedrooms: 3,
  bathrooms: 2,
  square_meters: 120,
  price: 2500,
  operation: "rent",
  operations: ["rent"],
  stay: "long",
  property_type: "Piso",
  title: "Piso en Calle de Serrano",
  description: "",
  features: [],
  features_manual: [],
  floor_override: null,
  available_from: null,
  photoCount: 8,
  ...over,
});

const excludedBy = (b: BriefInput, p: MatchProperty) => {
  const r = evaluateMatch(b, p);
  return r.excluded ? r.reason : null;
};
const ok = (b: BriefInput, p: MatchProperty) => {
  const r = evaluateMatch(b, p);
  if (r.excluded) throw new Error(`esperaba que encajara y se descartó por ${r.reason}`);
  return r;
};

// ─── Payload: venta y alquiler no se mezclan ─────────────────────────────────
console.log("\nPayload del encargo");
{
  const sale = buildPreferencesPayload(
    brief({
      operation: "sale",
      stay: "long",
      students: 2,
      workers: 1,
      pets: true,
      petDetails: "perro",
      guarantees: ["guarantor"],
      universities: "UAM",
      furnished: "furnished",
      financing: "mortgage_approved",
      downPayment: 120000,
      purchasePurpose: "primary",
    }),
  );
  check("venta: stay a NULL", sale.stay === null, sale.stay);
  check("venta: sin estudiantes ni trabajadores", sale.students === null && sale.workers === null);
  check("venta: sin mascotas ni avales", sale.pets === false && (sale.guarantees as string[]).length === 0 && sale.pet_details === null);
  check("venta: sin universidades ni amueblado", sale.universities === null && sale.furnished === null);
  check("venta: guarda la financiación", sale.financing === "mortgage_approved" && sale.down_payment === 120000);

  const rent = buildPreferencesPayload(
    brief({
      operation: "rent",
      stay: "short",
      stayMonths: 11,
      financing: "cash",
      downPayment: 10,
      newBuild: "only_new",
      acceptsTenanted: true,
      conditionPref: "move_in",
    }),
  );
  check("alquiler: guarda estancia y meses", rent.stay === "short" && rent.stay_months === 11);
  check(
    "alquiler: nada de venta",
    rent.financing === null && rent.down_payment === null && rent.new_build === null && rent.accepts_tenanted === null && rent.condition_pref === null,
  );

  const junk = buildPreferencesPayload(
    brief({
      mustHave: ["ascensor", "inventado"],
      niceToHave: ["ascensor", "terraza"],
      propertyTypes: ["piso", "castillo"],
      urgency: "mañana",
      zones: [" Salamanca ", "salamanca", ""],
      maxPriceFlexPct: 80,
      minBedrooms: -1,
    }),
  );
  check("solo claves conocidas en imprescindibles", JSON.stringify(junk.must_have) === '["ascensor"]', junk.must_have);
  check("un deseable que ya es imprescindible se cae", JSON.stringify(junk.nice_to_have) === '["terraza"]', junk.nice_to_have);
  check("tipos desconocidos fuera", JSON.stringify(junk.property_types) === '["piso"]');
  check("urgencia fuera de catálogo → NULL", junk.urgency === null);
  check("zonas sin duplicados ni vacíos", JSON.stringify(junk.zones) === '["Salamanca"]', junk.zones);
  check("margen de presupuesto > 50 % → NULL", junk.max_price_flex_pct === null);
  check("número negativo → NULL", junk.min_bedrooms === null);
}

console.log("\nIda y vuelta fila ↔ encargo");
{
  const b = brief({
    operation: "sale",
    propertyTypes: ["atico"],
    zones: ["Chamberí"],
    subzones: ["Almagro"],
    zonesFlexible: true,
    minPrice: 500000,
    maxPrice: 900000,
    maxPriceFlexPct: 10,
    minBedrooms: 3,
    mustHave: ["ascensor", "terraza"],
    niceToHave: ["garaje"],
    orientations: ["Sur"],
    minFloor: 3,
    purchasePurpose: "primary",
    financing: "mortgage_approved",
    downPayment: 300000,
    conditionPref: "move_in",
    newBuild: "only_resale",
    acceptsTenanted: false,
    children: 2,
    occupants: 4,
    urgency: "3m",
    stay: null,
    pets: false,
  });
  const back = briefFromRow(buildPreferencesPayload(b));
  check("el encargo sobrevive al guardado", JSON.stringify(back) === JSON.stringify(b), { b, back });
  check("una fila vacía es el encargo vacío", JSON.stringify(briefFromRow(null)) === JSON.stringify(EMPTY_BRIEF));
}

console.log("\nValidación");
check("presupuesto al revés", !validateBrief(brief({ minPrice: 3000, maxPrice: 2000 })).ok);
check("m² al revés", !validateBrief(brief({ minSquareMeters: 100, maxSquareMeters: 80 })).ok);
check("imprescindible y deseable a la vez", !validateBrief(brief({ mustHave: ["ascensor"], niceToHave: ["ascensor"] })).ok);
check("más estudiantes que ocupantes", !validateBrief(brief({ occupants: 2, students: 3 })).ok);
check("en venta los estudiantes no cuentan", validateBrief(brief({ operation: "sale", occupants: 2, students: 3 })).ok);
check("un encargo normal pasa", validateBrief(brief({ minPrice: 1000, maxPrice: 2000, occupants: 2, students: 1, workers: 1 })).ok);

console.log("\nCampos por operación");
check("estudiantes no aplica en venta", !appliesTo("students", "sale"));
check("estancia no aplica en venta", !appliesTo("stay", "sale"));
check("financiación no aplica en alquiler", !appliesTo("financing", "rent"));
check("zonas aplica en las dos", appliesTo("zones", "rent") && appliesTo("zones", "sale"));
check("un estudiante que pasa a venta deja de serlo", profileForOperation("student", "sale") === "family");
check("un inversor que pasa a alquiler pasa a trabajador", profileForOperation("investor", "rent") === "worker");
check("familia vale en las dos", profileForOperation("family", "rent") === "family");

console.log("\nEncargo incompleto");
{
  const saleGaps = briefGaps(brief({ operation: "sale", zones: ["Retiro"], maxPrice: 600000, minBedrooms: 2 })).map((g) => g.field);
  check("venta pide financiación y finalidad", saleGaps.includes("financing") && saleGaps.includes("purchasePurpose"), saleGaps);
  check("venta no pide amueblado ni ocupantes", !saleGaps.includes("furnished") && !saleGaps.includes("occupants"));
  const rentGaps = briefGaps(brief({ operation: "rent" })).map((g) => g.field);
  check("alquiler sin zona/presupuesto/dormitorios: esenciales", ["zones", "maxPrice", "minBedrooms"].every((f) => rentGaps.includes(f)), rentGaps);
  check("alquiler pide amueblado e ingresos", rentGaps.includes("furnished") && rentGaps.includes("monthlyIncome"));
  check("alquiler no pide financiación", !rentGaps.includes("financing"));
  const mortgage = briefGaps(brief({ operation: "sale", financing: "mortgage_needed" })).map((g) => g.field);
  check("con hipoteca pide el ahorro", mortgage.includes("downPayment"));
  const cash = briefGaps(brief({ operation: "sale", financing: "cash" })).map((g) => g.field);
  check("al contado no pide el ahorro", !cash.includes("downPayment"));
}

// ─── Match ───────────────────────────────────────────────────────────────────
console.log("\nMatch · operación, estancia y precio");
{
  const saleProp = prop({ operation: "sale", operations: ["sale"], stay: null, price: 750000 });
  // El bug original: compradores guardados con stay="long" no recibían nada.
  check(
    "venta con stay heredado SIGUE encajando",
    excludedBy(brief({ operation: "sale", stay: "long", maxPrice: 800000 }), saleProp) === null,
  );
  check("alquiler: estancia distinta se descarta", excludedBy(brief({ stay: "short" }), prop({ stay: "long" })) === "stay");
  check("alquiler: propiedad sin estancia no se descarta", excludedBy(brief({ stay: "short" }), prop({ stay: null })) === null);
  check("otra operación se descarta", excludedBy(brief({ operation: "sale" }), prop({})) === "operation");

  const dual = prop({ operation: "sale", operations: ["sale", "rent"], price: 950000, rent_price: 2200 });
  check("dual: el inquilino compara con rent_price", effectivePrice(dual, "rent") === 2200);
  check("dual: el comprador compara con price", effectivePrice(dual, "sale") === 950000);
  check("dual entra en un alquiler de hasta 2.500 €", excludedBy(brief({ maxPrice: 2500 }), dual) === null);
  check(
    "dual sin rent_price no entra en un alquiler con presupuesto",
    excludedBy(brief({ maxPrice: 2500 }), prop({ operation: "sale", operations: ["sale", "rent"], price: 950000, rent_price: null })) === "price",
  );

  check("por encima del máximo se descarta", excludedBy(brief({ maxPrice: 2000 }), prop({ price: 2500 })) === "price");
  check("por debajo del mínimo se descarta", excludedBy(brief({ minPrice: 3000 }), prop({ price: 2500 })) === "price");
  const flex = ok(brief({ maxPrice: 2300, maxPriceFlexPct: 10 }), prop({ price: 2500 }));
  check("con margen del 10 % entra, con aviso", flex.warnings.some((w) => w.startsWith("Supera el presupuesto")), flex.warnings);
  check("el aviso de presupuesto no llega al cliente", !flex.reasons.some((r) => r.includes("presupuesto") && r.includes("Supera")));
}

console.log("\nMatch · zonas");
{
  check("zona distinta se descarta", excludedBy(brief({ zones: ["Chamberí"] }), prop({})) === "zone");
  const flexible = ok(brief({ zones: ["Chamberí"], zonesFlexible: true }), prop({}));
  check("abierto a otras zonas: entra con aviso", flexible.warnings.some((w) => w.includes("Fuera de sus zonas")));
  const barrio = ok(brief({ zones: ["Salamanca"], subzones: ["Goya"] }), prop({}));
  check("zona sí, barrio no: entra con aviso", barrio.warnings.some((w) => w.includes("barrios")), barrio.warnings);
  check("y la razón dice dónde está", barrio.reasons[0] === "En Salamanca · Recoletos", barrio.reasons);
  check("barrio guardado en `zones` (encargos viejos) casa con la subzona", excludedBy(brief({ zones: ["Recoletos"] }), prop({})) === null);
  check("sin tildes ni mayúsculas", excludedBy(brief({ zones: ["chamberi"] }), prop({ zone: "Chamberí", subzone: null })) === null);
  // El prefiltro SQL (ilike) tiene que dejar pasar lo mismo que el match.
  check("patrón SQL ignora tildes", zoneLikePattern("Chamberí") === "ch_mb_r_" && zoneLikePattern("chamberi") === "ch_mb_r_");
  check("patrón SQL con espacios", zoneLikePattern(" Ríos Rosas ") === "r__s r_s_s");
  check("patrón SQL sin comodines ni comillas colados", zoneLikePattern('50%_*"x\\') === "50x");
}

console.log("\nMatch · tamaño y tipo");
{
  check("menos dormitorios de los pedidos", excludedBy(brief({ minBedrooms: 4 }), prop({})) === "bedrooms");
  check("más dormitorios del máximo", excludedBy(brief({ maxBedrooms: 2 }), prop({})) === "bedrooms");
  const noBaths = ok(brief({ minBathrooms: 2 }), prop({ bathrooms: 0 }));
  check("baños = 0 es 'sin dato', no descarte", noBaths.warnings.includes("Baños sin dato"));
  check("1 baño para quien pide 2", excludedBy(brief({ minBathrooms: 2 }), prop({ bathrooms: 1 })) === "bathrooms");
  const close = ok(brief({ minSquareMeters: 80 }), prop({ square_meters: 78 }));
  check("78 m² para quien pide 80: entra con aviso", close.warnings.some((w) => w.includes("78 m²")), close.warnings);
  check("70 m² para quien pide 80: fuera", excludedBy(brief({ minSquareMeters: 80 }), prop({ square_meters: 70 })) === "area");
  check("m² sin dato: aviso", ok(brief({ minSquareMeters: 80 }), prop({ square_meters: null })).warnings.includes("Superficie sin dato"));

  check("'Ático en …' con property_type 'Piso' es ático", detectPropertyType(prop({ title: "Ático en Calle Serrano" })) === "atico");
  check("'Piso en Casa de Campo' no es una casa", detectPropertyType(prop({ property_type: null, title: "Piso en Casa de Campo" })) === "piso");
  check("'Casa / Chalet' es chalet", detectPropertyType(prop({ property_type: "Casa / Chalet" })) === "chalet");
  check("'Bajo' es un piso", detectPropertyType(prop({ property_type: "Bajo", title: "" })) === "piso");
  check("quien pide piso acepta un ático", excludedBy(brief({ propertyTypes: ["piso"] }), prop({ title: "Ático en Velázquez" })) === null);
  check("quien pide ático no quiere un piso cualquiera", excludedBy(brief({ propertyTypes: ["atico"] }), prop({})) === "type");
  check("quien pide chalet no quiere un piso", excludedBy(brief({ propertyTypes: ["chalet"] }), prop({})) === "type");
  check(
    "tipo desconocido: entra con aviso",
    ok(brief({ propertyTypes: ["piso"] }), prop({ property_type: null, title: "Oportunidad única" })).warnings.includes("Tipo de vivienda sin confirmar"),
  );
}

console.log("\nMatch · imprescindibles (solo evidencia explícita descarta)");
{
  const b = brief({ mustHave: ["ascensor"] });
  check("'sin ascensor' en features descarta", excludedBy(b, prop({ features: ["Planta 3ª exterior sin ascensor"] })) === "must:ascensor");
  check("'sin ascensor' en la descripción descarta", excludedBy(b, prop({ description: "Finca clásica sin ascensor." })) === "must:ascensor");
  const yes = ok(b, prop({ features: ["Ascensor"] }));
  check("con ascensor: razón visible", yes.reasons.includes("Ascensor"));
  const unknown = ok(b, prop({}));
  check("sin mención: entra y se pide confirmar", unknown.warnings.includes("Confirmar: ascensor"), unknown.warnings);

  const ext = brief({ mustHave: ["exterior"] });
  check("'Interior' descarta a quien exige exterior", excludedBy(ext, prop({ features: ["3ª interior"] })) === "must:exterior");
  check("'Patio interior' no lo convierte en interior", excludedBy(ext, prop({ features: ["Patio interior", "Exterior"] })) === null);
  check("'diseño interior' en la descripción no descarta", excludedBy(ext, prop({ description: "Cuidado diseño interior." })) === null);

  check("descartes con etiqueta legible", exclusionLabel("must:ascensor") === "Sin ascensor" && exclusionLabel("floor") === "Planta");
}

console.log("\nMatch · planta");
{
  const b = brief({ minFloor: 2 });
  check("bajo para quien pide 2ª+", excludedBy(b, prop({ features: ["Bajo"] })) === "floor");
  check("1ª para quien pide 2ª+", excludedBy(b, prop({ features: ["Planta 1ª exterior"] })) === "floor");
  check("override 'atico' siempre cumple", excludedBy(b, prop({ floor_override: "atico" })) === null);
  check("un chalet no tiene planta", excludedBy(b, prop({ property_type: "Chalet", features: ["Bajo"] })) === null);
  check("planta sin dato: aviso", ok(b, prop({})).warnings.some((w) => w.startsWith("Planta sin dato")));
  check("4ª: razón visible", ok(b, prop({ features: ["Planta 4ª"] })).reasons.includes("Planta 4ª"));
}

console.log("\nMatch · solo alquiler");
{
  check("quiere amueblado y es 'sin amueblar'", excludedBy(brief({ furnished: "furnished" }), prop({ description: "Se alquila sin amueblar." })) === "furnished");
  check("quiere amueblado y lo está: razón", ok(brief({ furnished: "furnished" }), prop({ features: ["Amueblado"] })).reasons.includes("Amueblado"));
  const unf = ok(brief({ furnished: "unfurnished" }), prop({ features: ["Amueblado"] }));
  check("lo quiere sin amueblar y está amueblado: aviso, no descarte", unf.warnings.some((w) => w.includes("amueblado")));
  check("mascotas: 'No se admiten mascotas' descarta", excludedBy(brief({ pets: true }), prop({ description: "No se admiten mascotas." })) === "pets");
  check("mascotas: 'Se admiten mascotas' es razón", ok(brief({ pets: true }), prop({ features: ["Se admiten mascotas"] })).reasons.includes("Admite mascotas"));
  check("mascotas sin dato: confirmar", ok(brief({ pets: true }), prop({})).warnings.some((w) => w.includes("mascotas")));
  const income = ok(brief({ monthlyIncome: 6000 }), prop({ price: 2500 }));
  check("renta > 1/3 de ingresos: aviso", income.warnings.some((w) => w.includes("1/3")), income.warnings);
  check("renta ≤ 1/3: sin aviso", !ok(brief({ monthlyIncome: 9000 }), prop({ price: 2500 })).warnings.some((w) => w.includes("1/3")));
  const sharing = ok(brief({ occupants: 4, students: 4 }), prop({ bedrooms: 3 }));
  check("4 estudiantes en 3 dormitorios: aviso", sharing.warnings.some((w) => w.includes("comparten")), sharing.warnings);
}

console.log("\nMatch · solo venta");
{
  const s = (over: Partial<MatchProperty>) => prop({ operation: "sale", operations: ["sale"], stay: null, price: 600000, ...over });
  check("solo obra nueva: sin mención se descarta", excludedBy(brief({ operation: "sale", newBuild: "only_new" }), s({})) === "new_build");
  check("solo obra nueva: 'Obra nueva' entra", ok(brief({ operation: "sale", newBuild: "only_new" }), s({ features: ["Obra nueva"] })).reasons.includes("Obra nueva"));
  check("solo segunda mano: obra nueva fuera", excludedBy(brief({ operation: "sale", newBuild: "only_resale" }), s({ features: ["Obra nueva"] })) === "new_build");
  check("para entrar a vivir: 'para reformar' fuera", excludedBy(brief({ operation: "sale", conditionPref: "move_in" }), s({ title: "Piso para reformar en Retiro" })) === "condition");
  check("busca para reformar: lo agradece", ok(brief({ operation: "sale", conditionPref: "to_renovate" }), s({ features: ["A reformar"] })).reasons.includes("Para reformar"));
  check("no acepta inquilino: 'con inquilino' fuera", excludedBy(brief({ operation: "sale", acceptsTenanted: false }), s({ description: "Se vende con inquilino." })) === "tenanted");
  check("acepta inquilino: entra con aviso", ok(brief({ operation: "sale", acceptsTenanted: true }), s({ description: "Se vende con inquilino." })).warnings.some((w) => w.includes("inquilino")));
  const lowSavings = ok(brief({ operation: "sale", financing: "mortgage_needed", downPayment: 50000 }), s({}));
  check("ahorro < 30 % con hipoteca: aviso", lowSavings.warnings.some((w) => w.includes("30 %")), lowSavings.warnings);
  check("al contado: sin aviso de ahorro", !ok(brief({ operation: "sale", financing: "cash", downPayment: 50000 }), s({})).warnings.some((w) => w.includes("30 %")));
  const payment = ok(brief({ operation: "sale", financing: "mortgage_approved", downPayment: 200000, monthlyIncome: 3000 }), s({}));
  check("cuota > 35 % de ingresos: aviso", payment.warnings.some((w) => w.includes("Cuota estimada")), payment.warnings);
}

console.log("\nMatch · orientación, puntuación y lo que ve el cliente");
{
  check("'Orientación sur' en features", ok(brief({ orientations: ["Sur"] }), prop({ features: ["Orientación sur"] })).reasons.includes("Orientación sur"));
  check(
    "'este piso' en la descripción no es orientación este",
    !ok(brief({ orientations: ["Este"] }), prop({ description: "Este piso tiene orientación sur." })).reasons.some((r) => r.startsWith("Orientación")),
  );
  const ideal = ok(
    brief({
      zones: ["Salamanca"],
      subzones: ["Recoletos"],
      minPrice: 2000,
      maxPrice: 3000,
      minBedrooms: 3,
      minBathrooms: 2,
      minSquareMeters: 100,
      propertyTypes: ["piso"],
      mustHave: ["ascensor", "exterior"],
      niceToHave: ["terraza"],
      furnished: "furnished",
      orientations: ["Sur"],
    }),
    prop({ features: ["Ascensor", "Exterior", "Terraza", "Amueblado", "Orientación sur"] }),
  );
  check("la propiedad ideal puntúa ≥ 95", ideal.score >= 95, ideal.score);
  const meh = ok(
    brief({ zones: ["Salamanca"], subzones: ["Goya"], maxPrice: 2300, maxPriceFlexPct: 10, mustHave: ["ascensor"] }),
    prop({}),
  );
  check("una que encaja a medias puntúa menos", meh.score < ideal.score - 20, { meh: meh.score, ideal: ideal.score });
  check("un encargo vacío da un neutro (50), no un 100 engañoso", ok(brief({}), prop({})).score === 50);

  const forbidden = /confirmar|supera|sin dato|ingresos|ahorro|cuota|inquilino|fuera de/i;
  const all = [ideal, meh, ok(brief({ monthlyIncome: 3000, pets: true, minFloor: 3 }), prop({}))];
  check(
    "las razones (las ve el cliente) nunca llevan avisos internos",
    all.every((r) => r.reasons.every((x) => !forbidden.test(x))),
    all.map((r) => r.reasons),
  );
}

console.log(failures ? `\n✗ ${failures} fallo(s)` : "\n✓ Todo en verde");
process.exit(failures ? 1 : 0);
