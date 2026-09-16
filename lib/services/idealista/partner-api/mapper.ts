import type {
  IdealistaAddress,
  IdealistaConservation,
  IdealistaCountry,
  IdealistaEmissionsRating,
  IdealistaEnergyRating,
  IdealistaEquipment,
  IdealistaFeatures,
  IdealistaHeatingType,
  IdealistaLanguage,
  IdealistaOperation,
  IdealistaPropertyCreate,
  IdealistaPropertyModify,
  IdealistaPropertyType,
  IdealistaScope,
} from "./types";

// Traducción de una ficha de `idealista_listings` al cuerpo que espera
// `POST/PUT /v1/properties`.
//
// Cada regla de abajo sale de los JSON Schema oficiales copiados en
// `./schemas`. Las dos cosas que conviene tener presentes al leerlo:
//
//  1. Los schemas llevan `additionalProperties: false`. Un campo de más, o con
//     el nombre mal escrito, es un 400 — no se ignora.
//  2. Este fichero NO valida: solo traduce y anota. La validación de verdad la
//     hace `validate.ts` contra los schemas, que es lo único que no se queda
//     obsoleto cuando Idealista cambia algo.
//
// El módulo es puro a propósito (sin `server-only`, sin acceso a BD) para que
// `scripts/test-idealista-payload.mts` pueda ejercitarlo sin levantar la app.

/** Las columnas de `idealista_listings` que se usan para publicar. */
export interface IdealistaListingRow {
  id?: string;
  reference_code: string | null;
  property_type: string | null;
  operation: string | null;

  // Superficie y distribución
  square_meters: number | null;
  built_square_meters: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  is_last_floor: boolean | null;
  condition: string | null;
  construction_year: number | null;

  // Dirección
  address_street: string | null;
  address_number: string | null;
  has_no_number: boolean | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_block: string | null;
  address_door: string | null;
  address_visibility: string | null;
  building_name: string | null;
  latitude: number | null;
  longitude: number | null;
  cadastral_reference: string | null;

  // Precio
  price: number | null;
  total_rental_price: number | null;
  community_fees: number | null;
  rental_type: string | null;
  sale_exception: string | null;
  max_tenants: number | null;

  // Equipamiento y extras
  equipment_type: string | null;
  windows_location: string | null;
  has_elevator: boolean | null;
  heating_type: string | null;
  heating_fuel: string | null;
  has_terrace: boolean | null;
  has_balcony: boolean | null;
  has_parking: boolean | null;
  has_storage: boolean | null;
  has_pool: boolean | null;
  has_garden: boolean | null;
  has_wardrobes: boolean | null;
  has_ac: boolean | null;
  has_adapted_access: boolean | null;
  has_wheelchair_access: boolean | null;
  pets_allowed: boolean | null;
  children_recommended: boolean | null;
  is_penthouse: boolean | null;
  is_studio: boolean | null;
  is_duplex: boolean | null;
  orientation_north: boolean | null;
  orientation_south: boolean | null;
  orientation_east: boolean | null;
  orientation_west: boolean | null;

  // Energía
  energy_class: string | null;
  energy_performance: number | null;
  emission_rating: string | null;
  emission_value: number | null;

  // Contenido
  description: string | null;
  external_link: string | null;
  contact_id: string | null;
}

export interface MapperOptions {
  scope: IdealistaScope;
  country: IdealistaCountry;
  language: IdealistaLanguage;
  /** Si mandamos `code` (nuestra referencia) para que el alta sea idempotente. */
  sendCode: boolean;
  /** Contacto a usar cuando la ficha no trae el suyo propio (`idealista_config.default_contact_id`). */
  defaultContactId?: number | null;
}

export interface MappedProperty {
  payload: IdealistaPropertyCreate;
  /** Problemas que impiden publicar. Si hay alguno, no se llama a Idealista. */
  errors: string[];
  /** Cosas que sí se publican pero que conviene revisar. */
  warnings: string[];
}

export interface MappedPropertyUpdate extends Omit<MappedProperty, "payload"> {
  payload: IdealistaPropertyModify;
}

/* ────────────────────────── Tablas de equivalencias ────────────────────────── */

