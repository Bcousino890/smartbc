import "server-only";
import { idealistaRequest, IdealistaApiError } from "./client";
import type { IdealistaApiConfig } from "./config";
import type {
  IdealistaContact,
  IdealistaContactInput,
  IdealistaImageInput,
  IdealistaImageOutput,
  IdealistaOperation,
  IdealistaPage,
  IdealistaPropertyCreate,
  IdealistaPropertyDetail,
  IdealistaPropertyModify,
  IdealistaPropertyResponse,
  IdealistaPublishInfo,
  IdealistaVideoInput,
  IdealistaVideoOutput,
} from "./types";

// Cobertura completa del Partner API v1. Idealista exige que TODO lo que la API
// permite hacer se haga por API y no desde su área privada, así que aquí está
// cada endpoint del spec, incluidos los que el CRM aún no usa desde el panel.

const MAX_PAGE_SIZE = 100;

/* ────────────────────────── Contactos ────────────────────────── */

export interface ContactsPage {
  contacts: IdealistaContact[];
  page: IdealistaPage;
  totalContacts: number;
}

/** `GET /v1/contacts` — una página de contactos. */
export async function findAllContacts(
  page = 1,
  size = MAX_PAGE_SIZE,
  config?: IdealistaApiConfig
): Promise<ContactsPage> {
  const { data } = await idealistaRequest<{
    contacts?: IdealistaContact[];
    page?: IdealistaPage;
    totalContacts?: number;
  }>("/v1/contacts", { resource: "contacts", query: { page, size: Math.min(size, MAX_PAGE_SIZE) } }, config);

  return {
    contacts: data?.contacts ?? [],
    page: data?.page ?? { number: page, size },
    totalContacts: data?.totalContacts ?? data?.contacts?.length ?? 0,
  };
}

/** Recorre todas las páginas de contactos (para reconciliar con nuestro sistema). */
export async function findEveryContact(config?: IdealistaApiConfig): Promise<IdealistaContact[]> {
  const all: IdealistaContact[] = [];
  for (let page = 1; page <= 200; page++) {
    const result = await findAllContacts(page, MAX_PAGE_SIZE, config);
    all.push(...result.contacts);
    if (result.contacts.length < MAX_PAGE_SIZE) break;
  }
  return all;
}

/** `GET /v1/contacts/{contactId}` */
export async function findContact(
  contactId: number,
  config?: IdealistaApiConfig
): Promise<IdealistaContact | null> {
  try {
    const { data } = await idealistaRequest<{ contact?: IdealistaContact } & IdealistaContact>(
      `/v1/contacts/${contactId}`,
      { resource: "contacts" },
      config
    );
    return data?.contact ?? (data?.contactId ? data : null);
  } catch (err) {
    if (err instanceof IdealistaApiError && err.status === 404) return null;
    throw err;
  }
}

export interface ContactCreated {
  contactId: number;
  /** Idealista devuelve el contacto del agente si el email ya era de un agente. */
  agent: boolean;
}

/** `POST /v1/contacts` */
export async function createContact(
  input: IdealistaContactInput,
  config?: IdealistaApiConfig
): Promise<ContactCreated> {
  const { data } = await idealistaRequest<{ contactId?: number; agent?: boolean }>(
    "/v1/contacts",
    { method: "POST", body: input, resource: "contacts" },
    config
  );
  if (!data?.contactId) {
    throw new IdealistaApiError("Idealista no devolvió el contactId del contacto creado.", 200, JSON.stringify(data));
  }
  return { contactId: data.contactId, agent: data.agent === true };
}

/** `PUT /v1/contacts/{contactId}` — 409 si el contacto pertenece a un agente. */
export async function updateContact(
  contactId: number,
  input: IdealistaContactInput,
  config?: IdealistaApiConfig
): Promise<void> {
  await idealistaRequest(
    `/v1/contacts/${contactId}`,
    { method: "PUT", body: input, resource: "contacts" },
    config
  );
}

