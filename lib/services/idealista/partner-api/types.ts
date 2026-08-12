// Tipos del Partner API de Idealista (API en tiempo real, v1).
//
// Todo lo de este fichero está calcado de los JSON Schema oficiales que sirve
// la propia documentación de Idealista y que están copiados en `./schemas`
// (descargados de https://partners.idealista.com/api-reference/). Si algún día
// Idealista cambia el contrato, el flujo es: volver a bajar los schemas a
// `./schemas`, y `scripts/test-idealista-payload.mts` dirá exactamente qué ha
// dejado de cuadrar.
//
// Convención: los campos opcionales se omiten (no se mandan como null). Los
// schemas llevan `additionalProperties: false`, así que mandar un campo de más
// —o con el nombre mal— es un 400 seguro.

/** `jsonschemas/property/property_create.json#/properties/type` */
export type IdealistaPropertyType =
  | "flat"
  | "house"
  | "countryhouse"
  | "garage"
  | "office"
  | "commercial"
  | "land"
  | "storage"
  | "building"
  | "room";

/** `rules.json#/enumOperationType` */
export type IdealistaOperationType = "rent" | "sale";

/** `rules.json#/enumPropertyStatus` */
export type IdealistaPropertyState = "active" | "inactive" | "pending" | "dropped_by_quality";

/** `rules.json#/enumPropertyVisibility` */
export type IdealistaScope = "idealista" | "microsite";

/** `features.json#/conservation` */
export type IdealistaConservation =
  | "good"
  | "toRestore"
  | "fullyReformed"
  | "new_development_in_construction"
  | "new_development_finished";

/** `features.json#/energyCertificateRating` */
export type IdealistaEnergyRating =
  | "A"
  | "A+"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "B"
  | "B-"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "exempt"
  | "in_process"
  | "unknown";

/** `features.json#/energyCertificateEmissionsRating` (ojo: aquí no hay `unknown`) */
export type IdealistaEmissionsRating = "A" | "B" | "C" | "D" | "E" | "F" | "G";

/** `features.json#/heatingType` */
export type IdealistaHeatingType =
  | "central_gas"
  | "central_fuel_oil"
  | "central_other"
  | "individual_other"
  | "individual_gas"
  | "individual_electric"
  | "individual_air_conditioning_heat_pump"
  | "individual_propane_butane"
  | "no_heating";

/** `features.json#/equipment` */
export type IdealistaEquipment =
  | "equipped_kitchen_and_furnished"
  | "equipped_kitchen_and_not_furnished"
  | "not_equipped";

/** `features.json#/windowsLocation` */
export type IdealistaWindowsLocation = "internal" | "external";

/** `house.json#/properties/type` */
export type IdealistaHouseType =
  | "andar_moradia"
  | "independent"
  | "semidetached"
  | "terraced"
  | "villa";

/** `land.json#/properties/type` */
export type IdealistaLandType = "urban" | "countrybuildable" | "countrynonbuildable";

/** `commercial.json#/properties/type` */
export type IdealistaCommercialType = "retail" | "industrial";

/** `features.json#/garageCapacity` */
export type IdealistaGarageCapacity =
  | "unknown"
  | "car_compact"
  | "car_sedan"
  | "motorcycle"
  | "car_and_motorcycle"
  | "two_cars_and_more";

/** `features.json#/roomsSplitted` */
export type IdealistaRoomsSplitted = "openPlan" | "withScreens" | "withWalls" | "unknown";

/** `features.json#/conditionedAirType` */
export type IdealistaConditionedAirType = "notAvailable" | "cold" | "cold/heat" | "preInstallation";

/** `features.json#/location` (locales comerciales) */
export type IdealistaCommercialLocation =
  | "on_top_floor"
  | "in_a_mall"
  | "on_the_street"
  | "mezzanine"
  | "underground"
  | "other"
  | "unknown";

/** `description/description.json#/properties/language` */
export type IdealistaLanguage =
  | "es"
  | "it"
  | "pt"
  | "en"
  | "de"
  | "fr"
  | "ru"
  | "zh"
  | "ca"
  | "fi"
  | "nl"
  | "pl"
  | "ro"
  | "sv"
  | "da"
  | "nb"
  | "el"
  | "uk";