/** Tipo del CRM → tipología de Idealista (`property_create.json#/properties/type`). */
const TYPE_MAP: Record<string, IdealistaPropertyType> = {
  flat: "flat",
  penthouse: "flat",
  studio: "flat",
  duplex: "flat",
  house: "house",
  "semi-detached": "house",
  chalet: "house",
  villa: "house",
  land: "land",
  office: "office",
  local: "commercial",
  storage: "storage",
  garage: "garage",
};

/** Subtipo dentro de `house.json#/properties/type`. */
const HOUSE_SUBTYPE: Record<string, string> = {
  house: "independent",
  chalet: "independent",
  "semi-detached": "semidetached",
  villa: "villa",
};

/** Estado del CRM → `features.json#/conservation`. */
const CONSERVATION_MAP: Record<string, IdealistaConservation> = {
  good: "good",
  "to-reform": "toRestore",
  "needs-reform": "toRestore",
};

/** Equipamiento del CRM → `features.json#/equipment`. */
const EQUIPMENT_MAP: Record<string, IdealistaEquipment> = {
  furnished: "equipped_kitchen_and_furnished",
  "kitchen-only": "equipped_kitchen_and_not_furnished",
  empty: "not_equipped",
};

/** Situación excepcional de venta → `features.json#/currentOccupation`. */
const OCCUPATION_MAP: Record<string, IdealistaFeatures["currentOccupation"]> = {
  "illegally-occupied": "illegally_occupied",
  "rented-with-tenants": "tenanted",
  "bare-ownership": "bare_ownership",
};

const ENERGY_RATINGS = new Set(["A", "A+", "A1", "A2", "A3", "A4", "B", "B-", "C", "D", "E", "F", "G"]);
const EMISSION_RATINGS = new Set(["A", "B", "C", "D", "E", "F", "G"]);

/**
 * Tipo + combustible → `features.json#/heatingType`.
 * El enum no tiene "individual con gasoil", así que ese caso cae en
 * `individual_other`, que es lo que más se le acerca.
 */
function mapHeatingType(type: string | null, fuel: string | null): IdealistaHeatingType | undefined {
  if (!type || type === "unknown") return undefined;
  if (type === "none") return "no_heating";

  const isCentral = type === "centralized";
  switch (fuel) {
    case "gas-natural":
      return isCentral ? "central_gas" : "individual_gas";
    case "gasoil":
      return isCentral ? "central_fuel_oil" : "individual_other";
    default:
      return isCentral ? "central_other" : "individual_other";
  }
}

/**
 * La planta de Idealista es un patrón cerrado
 * (`address.json`: `-1|-2|1..60|bj|en|ss|st`), no texto libre.
 * Devuelve `null` si no hay forma de encajar lo que escribió el usuario.
 */
export function normalizeFloor(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!value) return null;

  if (/^(bj|bajo|baja|planta baja|pb|0)$/.test(value)) return "bj";
  if (/^(en|entreplanta|entresuelo|mezzanine)$/.test(value)) return "en";
  if (/^(ss|semisotano|semi-sotano)$/.test(value)) return "ss";
  if (/^(st|sotano)$/.test(value)) return "st";

  const numeric = value.match(/^(-?\d{1,2})/);
  if (numeric) {
    const n = Number(numeric[1]);
    if (n === 0) return "bj";
    if (n === -1 || n === -2) return String(n);
    if (n >= 1 && n <= 60) return String(n);
  }
  return null;
}

/** Deja solo dígitos y comprueba el patrón de teléfono (`rules.json#/phoneFormat`). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  // Un móvil español llega con 34 delante muchas veces: el prefijo va aparte.
  const local = digits.length === 11 && digits.startsWith("34") ? digits.slice(2) : digits;
  return /^[0-9]{5,12}$/.test(local) ? local : null;
}

function toPositiveInt(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Redondea a 2 decimales para cumplir `multipleOf: 0.01`. */
function toTwoDecimals(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100) / 100;
}

function trimTo(value: string | null | undefined, max: number): string | undefined {
  const t = (value ?? "").trim();
  return t ? t.slice(0, max) : undefined;
}

function mapEnergyRating(raw: string | null): IdealistaEnergyRating {
  const value = (raw ?? "").trim();
  if (!value) return "unknown";
  if (value === "pending") return "in_process";
  if (value === "exempt" || value === "exenta") return "exempt";
  const upper = value.toUpperCase();
  return ENERGY_RATINGS.has(upper) ? (upper as IdealistaEnergyRating) : "unknown";
}