/* ────────────────────────── Propiedades ────────────────────────── */

export interface PropertiesPage {
  properties: IdealistaPropertyDetail[];
  page: IdealistaPage;
  totalProperties: number;
}

/** `GET /v1/properties` — el `findall` que Idealista pide usar para reconstruir relaciones. */
export async function findAllProperties(
  page = 1,
  size = MAX_PAGE_SIZE,
  state?: "active" | "inactive" | "pending",
  config?: IdealistaApiConfig
): Promise<PropertiesPage> {
  const { data } = await idealistaRequest<{
    properties?: IdealistaPropertyDetail[];
    page?: IdealistaPage;
    totalProperties?: number;
  }>(
    "/v1/properties",
    { resource: "properties", query: { page, size: Math.min(size, MAX_PAGE_SIZE), state } },
    config
  );

  return {
    properties: data?.properties ?? [],
    page: data?.page ?? { number: page, size },
    totalProperties: data?.totalProperties ?? data?.properties?.length ?? 0,
  };
}

/** Recorre todas las páginas de anuncios. */
export async function findEveryProperty(
  state?: "active" | "inactive" | "pending",
  config?: IdealistaApiConfig
): Promise<IdealistaPropertyDetail[]> {
  const all: IdealistaPropertyDetail[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await findAllProperties(page, MAX_PAGE_SIZE, state, config);
    all.push(...result.properties);
    if (result.properties.length < MAX_PAGE_SIZE) break;
  }
  return all;
}

/** `GET /v1/properties/{propertyId}` */
export async function findProperty(
  propertyId: number,
  config?: IdealistaApiConfig
): Promise<IdealistaPropertyDetail | null> {
  try {
    const { data } = await idealistaRequest<{ property?: IdealistaPropertyDetail }>(
      `/v1/properties/${propertyId}`,
      { resource: "properties" },
      config
    );
    return data?.property ?? null;
  } catch (err) {
    if (err instanceof IdealistaApiError && err.status === 404) return null;
    throw err;
  }
}

/** `POST /v1/properties` — 409 si ya existe un anuncio con ese `code`. */
export async function createProperty(
  payload: IdealistaPropertyCreate,
  config?: IdealistaApiConfig
): Promise<IdealistaPropertyResponse> {
  const { data } = await idealistaRequest<IdealistaPropertyResponse>(
    "/v1/properties",
    { method: "POST", body: payload, resource: "properties" },
    config
  );
  return data;
}

/** `PUT /v1/properties/{propertyId}` — no admite cambiar `code`, tipo ni operación. */
export async function updateProperty(
  propertyId: number,
  payload: IdealistaPropertyModify,
  config?: IdealistaApiConfig
): Promise<IdealistaPropertyResponse> {
  const { data } = await idealistaRequest<IdealistaPropertyResponse>(
    `/v1/properties/${propertyId}`,
    { method: "PUT", body: payload, resource: "properties" },
    config
  );
  return data;
}

/** `POST /v1/properties/{propertyId}/deactivate` — sin cuerpo. */
export async function deactivateProperty(
  propertyId: number,
  config?: IdealistaApiConfig
): Promise<IdealistaPropertyResponse> {
  const { data } = await idealistaRequest<IdealistaPropertyResponse>(
    `/v1/properties/${propertyId}/deactivate`,
    { method: "POST", resource: "properties" },
    config
  );
  return data;
}

/**
 * `POST /v1/properties/{propertyId}/reactivate`
 *
 * Un 409 aquí es definitivo: si el equipo de calidad tumbó el anuncio, solo
 * puede reactivarlo el gestor de cuenta de Idealista.
 */