/** `address.json#/properties/country` */
export type IdealistaCountry =
  | "Spain"
  | "Italy"
  | "Portugal"
  | "Andorra"
  | "France"
  | "Switzerland"
  | "San Marino"
  | "Monaco"
  | "Luxembourg"
  | "Belgium";

/** `address.json` */
export interface IdealistaAddress {
  /** Qué se enseña públicamente. `full` = dirección exacta. */
  visibility?: "full" | "street" | "hidden";
  streetName?: string;
  streetNumber?: string;
  streetKilometer?: number;
  block?: string;
  /** Patrón cerrado: `-1|-2|1..60|bj|en|ss|st`. Ver `normalizeFloor()`. */
  floor?: string;
  stair?: string;
  door?: string;
  urbanization?: string;
  postalCode?: string;
  town?: string;
  nsiCode?: string;
  casaZoneId?: string;
  country?: IdealistaCountry;
  precision?: "exact" | "moved";
  latitude?: number;
  longitude?: number;
}

/** `operation.json` */
export interface IdealistaOperation {
  type: IdealistaOperationType;
  /** Entero, 1..999999999. Idealista no acepta decimales en el precio. */
  price: number;
}

/** `description/description.json` */
export interface IdealistaDescription {
  language: IdealistaLanguage;
  text: string;
}

/**
 * Características por tipología (`flat.json`, `house.json`, …).
 *
 * Se declara como un único tipo laxo a propósito: la validación real de qué
 * campo vale para qué tipología la hace `validateProperty()` contra los JSON
 * Schema oficiales, que es la única fuente que no se queda desactualizada.
 * Aquí solo están tipados los campos que este CRM llega a rellenar.
 */
export interface IdealistaFeatures {
  // Comunes a vivienda (flat/house/countryhouse)
  areaConstructed?: number;
  areaUsable?: number;
  areaPlot?: number;
  bathroomNumber?: number;
  rooms?: number;
  bedroomNumber?: number;
  conservation?: IdealistaConservation;
  builtYear?: number;
  liftAvailable?: boolean;
  energyCertificateRating?: IdealistaEnergyRating;
  energyCertificatePerformance?: number;
  energyCertificateEmissionsRating?: IdealistaEmissionsRating;
  energyCertificateEmissionsValue?: number;
  heatingType?: IdealistaHeatingType;
  equipment?: IdealistaEquipment;
  windowsLocation?: IdealistaWindowsLocation;
  conditionedAir?: boolean;
  terrace?: boolean;
  balcony?: boolean;
  garden?: boolean;
  pool?: boolean;
  storage?: boolean;
  wardrobes?: boolean;
  parkingAvailable?: boolean;
  parkingIncludedInPrice?: boolean;
  parkingPrice?: number;
  penthouse?: boolean;
  studio?: boolean;
  duplex?: boolean;
  triplex?: boolean;
  isInTopFloor?: boolean;
  handicappedAdaptedAccess?: boolean;
  handicappedAdaptedUse?: boolean;
  orientationNorth?: boolean;
  orientationSouth?: boolean;
  orientationEast?: boolean;
  orientationWest?: boolean;
  petsAllowed?: boolean;
  recommendedForChildren?: boolean;
  tenantNumber?: number;
  priceCommunity?: number;
  cadastralReference?: string;
  currentOccupation?:
    | "not_free"
    | "free"
    | "bare_ownership"
    | "tenanted"
    | "illegally_occupied"
    | "life_estate";
  residential?: boolean;
  seasonalRental?: boolean;
  hiddenPrice?: boolean;
  floorsBuilding?: number;

  // Específicos por tipología
  /** house.json / countryHouse.json / land.json / commercial.json */
  type?: IdealistaHouseType | IdealistaLandType | IdealistaCommercialType | string;
  /** garage.json (obligatorio) */
  garageCapacity?: IdealistaGarageCapacity;
  /** office.json (obligatorios) */
  officeBuilding?: boolean;
  roomsSplitted?: IdealistaRoomsSplitted;
  conditionedAirType?: IdealistaConditionedAirType;
  liftNumber?: number;
  parkingSpacesNumber?: number;
  /** commercial.json (obligatorio) */
  location?: IdealistaCommercialLocation;
  /** land.json (obligatorio) */
  roadAccess?: boolean;

  // Escotilla de escape: Idealista añade campos con frecuencia y el schema
  // vendorizado manda sobre este tipo.
  [key: string]: unknown;
}

