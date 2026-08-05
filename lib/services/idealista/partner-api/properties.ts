import "server-only";
import { idealistaApiFetch } from "./client";
import type { IdealistaImage, IdealistaPropertyCreate, IdealistaPropertyResponse } from "./types";

export async function createProperty(payload: IdealistaPropertyCreate): Promise<IdealistaPropertyResponse> {
  const { json } = await idealistaApiFetch("/v1/properties", { method: "POST", body: payload });
  return json;
}

export async function updateProperty(
  propertyId: number,
  payload: Omit<IdealistaPropertyCreate, "code">
): Promise<IdealistaPropertyResponse> {
  const { json } = await idealistaApiFetch(`/v1/properties/${propertyId}`, { method: "PUT", body: payload });
  return json;
}

export async function getProperty(propertyId: number): Promise<any> {
  const { json } = await idealistaApiFetch(`/v1/properties/${propertyId}`);
  return json;
}

export async function deactivateProperty(propertyId: number): Promise<any> {
  const { json } = await idealistaApiFetch(`/v1/properties/${propertyId}/deactivate`, { method: "POST" });
  return json;
}

export async function reactivateProperty(propertyId: number): Promise<any> {
  const { json } = await idealistaApiFetch(`/v1/properties/${propertyId}/reactivate`, { method: "POST" });
  return json;
}

// PUT reemplaza el snapshot completo de imágenes: las que no se incluyan se
// borran del anuncio. El orden del array es el orden de publicación.
export async function setPropertyImages(propertyId: number, images: IdealistaImage[]): Promise<any> {
  const { json } = await idealistaApiFetch(`/v1/properties/${propertyId}/images`, {
    method: "PUT",
    body: { images },
  });
  return json;
}

export async function getPublishInfo(): Promise<{ publishedAds: number; maxPublishedAds: number }> {
  const { json } = await idealistaApiFetch("/v1/customer/publishinfo");
  return json.publishInfo;
}