export async function reactivateProperty(
  propertyId: number,
  config?: IdealistaApiConfig
): Promise<IdealistaPropertyResponse> {
  const { data } = await idealistaRequest<IdealistaPropertyResponse>(
    `/v1/properties/${propertyId}/reactivate`,
    { method: "POST", resource: "properties" },
    config
  );
  return data;
}

/**
 * `POST /v1/properties/{propertyId}/clone`
 *
 * Para publicar el mismo inmueble en venta y alquiler a la vez gastando un
 * único hueco. Se crea primero con una operación y se clona con la otra.
 */
export async function cloneProperty(
  propertyId: number,
  operation: IdealistaOperation,
  config?: IdealistaApiConfig
): Promise<IdealistaPropertyResponse> {
  const { data } = await idealistaRequest<IdealistaPropertyResponse>(
    `/v1/properties/${propertyId}/clone`,
    { method: "POST", body: { operation }, resource: "properties" },
    config
  );
  return data;
}

/* ────────────────────────── Imágenes ────────────────────────── */

// El PUT de imágenes admite una petición por minuto y por anuncio. Nos lo
// guardamos para avisar antes de que Idealista conteste un 429.
const lastImagePut = new Map<number, number>();

/**
 * `PUT /v1/properties/{propertyId}/images`
 *
 * Es una foto fija completa: **las imágenes que no vayan en el cuerpo se
 * borran**. El orden del array es el orden de publicación (los planos van
 * siempre al final, los pone Idealista).
 */
export async function putImages(
  propertyId: number,
  images: IdealistaImageInput[],
  config?: IdealistaApiConfig
): Promise<void> {
  const last = lastImagePut.get(propertyId);
  if (last && Date.now() - last < 60_000) {
    const waitSec = Math.ceil((60_000 - (Date.now() - last)) / 1000);
    throw new IdealistaApiError(
      `Idealista solo admite una actualización de fotos por minuto y anuncio. Espera ${waitSec}s.`,
      429,
      ""
    );
  }

  await idealistaRequest(
    `/v1/properties/${propertyId}/images`,
    { method: "PUT", body: { images }, resource: "images", timeoutMs: 60_000 },
    config
  );
  lastImagePut.set(propertyId, Date.now());
}

/** `GET /v1/properties/{propertyId}/images` — trae el checksum MD5 del original. */
export async function findImages(
  propertyId: number,
  config?: IdealistaApiConfig
): Promise<IdealistaImageOutput[]> {
  const { data } = await idealistaRequest<{ images?: IdealistaImageOutput[] }>(
    `/v1/properties/${propertyId}/images`,
    { resource: "images" },
    config
  );
  return data?.images ?? [];
}

/** `DELETE /v1/properties/{propertyId}/images` — borra todas las fotos del anuncio. */
export async function deleteAllImages(
  propertyId: number,
  config?: IdealistaApiConfig
): Promise<void> {
  await idealistaRequest(
    `/v1/properties/${propertyId}/images`,
    { method: "DELETE", resource: "images" },
    config
  );
}

/* ────────────────────────── Vídeos ────────────────────────── */

/**
 * `POST /v1/properties/{propertyId}/videos`
 *
 * Máximo 6 por anuncio y 750MB cada uno. Idealista descarga el fichero, así
 * que no valen YouTube/Vimeo: tiene que ser una URL directa.
 */
export async function createVideo(
  propertyId: number,
  video: IdealistaVideoInput,
  config?: IdealistaApiConfig
): Promise<IdealistaVideoOutput> {
  const { data } = await idealistaRequest<IdealistaVideoOutput & { video?: IdealistaVideoOutput }>(
    `/v1/properties/${propertyId}/videos`,
    { method: "POST", body: video, resource: "videos", timeoutMs: 60_000 },
    config
  );
  return data?.video ?? data ?? {};
}

/** `GET /v1/properties/{propertyId}/videos` */
export async function findVideos(
  propertyId: number,
  config?: IdealistaApiConfig
): Promise<IdealistaVideoOutput[]> {
  const { data } = await idealistaRequest<{ videos?: IdealistaVideoOutput[] }>(
    `/v1/properties/${propertyId}/videos`,
    { resource: "videos" },
    config
  );
  return data?.videos ?? [];
}

