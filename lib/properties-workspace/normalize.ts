// ============================================================================
// PROPERTIES WORKSPACE · normalización determinista
//
// El vocabulario crudo viene del scraper y es un vertedero medido: 20 valores
// de `property_type` para ~8 conceptos (Piso/piso, house, apartamento…) y 400
// valores en `features` de los que 290 NO son amenities — son metros, baños,
// año, planta y orientación mezclados con "Ascensor" y "Aire acondicionado".
//
// Principios, en orden:
//   · El crudo se PRESERVA siempre: esta capa se calcula al leer, nunca
//     escribe. Así no hay backfill que mantener ni puede desincronizarse.
//   · Determinista y legible: cada regla se puede leer en voz alta y probar.
//   · El agente puede corregir: `property_type_override` gana a la regla y
//     sobrevive a cualquier sincronización; las amenities se añaden por
//     `features_manual`, que ya existía para eso.
// ============================================================================

// ─── Tipo de propiedad ───────────────────────────────────────────────────────

export type NormalizedType =
  | "flat"
  | "penthouse"
  | "duplex"
  | "triplex"
  | "studio"
  | "house"
  | "townhouse"
  | "office"
  | "commercial"
  | "garage"
  | "unknown";

export const NORMALIZED_TYPES: readonly NormalizedType[] = [
  "flat",
  "penthouse",
  "duplex",
  "triplex",
  "studio",
  "house",
  "townhouse",
  "office",
  "commercial",
  "garage",
  "unknown",
] as const;

export function isNormalizedType(v: unknown): v is NormalizedType {
  return typeof v === "string" && (NORMALIZED_TYPES as readonly string[]).includes(v);
}

/** minúsculas y sin acentos: "Ático Dúplex" → "atico duplex". */
function fold(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * El mapa cubre TODO el vocabulario visto en producción (21 valores). Lo que
 * no esté aquí sale como `unknown` — jamás se adivina: un "chalet" contado
 * como piso rompe el filtro en silencio.
 */
const TYPE_MAP: Record<string, NormalizedType> = {
  piso: "flat",
  apartamento: "flat",
  atico: "penthouse",
  "aticos-duplex": "penthouse",
  "atico duplex": "penthouse",
  duplex: "duplex",
  triplex: "triplex",
  estudio: "studio",
  house: "house",
  casa: "house",
  "chalets-independientes": "house",
  "chalet independiente": "house",
  adosados: "townhouse",
  oficina: "office",
  "locales-comerciales": "commercial",
  garajes: "garage",
};

/** El override del agente gana siempre; después la regla; después `unknown`. */
export function normalizePropertyType(
  raw: string | null,
  override: string | null = null,
): NormalizedType {
  if (override && isNormalizedType(override)) return override;
  if (!raw) return "unknown";
  return TYPE_MAP[fold(raw)] ?? "unknown";
}

// ─── Amenities ───────────────────────────────────────────────────────────────

export type UnitAmenity =
  | "terrace"
  | "balcony"
  | "furnished"
  | "equipped_kitchen"
  | "air_conditioning"
  | "heating"
  | "wardrobes"
  | "ensuite"
  | "security_door"
  | "renovated"
  | "parking"
  | "storage"
  | "pets_allowed"
  | "smart_tv"
  | "wifi";

export type BuildingAmenity =
  | "lift"
  | "concierge"
  | "pool"
  | "garden"
  | "gym"
  | "security";

export type NormalizedAmenities = {
  unit: UnitAmenity[];
  building: BuildingAmenity[];
  /** Crudo que no es ruido ni casó con ninguna regla. Se enseña como está. */
  leftover: string[];
};

/**
 * RUIDO: entradas de `features` que son DATOS, no amenities — metros, baños,
 * habitaciones, año, planta, orientación, certificado energético, precios.
 * En producción son 290 de los 400 valores distintos. Se descartan de la capa
 * normalizada (el dato ya vive en su columna) y no aparecen en `leftover`.
 */
const NOISE_RE = [
  /m²/i,
  /\d\s*(baños?|habitacion|hab\b)/i,
  /sin habitaci/i,
  /planta\b/i,
  /^bajo (exterior|interior)$/i,
  /construido en/i,
  /orientaci/i,
  /^(norte|sur|este|oeste|noreste|noroeste|sureste|suroeste)$/i,
  /kwh|co2|consumo|emisiones|certificado/i,
  /no indicado/i,
  /€/,
  /segunda mano/i,
  /inmueble exento/i,
  /^(exterior|interior)$/i,
  /agua caliente/i,
];

/** Regla → clave. La PRIMERA que casa gana; el resto de la entrada se ignora. */
const UNIT_RULES: Array<[RegExp, UnitAmenity]> = [
  [/terraza/i, "terrace"],
  [/balc[oó]n/i, "balcony"],
  [/amueblado/i, "furnished"],
  [/cocina equipada/i, "equipped_kitchen"],
  [/aire acondicionado|air conditioning/i, "air_conditioning"],
  [/calefacci[oó]n|heating/i, "heating"],
  [/armarios? empotrad/i, "wardrobes"],
  [/en suite/i, "ensuite"],
  [/puerta de seguridad|puerta blindada/i, "security_door"],
  [/reformado|renovated/i, "renovated"],
  [/garaje|parking/i, "parking"],
  [/trastero/i, "storage"],
  [/pet friendly|mascotas/i, "pets_allowed"],
  [/smart tv/i, "smart_tv"],
  [/wifi/i, "wifi"],
];

const BUILDING_RULES: Array<[RegExp, BuildingAmenity]> = [
  [/ascensor|elevator|lift/i, "lift"],
  [/portero|conserje|concierge/i, "concierge"],
  [/piscina|pool/i, "pool"],
  [/jard[ií]n|garden/i, "garden"],
  [/gimnasio|gym/i, "gym"],
  [/vigilancia|seguridad 24|security/i, "security"],
];

/**
 * Separa el vertedero en tres montones: UNIDAD, EDIFICIO y lo que no supimos
 * leer. "Amueblado y cocina equipada" produce DOS claves — cada entrada se
 * prueba contra todas las reglas, no solo la primera.
 */
export function normalizeAmenities(
  features: string[] | null,
  featuresManual: string[] | null = null,
): NormalizedAmenities {
  const unit = new Set<UnitAmenity>();
  const building = new Set<BuildingAmenity>();
  const leftover: string[] = [];

  for (const raw of [...(features ?? []), ...(featuresManual ?? [])]) {
    const f = raw.trim();
    if (!f) continue;
    if (NOISE_RE.some((re) => re.test(f))) continue;

    let matched = false;
    for (const [re, key] of UNIT_RULES) {
      if (re.test(f)) {
        unit.add(key);
        matched = true;
      }
    }
    for (const [re, key] of BUILDING_RULES) {
      if (re.test(f)) {
        building.add(key);
        matched = true;
      }
    }
    if (!matched && !leftover.includes(f)) leftover.push(f);
  }

  return { unit: [...unit], building: [...building], leftover };
}
