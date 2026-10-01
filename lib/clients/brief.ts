// ============================================================================
// EL ENCARGO DEL CLIENTE: un único catálogo para crearlo, editarlo, enseñarlo
// y cruzarlo con las propiedades.
//
// Hasta 2026-10-01 había TRES editores con campos distintos: "Nuevo cliente"
// (con un "Sector" que no se guardaba en ningún sitio y la estancia corta o
// larga también en venta), "El encargo del cliente" en la ficha y el panel
// lateral del listado. Lo que preguntaba uno no lo preguntaba el otro, y el
// match no usaba casi nada de lo que se preguntaba.
//
// Aquí vive todo lo que define un campo del encargo:
//  · qué opciones tiene y cómo se llaman en pantalla;
//  · a qué operación aplica. En venta no hay estudiantes, ni estancia, ni
//    avales; en alquiler no hay hipoteca, ni obra nueva, ni "acepta inquilino".
//    `buildPreferencesPayload` pone a NULL lo que no aplica, para que cambiar
//    de alquiler a venta no deje datos fantasma que el match sí miraría;
//  · cómo se reconoce en el texto libre de una propiedad, porque `features`,
//    `features_manual` y `property_type` son texto libre del portal o del
//    agente, no códigos.
//
// Puro y sin dependencias de servidor: lo usan el formulario (Client
// Component), las server actions y el matcher.
// ============================================================================

export type BriefOperation = "rent" | "sale";

export type Option<K extends string = string> = { key: K; label: string };

// ─── Perfil ──────────────────────────────────────────────────────────────────
// El perfil sigue siendo una etiqueta (`client_tags`, ver
// lib/clients/display.ts). Lo que cambia según la operación es qué perfiles
// tienen sentido: nadie compra un piso "como estudiante".

export type BriefProfile = "student" | "worker" | "family" | "company" | "investor";

export const PROFILE_TAG: Record<BriefProfile, string> = {
  student: "Estudiante",
  worker: "Trabajador",
  family: "Familia",
  company: "Empresa",
  investor: "Inversor",
};

export const PROFILES_BY_OPERATION: Record<BriefOperation, Option<BriefProfile>[]> = {
  rent: [
    { key: "worker", label: "Trabajador" },
    { key: "student", label: "Estudiante" },
    { key: "family", label: "Familia" },
    { key: "company", label: "Empresa" },
  ],
  sale: [
    { key: "family", label: "Familia" },
    { key: "worker", label: "Trabajador" },
    { key: "investor", label: "Inversor" },
    { key: "company", label: "Empresa" },
  ],
};

/** El perfil por defecto al cambiar de operación si el actual no aplica. */
export function profileForOperation(
  profile: BriefProfile | null,
  operation: BriefOperation,
): BriefProfile {
  const allowed = PROFILES_BY_OPERATION[operation].map((p) => p.key);
  if (profile && allowed.includes(profile)) return profile;
  return operation === "sale" ? "family" : "worker";
}

// ─── Tipo de vivienda ────────────────────────────────────────────────────────

export type PropertyTypeKey = "piso" | "atico" | "duplex" | "estudio" | "chalet";

export const PROPERTY_TYPES: Option<PropertyTypeKey>[] = [
  { key: "piso", label: "Piso" },
  { key: "atico", label: "Ático" },
  { key: "duplex", label: "Dúplex" },
  { key: "estudio", label: "Estudio / loft" },
  { key: "chalet", label: "Chalet / casa" },
];

/**
 * Qué tipos de propiedad acepta cada tipo pedido. "Piso" es el genérico: quien
 * pide piso acepta un ático, un dúplex o un bajo (que es un piso en planta 0).
 * Quien pide "Ático" pide ESO, y no un piso cualquiera.
 */
export const TYPE_ACCEPTS: Record<PropertyTypeKey, PropertyTypeKey[]> = {
  piso: ["piso", "atico", "duplex"],
  atico: ["atico"],
  duplex: ["duplex"],
  estudio: ["estudio"],
  chalet: ["chalet"],
};