/** `property_create.json` */
export interface IdealistaPropertyCreate {
  type: IdealistaPropertyType;
  address: IdealistaAddress;
  contactId: number;
  features: IdealistaFeatures;
  operation: IdealistaOperation;
  code?: string;
  reference?: string;
  casaCode?: string;
  descriptions?: IdealistaDescription[];
  additionalLink?: string;
  scope?: IdealistaScope;
}

/**
 * `property_modify.json`
 *
 * Ojo con esto, que es contraintuitivo y cuesta un 400: el texto del endpoint
 * dice que `code`, tipología y operación "no se pueden modificar", pero el
 * schema del PUT **sigue exigiendo `type`** (con el mismo valor que ya tenía) y
 * en cambio **no admite `code`** (`additionalProperties: false`). O sea: en el
 * update se manda todo menos `code`.
 */
export type IdealistaPropertyModify = Omit<IdealistaPropertyCreate, "code">;

/** `image/image_process.json#/properties/label` */
export type IdealistaImageLabel =
  | "appraisalplan"
  | "archive"
  | "atmosphere"
  | "balcony"
  | "basement"
  | "bathroom"
  | "bedroom"
  | "buildingwork"
  | "cellar"
  | "communalareas"
  | "corridor"
  | "details"
  | "dining_room"
  | "energycertificate"
  | "facade"
  | "garage"
  | "garden"
  | "gateway"
  | "hall"
  | "kitchen"
  | "land"
  | "lifts"
  | "living"
  | "loft"
  | "mates"
  | "meeting_room"
  | "office"
  | "open_plan"
  | "patio"
  | "penthouse"
  | "pool"
  | "porch"
  | "pressphoto"
  | "reception"
  | "room"
  | "shop_window"
  | "staircase"
  | "storage"
  | "storage_space"
  | "studio"
  | "surroundings"
  | "terrace"
  | "unknown"
  | "views"
  | "waitingroom"
  | "walk_in_wardrobe";

/** `image/image_process.json` */
export interface IdealistaImageInput {
  url: string;
  label?: IdealistaImageLabel;
  aiGenerated?: boolean | null;
}

/** `output/image_output.json` */
export interface IdealistaImageOutput {
  imageId?: number;
  label?: string;
  order?: number;
  url: string;
  /** MD5 de la foto original que descargó Idealista: nos sirve de puente entre su id y la nuestra. */
  originalMD5CheckSum?: string;
  state?: "processed" | "pending_to_process" | "error_download";
  aiGenerated?: boolean | null;
}

/** `video/video_create.json` */
export interface IdealistaVideoInput {
  url: string;
  /** 1..6 */
  order: number;
}

/** `output/video_output.json` */
export interface IdealistaVideoOutput {
  videoId?: number;
  order?: number;
  url?: string;
  state?: "processed" | "pending_to_process" | "error_download";
}

/** `contact/contact_create.json` */
export interface IdealistaContactInput {
  name: string;
  email: string;
  /** Solo dígitos, 5..12. */
  primaryPhoneNumber: string;
  lastName?: string;
  primaryPhonePrefix?: string;
  secondaryPhonePrefix?: string;
  secondaryPhoneNumber?: string;
}

/** `contact/contact_obtain.json` */
export interface IdealistaContact extends IdealistaContactInput {
  contactId: number;
  active?: boolean;
  /** Si es `true`, Idealista no deja modificarlo (409). */
  agent?: boolean;
  agentEmail?: string;
}

/** `property/publishInfo.json` */
export interface IdealistaPublishInfo {
  publishedAds: number;
  maxPublishedAds: number;
}

/** `output/property_response.json` */
export interface IdealistaPropertyResponse {
  message?: string;
  success?: boolean;
  propertyCode?: string;
  propertyId?: number;
  state?: IdealistaPropertyState;
  scope?: IdealistaScope;
  publishInfo?: IdealistaPublishInfo;
}

/** `property/page.json` */
export interface IdealistaPage {
  number?: number;
  size?: number;
  total?: number;
}

/** `output/property_obtain_response.json#/properties/property` */
export interface IdealistaPropertyDetail extends IdealistaPropertyCreate {
  propertyId?: number;
  code: string;
  state: IdealistaPropertyState;
}