function mapEmissionsRating(raw: string | null): IdealistaEmissionsRating | undefined {
  const upper = (raw ?? "").trim().toUpperCase();
  // Aquí no existen `in_process` ni `unknown`: o es A-G, o no se manda.
  return EMISSION_RATINGS.has(upper) ? (upper as IdealistaEmissionsRating) : undefined;
}

/** Quita las claves `undefined` para no mandar campos vacíos. */
function compact<T extends object>(obj: T): T {
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return obj;
}

/* ────────────────────────── Dirección ────────────────────────── */

function buildAddress(
  row: IdealistaListingRow,
  options: MapperOptions,
  errors: string[],
  warnings: string[]
): IdealistaAddress {
  const visibility =
    row.address_visibility === "street" ? "street" : row.address_visibility === "hidden" ? "hidden" : "full";

  const latitude = row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : undefined;
  const longitude = row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : undefined;
  const hasCoordinates =
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0);

  const postalCode = trimTo(row.address_postal_code, 10);
  const validPostalCode = postalCode && /^\d{5}$/.test(postalCode) ? postalCode : undefined;
  if (postalCode && !validPostalCode) {
    warnings.push(`El código postal "${postalCode}" no tiene 5 dígitos: se publica sin él.`);
  }

  const streetName = trimTo(row.address_street, 200);
  const streetNumber = row.has_no_number ? undefined : trimTo(row.address_number, 10);
  const hasStreetAddress = !!(streetName && streetNumber && validPostalCode);

  // Requisito del spec: coordenadas, o calle + número + CP.
  if (!hasCoordinates && !hasStreetAddress) {
    errors.push(
      "Falta la dirección: Idealista exige coordenadas en el mapa, o calle + número + código postal. " +
        'Si el inmueble no tiene número, marca "Sin número" y sitúalo en el mapa.'
    );
  }

  const floor = normalizeFloor(row.floor);
  if (row.floor && !floor) {
    warnings.push(
      `La planta "${row.floor}" no encaja con los valores que admite Idealista (-2 a 60, bajo, entreplanta, semisótano, sótano): se publica sin planta.`
    );
  }

  return compact<IdealistaAddress>({
    visibility,
    streetName,
    streetNumber,
    block: trimTo(row.address_block, 20),
    door: trimTo(row.address_door, 4),
    floor: floor ?? undefined,
    // `urbanization` se enseña aunque la dirección esté oculta: es el sitio
    // natural para el nombre del edificio/urbanización.
    urbanization: trimTo(row.building_name, 100),
    postalCode: validPostalCode,
    town: trimTo(row.address_city, 50),
    country: options.country,
    latitude: hasCoordinates ? latitude : undefined,
    longitude: hasCoordinates ? longitude : undefined,
    precision: hasCoordinates ? "exact" : undefined,
  });
}

/* ────────────────────────── Operación ────────────────────────── */

function buildOperation(row: IdealistaListingRow, errors: string[]): IdealistaOperation {
  const type = row.operation === "sale" ? "sale" : "rent";
  const rawPrice = type === "sale" ? row.price : (row.total_rental_price ?? row.price);
  const price = toPositiveInt(rawPrice);

  if (!price) {
    errors.push(
      type === "sale"
        ? "Falta el precio de venta."
        : "Falta el precio del alquiler (Precio total con gastos)."
    );
  }

  return { type, price: price ?? 0 };
}

/* ────────────────────────── Características ────────────────────────── */