// ─── Características: Da igual / Deseable / Imprescindible ──────────────────
//
// `pos` reconoce la característica en el texto. `neg` es la negación EXPLÍCITA
// ("sin ascensor"): solo una negación explícita descarta una propiedad para un
// cliente que la tiene como imprescindible. Que no se mencione NO la descarta
// —la mitad de las fichas no lista el ascensor aunque lo tenga—, se avisa al
// agente para que lo confirme.
//
// `negShort` solo se aplica a los atributos cortos (features), no a la
// descripción: "interior" como atributo es "piso interior", pero en una
// descripción aparece en "diseño interior" o "patio interior".

export type FeatureKey =
  | "ascensor"
  | "exterior"
  | "luminoso"
  | "terraza"
  | "balcon"
  | "garaje"
  | "trastero"
  | "piscina"
  | "jardin"
  | "aire"
  | "calefaccion"
  | "portero"
  | "armarios"
  | "cocina"
  | "zona_comunitaria"
  | "gimnasio"
  | "accesible"
  | "vistas";

export type FeatureDef = Option<FeatureKey> & {
  pos: RegExp;
  neg?: RegExp;
  negShort?: RegExp;
};

// Todas las regex trabajan sobre texto en minúsculas y sin tildes (`fold`).
export const FEATURES: FeatureDef[] = [
  {
    key: "ascensor",
    label: "Ascensor",
    pos: /\b(con\s+)?ascensor(es)?\b|\belevator\b|\blift\b/,
    neg: /\bsin\s+ascensor\b|\bno\s+(tiene|hay|dispone\s+de)\s+ascensor\b/,
  },
  {
    key: "exterior",
    label: "Exterior",
    pos: /\bexterior(es)?\b/,
    neg: /\b(piso|vivienda|apartamento|estudio)\s+interior\b/,
    negShort: /(?<!patio\s)(?<!diseno\s)\binterior\b/,
  },
  {
    key: "luminoso",
    label: "Luminoso",
    pos: /\bluminos[oa]s?\b|\bmucha\s+luz\b|\bluz\s+natural\b|\bbright\b/,
  },
  {
    key: "terraza",
    label: "Terraza",
    pos: /\bterrazas?\b|\bterrace\b/,
    neg: /\bsin\s+terraza\b/,
  },
  { key: "balcon", label: "Balcón", pos: /\bbalcon(es)?\b|\bbalcony\b/ },
  {
    key: "garaje",
    label: "Garaje",
    pos: /\bgaraje\b|\bparking\b|\bplaza\s+de\s+(garaje|aparcamiento)\b|\bcochera\b/,
    neg: /\bsin\s+(garaje|parking|plaza\s+de\s+garaje)\b/,
  },
  {
    key: "trastero",
    label: "Trastero",
    pos: /\btrasteros?\b|\bstorage\s+room\b/,
    neg: /\bsin\s+trastero\b/,
  },
  { key: "piscina", label: "Piscina", pos: /\bpiscinas?\b|\bpool\b/, neg: /\bsin\s+piscina\b/ },
  { key: "jardin", label: "Jardín", pos: /\bjardin(es)?\b|\bgarden\b/ },
  {
    key: "aire",
    label: "Aire acondicionado",
    pos: /\baire\s+acondicionado\b|\bclimatizacion\b|\bbomba\s+de\s+calor\b|\bair\s+conditioning\b/,
    neg: /\bsin\s+aire\s+acondicionado\b/,
  },
  {
    key: "calefaccion",
    label: "Calefacción",
    pos: /\bcalefaccion\b|\bsuelo\s+radiante\b|\bheating\b/,
    neg: /\bsin\s+calefaccion\b/,
  },
  {
    key: "portero",
    label: "Portero / conserje",
    pos: /\bportero\b|\bconserje(ria)?\b|\bporteria\b|\bdoorman\b/,
    neg: /\bsin\s+portero\b/,
  },
  { key: "armarios", label: "Armarios empotrados", pos: /\barmarios?\s+empotrados?\b|\bvestidor\b/ },
  {
    key: "cocina",
    label: "Cocina equipada",
    pos: /\bcocina\s+(equipada|amueblada|amoblada)\b|\bequippedkitchen\b|\bequipped\s+kitchen\b/,
  },
  {
    key: "zona_comunitaria",
    label: "Zonas comunes",
    pos: /\bzonas?\s+comun(es|itarias?)\b|\burbanizacion\s+privada\b/,
  },
  { key: "gimnasio", label: "Gimnasio", pos: /\bgimnasio\b|\bgym\b/ },
  {
    key: "accesible",
    label: "Accesible / sin barreras",
    pos: /\baccesible\b|\badaptad[oa]\b|\bsilla\s+de\s+ruedas\b|\bsin\s+barreras\b/,
  },
  { key: "vistas", label: "Vistas", pos: /\bvistas\b|\bviews\b/ },
];