/** `GET /v1/properties/{propertyId}/videos/{videoId}` */
export async function findVideo(
  propertyId: number,
  videoId: number,
  config?: IdealistaApiConfig
): Promise<IdealistaVideoOutput | null> {
  try {
    const { data } = await idealistaRequest<{ video?: IdealistaVideoOutput } & IdealistaVideoOutput>(
      `/v1/properties/${propertyId}/videos/${videoId}`,
      { resource: "videos" },
      config
    );
    return data?.video ?? data ?? null;
  } catch (err) {
    if (err instanceof IdealistaApiError && err.status === 404) return null;
    throw err;
  }
}

/** `PUT /v1/properties/{propertyId}/videos/{videoId}` */
export async function updateVideo(
  propertyId: number,
  videoId: number,
  video: IdealistaVideoInput,
  config?: IdealistaApiConfig
): Promise<IdealistaVideoOutput> {
  const { data } = await idealistaRequest<IdealistaVideoOutput>(
    `/v1/properties/${propertyId}/videos/${videoId}`,
    { method: "PUT", body: video, resource: "videos", timeoutMs: 60_000 },
    config
  );
  return data ?? {};
}

/** `DELETE /v1/properties/{propertyId}/videos/{videoId}` */
export async function deleteVideo(
  propertyId: number,
  videoId: number,
  config?: IdealistaApiConfig
): Promise<void> {
  await idealistaRequest(
    `/v1/properties/${propertyId}/videos/${videoId}`,
    { method: "DELETE", resource: "videos" },
    config
  );
}

/* ────────────────────────── Tours virtuales ────────────────────────── */

/**
 * `POST /v1/properties/{propertyId}/virtualtours`
 *
 * Hay que pedirle al gestor de cuenta de Idealista que active el servicio; si
 * no, contesta 403. Un tour creado por Idealista no se puede reemplazar.
 */
export async function createVirtualTour(
  propertyId: number,
  url: string,
  config?: IdealistaApiConfig
): Promise<void> {
  await idealistaRequest(
    `/v1/properties/${propertyId}/virtualtours`,
    { method: "POST", body: { url }, resource: "virtualtours" },
    config
  );
}

/** `GET /v1/properties/{propertyId}/virtualtours` */
export async function findVirtualTours(
  propertyId: number,
  config?: IdealistaApiConfig
): Promise<Array<{ url: string }>> {
  const { data } = await idealistaRequest<{ virtualTours?: Array<{ url: string }> }>(
    `/v1/properties/${propertyId}/virtualtours`,
    { resource: "virtualtours" },
    config
  );
  return data?.virtualTours ?? [];
}

/** `POST /v1/properties/{propertyId}/virtualtours/deactivate` */
export async function deactivateVirtualTour(
  propertyId: number,
  url: string,
  config?: IdealistaApiConfig
): Promise<void> {
  await idealistaRequest(
    `/v1/properties/${propertyId}/virtualtours/deactivate`,
    { method: "POST", body: { url }, resource: "virtualtours" },
    config
  );
}

/* ────────────────────────── Cuenta ────────────────────────── */

/**
 * `GET /v1/customer/publishinfo` — anuncios publicados y huecos contratados.
 * Es la llamada más barata para comprobar que credenciales y feedKey valen.
 */
export async function getPublishInfo(config?: IdealistaApiConfig): Promise<IdealistaPublishInfo> {
  const { data } = await idealistaRequest<{ publishInfo?: IdealistaPublishInfo }>(
    "/v1/customer/publishinfo",
    { resource: "publishinfo" },
    config
  );
  return data?.publishInfo ?? { publishedAds: 0, maxPublishedAds: 0 };
}