function buildFeatures(
  row: IdealistaListingRow,
  idealistaType: IdealistaPropertyType,
  errors: string[],
  warnings: string[]
): IdealistaFeatures {
  const propertyType = (row.property_type ?? "flat").toLowerCase();
  const isRent = (row.operation ?? "rent") !== "sale";

  const areaConstructed = toPositiveInt(row.built_square_meters) ?? toPositiveInt(row.square_meters);
  const areaUsable = toPositiveInt(row.square_meters);

  const conservationKey = (row.condition ?? "good").toLowerCase();
  if (conservationKey === "new") {
    errors.push(
      'La ficha está marcada como "Obra nueva". La API en tiempo real de Idealista solo admite inmuebles de segunda mano: ' +
        "cambia el estado del inmueble o publica esa promoción por el canal de obra nueva."
    );
  }
  const conservation = CONSERVATION_MAP[conservationKey] ?? "good";

  const energyCertificateRating = mapEnergyRating(row.energy_class);
  if (energyCertificateRating === "unknown") {
    warnings.push(
      'Sin certificado energético: se publica como "unknown". Idealista puede tumbar el anuncio por falta de certificado.'
    );
  }

  const energyCertificatePerformance = toTwoDecimals(row.energy_performance);
  if (energyCertificatePerformance !== undefined && energyCertificatePerformance > 9999.99) {
    warnings.push("El consumo energético supera el máximo que admite Idealista (9999,99): se publica sin ese dato.");
  }

  const emissionsValue = toTwoDecimals(row.emission_value);
  const builtYear = row.construction_year ?? undefined;
  if (builtYear !== undefined && (builtYear < 1700 || builtYear > 2100)) {
    warnings.push(`El año de construcción ${builtYear} está fuera del rango que admite Idealista (1700-2100).`);
  }

  const heatingType = mapHeatingType(row.heating_type, row.heating_fuel);
  const equipment = isRent ? EQUIPMENT_MAP[row.equipment_type ?? ""] : undefined;
  // Ojo: `windowsLocation` sólo existe en flat.json y office.json. En
  // house.json / countryHouse.json no está, y mandarlo ahí es un 400.
  const windowsLocation = row.windows_location === "interior" ? "internal" : "external";

  // Comunes a casi todas las tipologías.
  const common: IdealistaFeatures = {
    areaConstructed,
    conservation,
    cadastralReference: trimTo(row.cadastral_reference, 20),
  };

  // Confirmado contra el sandbox real: bathroomNumber=0 con conservation="good"
  // da 400 "bathroom number not valid" — es una regla de negocio que no está en
  // el schema (bathroomNumber admite 0 por rango). Mejor pedir el dato real que
  // adivinar un número de baños que no es.
  if (!row.bathrooms || row.bathrooms <= 0) {
    errors.push('Faltan los baños en la ficha: Idealista no admite "0 baños" con el estado de conservación actual. Indica al menos 1.');
  }
  // Confirmado también: areaUsable debe ser ESTRICTAMENTE menor que
  // areaConstructed (igual también lo rechaza). Si los datos de la ficha no lo
  // cumplen, se omite areaUsable (es opcional) en vez de mandar un 400 seguro.
  const areaUsableValid = areaUsable !== undefined && areaConstructed !== undefined && areaUsable < areaConstructed;
  if (areaUsable !== undefined && areaConstructed !== undefined && !areaUsableValid) {
    warnings.push(
      `La superficie útil (${areaUsable} m²) no es menor que la construida (${areaConstructed} m²): se publica sin superficie útil.`
    );
  }

  const housingShared: IdealistaFeatures = {
    ...common,
    areaUsable: areaUsableValid ? areaUsable : undefined,
    bathroomNumber: row.bathrooms ?? 0,
    rooms: row.bedrooms ?? 0,
    energyCertificateRating,
    energyCertificatePerformance:
      energyCertificatePerformance !== undefined && energyCertificatePerformance <= 9999.99
        ? energyCertificatePerformance
        : undefined,
    energyCertificateEmissionsRating: mapEmissionsRating(row.emission_rating),
    energyCertificateEmissionsValue: emissionsValue !== undefined && emissionsValue <= 9999.99 ? emissionsValue : undefined,
    builtYear: builtYear !== undefined && builtYear >= 1700 && builtYear <= 2100 ? builtYear : undefined,
    heatingType,
    equipment,
    liftAvailable: !!row.has_elevator,
    conditionedAir: !!row.has_ac,
    terrace: !!row.has_terrace,
    balcony: !!row.has_balcony,
    garden: !!row.has_garden,
    pool: !!row.has_pool,
    storage: !!row.has_storage,
    wardrobes: !!row.has_wardrobes,
    parkingAvailable: !!row.has_parking,
    handicappedAdaptedAccess: !!row.has_adapted_access,
    handicappedAdaptedUse: !!row.has_wheelchair_access,
    orientationNorth: !!row.orientation_north,
    orientationSouth: !!row.orientation_south,
    orientationEast: !!row.orientation_east,
    orientationWest: !!row.orientation_west,
  };

  if (isRent) {
    // Confirmado contra producción (2026-09-16): mandar este campo en una
    // operación de venta da 400 "recommendedForChildren only allowed for rent
    // operation" — no está en el schema (flat/house/countryHouse lo admiten
    // sin distinguir operación), es otra regla de negocio no documentada.
    housingShared.recommendedForChildren = !!row.children_recommended;
    housingShared.petsAllowed = !!row.pets_allowed;
    // `tenantNumberForHousing` va de 1 a 10.
    const tenants = toPositiveInt(row.max_tenants);
    if (tenants !== undefined) {
      housingShared.tenantNumber = Math.min(tenants, 10);
      if (tenants > 10) warnings.push("El máximo de inquilinos que admite Idealista es 10.");
    }
    if (row.rental_type === "temporary") {
      housingShared.seasonalRental = true;
    } else if (row.rental_type === "residential") {
      housingShared.residential = true;
    }
  } else {
    // Confirmado contra producción (2026-09-16): `priceCommunity` en una
    // operación de alquiler da 400 "community costs not allowed for rent
    // operation" — mismo patrón que `recommendedForChildren` pero al revés
    // (esta regla de negocio tampoco está en el schema). Solo se manda en venta.
    housingShared.priceCommunity = toPositiveInt(row.community_fees);
    const occupation = OCCUPATION_MAP[row.sale_exception ?? "none"];
    if (occupation) housingShared.currentOccupation = occupation;
  }

  switch (idealistaType) {
    case "flat": {
      return compact<IdealistaFeatures>({
        ...housingShared,
        windowsLocation,
        penthouse: !!row.is_penthouse || propertyType === "penthouse",
        studio: !!row.is_studio || propertyType === "studio",
        duplex: !!row.is_duplex || propertyType === "duplex",
        isInTopFloor: !!row.is_last_floor,
      });
    }

    case "house": {
      return compact<IdealistaFeatures>({
        ...housingShared,
        type: HOUSE_SUBTYPE[propertyType] ?? "independent",
        areaPlot: toPositiveInt(row.square_meters),
      });
    }

    case "garage": {
      return compact<IdealistaFeatures>({
        areaConstructed,
        // `garageCapacity` es obligatorio y el formulario del CRM no lo pregunta.
        garageCapacity: "unknown",
        liftAvailable: !!row.has_elevator,
        // Igual que en housingShared: solo en venta (ver nota más arriba).
        priceCommunity: isRent ? undefined : toPositiveInt(row.community_fees),
        cadastralReference: trimTo(row.cadastral_reference, 20),
      });
    }

    case "storage": {
      if (!areaConstructed) errors.push("Un trastero necesita superficie construida para publicarse en Idealista.");
      return compact<IdealistaFeatures>({
        areaConstructed,
        priceCommunity: isRent ? undefined : toPositiveInt(row.community_fees),
        cadastralReference: trimTo(row.cadastral_reference, 20),
      });
    }

    case "land": {
      const areaPlot = toPositiveInt(row.square_meters) ?? toPositiveInt(row.built_square_meters);
      if (!areaPlot) errors.push("Un solar necesita superficie de parcela para publicarse en Idealista.");
      warnings.push(
        'Solar: Idealista exige tipo de suelo, acceso rodado, tipo de acceso y una clasificación urbanística, que el formulario no pregunta. ' +
          'Se publica como "urbano", con acceso rodado y clasificación "otro"; revísalo en la ficha si no es así.'
      );
      return compact<IdealistaFeatures>({
        areaPlot,
        type: "urban",
        roadAccess: true,
        // Dos reglas confirmadas contra el sandbox real, ninguna en el
        // `required` del schema (sólo en la descripción en prosa, o ni eso):
        //  - roadAccess=true exige accessType, si no 400 "access type must
        //    be provided when road access is present".
        //  - type="urban" exige al menos un campo classification*, si no 400
        //    de validación pidiendo cada uno de los classification* posibles.
        accessType: "unknown",
        classificationOther: true,
        cadastralReference: trimTo(row.cadastral_reference, 20),
      });
    }

    case "office": {
      warnings.push(
        "Oficina: Idealista exige distribución, tipo de climatización, nº de ascensores y nº de plazas de garaje. Se deducen de la ficha; revísalos."
      );
      return compact<IdealistaFeatures>({
        ...common,
        priceCommunity: isRent ? undefined : toPositiveInt(row.community_fees),
        areaUsable: areaUsable !== areaConstructed ? areaUsable : undefined,
        energyCertificateRating,
        windowsLocation,
        officeBuilding: false,
        roomsSplitted: "unknown",
        conditionedAirType: row.has_ac ? "cold/heat" : "notAvailable",
        liftNumber: row.has_elevator ? 1 : 0,
        parkingSpacesNumber: row.has_parking ? 1 : 0,
        bathroomNumber: row.bathrooms ?? 0,
        builtYear: builtYear !== undefined && builtYear >= 1700 && builtYear <= 2100 ? builtYear : undefined,
        storage: !!row.has_storage,
      });
    }

    case "commercial": {
      warnings.push(
        'Local: Idealista exige el emplazamiento y el tipo de local. Se publica como local "a pie de calle" de tipo retail; revísalo.'
      );
      return compact<IdealistaFeatures>({
        ...common,
        priceCommunity: isRent ? undefined : toPositiveInt(row.community_fees),
        areaUsable: areaUsable !== areaConstructed ? areaUsable : undefined,
        energyCertificateRating,
        type: "retail",
        location: "on_the_street",
        rooms: row.bedrooms ?? 0,
        bathroomNumber: row.bathrooms ?? 0,
        conditionedAir: !!row.has_ac,
        storage: !!row.has_storage,
        builtYear: builtYear !== undefined && builtYear >= 1700 && builtYear <= 2100 ? builtYear : undefined,
      });
    }

    default:
      return compact<IdealistaFeatures>(housingShared);
  }
}