export const FEATURE_LABEL: Record<FeatureKey, string> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f.label]),
) as Record<FeatureKey, string>;

export const ORIENTATIONS: Option[] = [
  { key: "Sur", label: "Sur" },
  { key: "Este", label: "Este" },
  { key: "Oeste", label: "Oeste" },
  { key: "Norte", label: "Norte" },
];

// ─── Campos con opciones cerradas ────────────────────────────────────────────

export const URGENCY: Option[] = [
  { key: "now", label: "Inmediata" },
  { key: "1m", label: "En un mes" },
  { key: "3m", label: "1 a 3 meses" },
  { key: "6m", label: "3 a 6 meses" },
  { key: "browsing", label: "Sin prisa / mirando" },
];

export const FURNISHED: Option[] = [
  { key: "furnished", label: "Amueblado" },
  { key: "unfurnished", label: "Sin amueblar" },
];

export const EMPLOYMENT: Option[] = [
  { key: "permanent", label: "Contrato indefinido" },
  { key: "temporary", label: "Contrato temporal" },
  { key: "self_employed", label: "Autónomo" },
  { key: "civil_servant", label: "Funcionario" },
  { key: "student", label: "Estudiante" },
  { key: "retired", label: "Jubilado" },
  { key: "company", label: "Lo paga la empresa" },
  { key: "foreign_income", label: "Ingresos del extranjero" },
];

export const GUARANTEES: Option[] = [
  { key: "bank_guarantee", label: "Aval bancario" },
  { key: "guarantor", label: "Avalista (familiar)" },
  { key: "rent_insurance", label: "Seguro de impago" },
  { key: "extra_deposit", label: "Fianza adicional" },
  { key: "prepay", label: "Pago por adelantado" },
  { key: "company_contract", label: "Contrato a nombre de empresa" },
];

export const PURCHASE_PURPOSE: Option[] = [
  { key: "primary", label: "Vivienda habitual" },
  { key: "second", label: "Segunda residencia" },
  { key: "investment_rent", label: "Inversión para alquilar" },
  { key: "investment_flip", label: "Inversión para reformar y vender" },
];

export const FINANCING: Option[] = [
  { key: "cash", label: "Al contado" },
  { key: "mortgage_approved", label: "Hipoteca aprobada" },
  { key: "mortgage_in_progress", label: "Hipoteca en trámite" },
  { key: "mortgage_needed", label: "Necesita hipoteca" },
  { key: "sell_to_buy", label: "Tiene que vender para comprar" },
];

/** Financiaciones que dependen de un banco: ahí el ahorro aportado importa. */
export const MORTGAGE_FINANCING = new Set([
  "mortgage_approved",
  "mortgage_in_progress",
  "mortgage_needed",
]);

export const CONDITION_PREF: Option[] = [
  { key: "move_in", label: "Para entrar a vivir" },
  { key: "renovated", label: "Reformado" },
  { key: "to_renovate", label: "Busca para reformar" },
];

export const NEW_BUILD: Option[] = [
  { key: "only_new", label: "Solo obra nueva" },
  { key: "only_resale", label: "Solo segunda mano" },
];

export const STAY: Option<"short" | "long">[] = [
  { key: "long", label: "Larga (vivienda habitual)" },
  { key: "short", label: "Temporada / corta" },
];

export const labelOf = (options: Option[], key: string | null | undefined): string | null =>
  key ? (options.find((o) => o.key === key)?.label ?? key) : null;

// ─── El encargo como lo maneja el formulario ─────────────────────────────────

