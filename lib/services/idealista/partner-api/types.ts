// Tipos del Idealista Partner API v1 (OAuth2 client_credentials + feedKey).
// Fuente: especificación oficial entregada por Idealista (partnerapiv1_3.yml).
//
// OJO: los objetos `address` y `features` no vienen con el JSON-Schema exacto
// (el .yml los referencia por $ref a ficheros externos que no tenemos). Los
// nombres de campo de abajo son los documentados en la sección "New Property"
// de la spec. Si el sandbox devuelve 400 con un campo desconocido, ajusta aquí
// según el mensaje de error — está todo centralizado en este archivo.

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

export type IdealistaOperationType = "sale" | "rent";

export interface IdealistaAddress {
  // Variante "calle" (la más habitual para España): street + number + postalCode,
  // o coordenadas si no hay dirección exacta.
  address?: string; // nombre de la calle
  number?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  floor?: string;
  flat?: string;
  visibility?: "exact" | "street" | "approximate";
}

export interface IdealistaOperation {
  price: number;
  type: IdealistaOperationType;
}

export interface IdealistaDescription {
  language?: string;
  description: string;
}

// Subconjunto de "features" usado por SmartBC (tipologías flat/house/room).
// El resto de campos del schema (auction*, building-specific, etc.) no aplican
// a nuestro catálogo y se omiten.
export interface IdealistaFeatures {
  areaConstructed?: number;
  areaUsable?: number;
  bedroomNumber?: number;
  bathroomNumber?: number;
  rooms?: number;
  builtYear?: number;
  conditionedAir?: boolean;
  conservation?: "good" | "to_reform" | "needs_reform" | string;
  doorman?: boolean;
  equipment?: string;
  energyCertificateLaw?: string;
  energyCertificateRating?: string;
  energyCertificateEmissionsRating?: string;
  energyCertificatePerformance?: number;
  energyCertificateEmissionsValue?: number;
  isInTopFloor?: boolean;
  garden?: boolean;
  gardenType?: string;
  handicappedAdaptedAccess?: boolean;
  handicappedAdaptedUse?: boolean;
  liftAvailable?: boolean;
  orientationNorth?: boolean;
  orientationSouth?: boolean;
  orientationEast?: boolean;
  orientationWest?: boolean;
  parkingAvailable?: boolean;
  parkingIncludedInPrice?: boolean;
  parkingPrice?: number;
  penthouse?: boolean;
  petsAllowed?: boolean;
  tenantNumber?: number;
  pool?: boolean;
  storage?: boolean;
  studio?: boolean;
  duplex?: boolean;
  triplex?: boolean;
  terrace?: boolean;
  wardrobes?: boolean;
  windowsLocation?: "internal" | "external" | "exterior" | "interior" | string;
  heatingType?: string;
  priceCommunity?: number;
  cadastralReference?: string;
  hiddenPrice?: boolean;
  fee?: number;
  currentOccupation?: string;
  balcony?: boolean;
}

export interface IdealistaPropertyCreate {
  type: IdealistaPropertyType;
  address: IdealistaAddress;
  code?: string;
  reference?: string;
  contactId: number;
  features: IdealistaFeatures;
  operation: IdealistaOperation;
  descriptions?: IdealistaDescription[];
  additionalLink?: string;
  scope?: "idealista" | "microsite";
}

export interface IdealistaPropertyResponse {
  message: string;
  success: boolean;
  propertyCode?: string;
  propertyId: number;
  state: "active" | "inactive" | "pending";
  scope?: string;
  publishInfo?: { publishedAds: number; maxPublishedAds: number };
}

export interface IdealistaContactCreate {
  name: string;
  lastName?: string;
  email: string;
  primaryPhonePrefix?: string;
  primaryPhoneNumber: string;
  secondaryPhonePrefix?: string;
  secondaryPhoneNumber?: string;
}

export interface IdealistaContactResponse {
  message: string;
  success: boolean;
  contactId: number;
  agent?: boolean;
}

export interface IdealistaImage {
  url: string;
  label?: string;
}

export interface IdealistaTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface IdealistaApiError {
  error: string;
  details?: string;
  status: number;
}