/* ────────────────────────── Entrada principal ────────────────────────── */

/** Tipología de Idealista para una ficha del CRM. */
export function mapPropertyType(row: Pick<IdealistaListingRow, "property_type">): IdealistaPropertyType {
  return TYPE_MAP[(row.property_type ?? "flat").toLowerCase()] ?? "flat";
}

/**
 * Traduce la ficha a payload de Idealista.
 *
 * No lanza: devuelve `errors` para que el panel pueda enseñarlos todos de una
 * vez en lugar de ir descubriéndolos de uno en uno a base de intentos.
 */
export function buildPropertyPayload(row: IdealistaListingRow, options: MapperOptions): MappedProperty {
  const errors: string[] = [];
  const warnings: string[] = [];

  const type = mapPropertyType(row);

  const contactId = Number(row.contact_id || options.defaultContactId || "");
  if (!Number.isInteger(contactId) || contactId <= 0) {
    errors.push(
      'Falta el contacto de Idealista en la ficha. Selecciónalo o créalo en la sección ' +
        '"Contacto e info interna" del formulario, antes de publicar.'
    );
  }

  const address = buildAddress(row, options, errors, warnings);
  const operation = buildOperation(row, errors);
  const features = buildFeatures(row, type, errors, warnings);

  const descriptionText = trimTo(row.description, 4000);
  if (!descriptionText) {
    warnings.push("La ficha no tiene descripción: el anuncio se publicará sin texto.");
  }

  const externalLink = trimTo(row.external_link, 500);
  const reference = trimTo(row.reference_code, 50);

  const payload: IdealistaPropertyCreate = compact({
    type,
    address,
    contactId: Number.isInteger(contactId) && contactId > 0 ? contactId : 0,
    features,
    operation,
    code: options.sendCode ? reference : undefined,
    reference,
    descriptions: descriptionText ? [{ language: options.language, text: descriptionText }] : undefined,
    additionalLink: externalLink && /^https?:\/\//i.test(externalLink) ? externalLink : undefined,
    scope: options.scope,
  }) as IdealistaPropertyCreate;

  if (externalLink && !/^https?:\/\//i.test(externalLink)) {
    warnings.push(`El enlace externo "${externalLink}" no es una URL válida: se publica sin él.`);
  }

  return { payload, errors, warnings };
}

/**
 * El cuerpo de `PUT /v1/properties/{id}`.
 *
 * Igual que el alta pero **sin `code`**: aunque la descripción del endpoint
 * diga que la tipología no se puede modificar, `property_modify.json` sigue
 * exigiendo `type` (con el valor que ya tenía) y es `code` el campo que
 * desaparece del schema.
 */
export function buildPropertyUpdatePayload(
  row: IdealistaListingRow,
  options: MapperOptions
): MappedPropertyUpdate {
  const mapped = buildPropertyPayload(row, options);
  const { code: _code, ...rest } = mapped.payload;
  return { ...mapped, payload: rest };
}