export type BriefInput = {
  operation: BriefOperation;
  propertyTypes: string[];
  zones: string[];
  subzones: string[];
  zonesFlexible: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  maxPriceFlexPct: number | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  minBathrooms: number | null;
  minSquareMeters: number | null;
  maxSquareMeters: number | null;
  minFloor: number | null;
  orientations: string[];
  mustHave: string[];
  niceToHave: string[];
  availableFrom: string | null;
  urgency: string | null;
  occupants: number | null;
  children: number | null;
  monthlyIncome: number | null;
  employment: string | null;
  dealbreakers: string | null;
  viewingAvailability: string | null;
  notes: string | null;
  // Solo alquiler
  stay: "short" | "long" | null;
  stayMonths: number | null;
  furnished: string | null;
  students: number | null;
  workers: number | null;
  universities: string | null;
  pets: boolean;
  petDetails: string | null;
  guarantees: string[];
  // Solo venta
  purchasePurpose: string | null;
  financing: string | null;
  downPayment: number | null;
  conditionPref: string | null;
  newBuild: string | null;
  acceptsTenanted: boolean | null;
};

export const EMPTY_BRIEF: BriefInput = {
  operation: "rent",
  propertyTypes: [],
  zones: [],
  subzones: [],
  zonesFlexible: false,
  minPrice: null,
  maxPrice: null,
  maxPriceFlexPct: null,
  minBedrooms: null,
  maxBedrooms: null,
  minBathrooms: null,
  minSquareMeters: null,
  maxSquareMeters: null,
  minFloor: null,
  orientations: [],
  mustHave: [],
  niceToHave: [],
  availableFrom: null,
  urgency: null,
  occupants: null,
  children: null,
  monthlyIncome: null,
  employment: null,
  dealbreakers: null,
  viewingAvailability: null,
  notes: null,
  stay: "long",
  stayMonths: null,
  furnished: null,
  students: null,
  workers: null,
  universities: null,
  pets: false,
  petDetails: null,
  guarantees: [],
  purchasePurpose: null,
  financing: null,
  downPayment: null,
  conditionPref: null,
  newBuild: null,
  acceptsTenanted: null,
};

/**
 * Campos que solo existen en una de las dos operaciones. El formulario no los
 * pinta en la otra y `buildPreferencesPayload` los guarda como NULL.
 */
export const RENT_ONLY: ReadonlyArray<keyof BriefInput> = [
  "stay",
  "stayMonths",
  "furnished",
  "students",
  "workers",
  "universities",
  "pets",
  "petDetails",
  "guarantees",
];

export const SALE_ONLY: ReadonlyArray<keyof BriefInput> = [
  "purchasePurpose",
  "financing",
  "downPayment",
  "conditionPref",
  "newBuild",
  "acceptsTenanted",
];

export function appliesTo(field: keyof BriefInput, operation: BriefOperation): boolean {
  if (operation === "rent") return !SALE_ONLY.includes(field);
  return !RENT_ONLY.includes(field);
}

// ─── Lectura y escritura de `client_preferences` ─────────────────────────────

const keysOf = (options: Option[]) => new Set(options.map((o) => o.key));
const FEATURE_KEYS = keysOf(FEATURES);
const TYPE_KEYS = keysOf(PROPERTY_TYPES);
const GUARANTEE_KEYS = keysOf(GUARANTEES);
const ORIENTATION_KEYS = keysOf(ORIENTATIONS);

const pick = (options: Option[], v: string | null | undefined): string | null =>
  v && options.some((o) => o.key === v) ? v : null;

const cleanList = (v: string[] | null | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v ?? []) {
    const s = raw.trim();
    const k = s.toLowerCase();
    if (s && !seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
};

const onlyKeys = (v: string[] | null | undefined, allowed: Set<string>): string[] =>
  cleanList(v).filter((k) => allowed.has(k));

/** Un número válido y no negativo, o NULL. Un campo vacío es "no lo sé", no un cero. */
const num = (v: number | null | undefined, max = Number.MAX_SAFE_INTEGER): number | null =>
  v === null || v === undefined || !Number.isFinite(v) || v < 0 || v > max ? null : v;

const int = (v: number | null | undefined, max?: number): number | null => {
  const n = num(v, max);
  return n === null ? null : Math.round(n);
};

const text = (v: string | null | undefined): string | null => v?.trim() || null;

export type BriefValidation = { ok: true } | { ok: false; error: string };

/** Lo que no tiene sentido guardar. El resto de combinaciones se admite. */
export function validateBrief(b: BriefInput): BriefValidation {
  const pairs: Array<[number | null, number | null, string]> = [
    [b.minPrice, b.maxPrice, "El presupuesto mínimo no puede superar al máximo."],
    [b.minBedrooms, b.maxBedrooms, "Los dormitorios mínimos no pueden superar a los máximos."],
    [b.minSquareMeters, b.maxSquareMeters, "Los m² mínimos no pueden superar a los máximos."],
  ];
  for (const [min, max, error] of pairs) {
    if (min !== null && max !== null && min > max) return { ok: false, error };
  }
  const both = b.mustHave.filter((k) => b.niceToHave.includes(k));
  if (both.length) {
    return {
      ok: false,
      error: `"${FEATURE_LABEL[both[0] as FeatureKey] ?? both[0]}" no puede ser imprescindible y deseable a la vez.`,
    };
  }
  if (b.operation === "rent" && b.students !== null && b.occupants !== null) {
    if (b.students + (b.workers ?? 0) > b.occupants) {
      return { ok: false, error: "Estudiantes + trabajadores no pueden ser más que los ocupantes." };
    }
  }
  return { ok: true };
}

/**
 * El encargo → columnas de `client_preferences`. Lo usan TANTO "Nuevo cliente"
 * como "El encargo del cliente": si un campo se añade, se añade aquí y los dos
 * lo guardan igual.
 *
 * Lo que no aplica a la operación va como NULL (o vacío). Es deliberado: un
 * cliente que pasa de alquiler a venta no debe arrastrar "2 estudiantes" ni
 * "estancia larga" —el match de antes filtraba por `stay` también en venta, y
 * por eso a ningún comprador le salía una sola propiedad sugerida—.
 *
 * No toca las columnas chilenas ni las de avisos: no son del encargo de
 * España y quien las escribe es otro.
 */
export function buildPreferencesPayload(b: BriefInput): Record<string, unknown> {
  const rent = b.operation === "rent";
  const sale = !rent;
  const mustHave = onlyKeys(b.mustHave, FEATURE_KEYS);
  return {
    operation: b.operation,
    property_types: onlyKeys(b.propertyTypes, TYPE_KEYS),
    zones: cleanList(b.zones),
    subzones: cleanList(b.subzones),
    zones_flexible: b.zonesFlexible,
    min_price: num(b.minPrice),
    max_price: num(b.maxPrice),
    max_price_flex_pct: int(b.maxPriceFlexPct, 50),
    min_bedrooms: int(b.minBedrooms, 20),
    max_bedrooms: int(b.maxBedrooms, 20),
    min_bathrooms: int(b.minBathrooms, 20),
    min_square_meters: int(b.minSquareMeters, 100000),
    max_square_meters: int(b.maxSquareMeters, 100000),
    min_floor: int(b.minFloor, 40),
    preferred_orientations: onlyKeys(b.orientations, ORIENTATION_KEYS),
    must_have: mustHave,
    nice_to_have: onlyKeys(b.niceToHave, FEATURE_KEYS).filter((k) => !mustHave.includes(k)),
    available_from: b.availableFrom || null,
    urgency: pick(URGENCY, b.urgency),
    occupants: int(b.occupants, 50),
    children: int(b.children, 20),
    monthly_income: num(b.monthlyIncome),
    employment: pick(EMPLOYMENT, b.employment),
    dealbreakers: text(b.dealbreakers),
    viewing_availability: text(b.viewingAvailability),
    notes: text(b.notes),
    // Alquiler
    stay: rent ? (b.stay === "short" ? "short" : "long") : null,
    stay_months: rent ? int(b.stayMonths, 120) : null,
    furnished: rent ? pick(FURNISHED, b.furnished) : null,
    students: rent ? int(b.students, 50) : null,
    workers: rent ? int(b.workers, 50) : null,
    universities: rent ? text(b.universities) : null,
    pets: rent ? b.pets : false,
    pet_details: rent && b.pets ? text(b.petDetails) : null,
    guarantees: rent ? onlyKeys(b.guarantees, GUARANTEE_KEYS) : [],
    // Venta
    purchase_purpose: sale ? pick(PURCHASE_PURPOSE, b.purchasePurpose) : null,
    financing: sale ? pick(FINANCING, b.financing) : null,
    down_payment: sale ? num(b.downPayment) : null,
    condition_pref: sale ? pick(CONDITION_PREF, b.conditionPref) : null,
    new_build: sale ? pick(NEW_BUILD, b.newBuild) : null,
    accepts_tenanted: sale ? b.acceptsTenanted : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const n = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Una fila de `client_preferences` → el encargo. Acepta filas viejas (sin las
 * columnas de 0170) y las que escribió "Nuevo cliente" antes de esta fecha,
 * que metía las subzonas dentro de `zones`.
 */
export function briefFromRow(r: Row | null | undefined): BriefInput {
  if (!r) return { ...EMPTY_BRIEF };
  return {
    operation: r.operation === "sale" ? "sale" : "rent",
    propertyTypes: arr(r.property_types),
    zones: arr(r.zones),
    subzones: arr(r.subzones),
    zonesFlexible: r.zones_flexible === true,
    minPrice: n(r.min_price),
    maxPrice: n(r.max_price),
    maxPriceFlexPct: n(r.max_price_flex_pct),
    minBedrooms: n(r.min_bedrooms),
    maxBedrooms: n(r.max_bedrooms),
    minBathrooms: n(r.min_bathrooms),
    minSquareMeters: n(r.min_square_meters),
    maxSquareMeters: n(r.max_square_meters),
    minFloor: n(r.min_floor),
    orientations: arr(r.preferred_orientations),
    mustHave: arr(r.must_have),
    niceToHave: arr(r.nice_to_have),
    availableFrom: s(r.available_from),
    urgency: s(r.urgency),
    occupants: n(r.occupants),
    children: n(r.children),
    monthlyIncome: n(r.monthly_income),
    employment: s(r.employment),
    dealbreakers: s(r.dealbreakers),
    viewingAvailability: s(r.viewing_availability),
    notes: s(r.notes),
    stay: r.stay === "short" ? "short" : r.stay === "long" ? "long" : null,
    stayMonths: n(r.stay_months),
    furnished: s(r.furnished),
    students: n(r.students),
    workers: n(r.workers),
    universities: s(r.universities),
    pets: r.pets === true,
    petDetails: s(r.pet_details),
    guarantees: arr(r.guarantees),
    purchasePurpose: s(r.purchase_purpose),
    financing: s(r.financing),
    downPayment: n(r.down_payment),
    conditionPref: s(r.condition_pref),
    newBuild: s(r.new_build),
    acceptsTenanted: typeof r.accepts_tenanted === "boolean" ? r.accepts_tenanted : null,
  };
}

// ─── ¿Está completo? ─────────────────────────────────────────────────────────
//
// Lo que necesita el match para no fallar en silencio, y lo que necesita el
// agente para no tener que volver a llamar. Separado en dos niveles: sin lo
// "esencial" las sugerencias salen a ciegas; lo "recomendable" es lo que se
// suele olvidar y luego cuesta una visita.

export type BriefGap = { field: string; label: string; level: "essential" | "recommended" };

export function briefGaps(b: BriefInput): BriefGap[] {
  const gaps: BriefGap[] = [];
  const add = (field: string, label: string, level: BriefGap["level"]) =>
    gaps.push({ field, label, level });

  if (b.zones.length === 0 && b.subzones.length === 0) add("zones", "Zonas", "essential");
  if (b.maxPrice === null) add("maxPrice", "Presupuesto máximo", "essential");
  if (b.minBedrooms === null) add("minBedrooms", "Dormitorios", "essential");
  if (b.propertyTypes.length === 0) add("propertyTypes", "Tipo de vivienda", "recommended");
  if (b.urgency === null && b.availableFrom === null) add("urgency", "Cuándo", "recommended");

  if (b.operation === "rent") {
    if (b.occupants === null) add("occupants", "Ocupantes", "recommended");
    if (b.furnished === null) add("furnished", "Amueblado o no", "recommended");
    if (b.monthlyIncome === null && b.guarantees.length === 0) {
      add("monthlyIncome", "Ingresos o garantías", "recommended");
    }
    if (b.stay === "short" && b.stayMonths === null) add("stayMonths", "Meses de estancia", "recommended");
  } else {
    if (b.purchasePurpose === null) add("purchasePurpose", "Finalidad de la compra", "recommended");
    if (b.financing === null) add("financing", "Financiación", "recommended");
    if (b.financing && MORTGAGE_FINANCING.has(b.financing) && b.downPayment === null) {
      add("downPayment", "Ahorro aportado", "recommended");
    }
    if (b.conditionPref === null) add("conditionPref", "Estado de la vivienda", "recommended");
  }
  return gaps;
}
