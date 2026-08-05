import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { resolveDefaultContactId } from "./contact-resolver";
import { mapListingToIdealistaApiPayload, mapPhotosToIdealistaImages } from "./mapper";
import { createProperty, setPropertyImages, updateProperty } from "./properties";
import { IdealistaApiRequestError } from "./client";

export interface ApiPublishResult {
  success: boolean;
  listingId: string;
  idealistaPropertyId?: number;
  error?: string;
}

function toAbsoluteUrl(url: string, origin: string): string {
  return url.startsWith("http") ? url : `${origin}${url}`;
}

async function setApiState(
  listingId: string,
  state: "pending" | "published" | "failed",
  fields: { idealistaPropertyId?: number; error?: string } = {}
): Promise<void> {
  const db = createAdminClient() as any;
  await db
    .from("idealista_listings")
    .update({
      api_state: state,
      api_idealista_property_id: fields.idealistaPropertyId ?? undefined,
      api_error: fields.error ?? null,
      ...(state === "published" ? { api_published_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);
}

// Publica (o actualiza, si ya tiene api_idealista_property_id) una ficha de
// idealista_listings usando el Partner API real, en paralelo a publisher.ts
// (Playwright) y a publish-link (extensión de Chrome). No se pisan entre sí:
// cada mecanismo escribe su propio estado (idealista_state vs api_state).
export async function publishListingToIdealistaApi(
  listingId: string,
  originForPhotos: string
): Promise<ApiPublishResult> {
  const db = createAdminClient() as any;
  await setApiState(listingId, "pending");

  try {
    const { data: listing } = await db.from("idealista_listings").select("*").eq("id", listingId).single();
    if (!listing) {
      await setApiState(listingId, "failed", { error: "Ficha no encontrada" });
      return { success: false, listingId, error: "Ficha no encontrada" };
    }

    const contactId = await resolveDefaultContactId();
    const photoUrls = ((listing.photo_ids ?? []) as string[]).map((u) => toAbsoluteUrl(u, originForPhotos));
    const payload = mapListingToIdealistaApiPayload(listing, contactId, photoUrls);

    const existingApiId: number | null = listing.api_idealista_property_id ?? null;
    const response = existingApiId
      ? await updateProperty(existingApiId, payload)
      : await createProperty(payload);

    const idealistaPropertyId = response.propertyId;

    if (photoUrls.length > 0) {
      await setPropertyImages(idealistaPropertyId, mapPhotosToIdealistaImages(photoUrls));
    }

    await setApiState(listingId, "published", { idealistaPropertyId });
    return { success: true, listingId, idealistaPropertyId };
  } catch (err) {
    const msg =
      err instanceof IdealistaApiRequestError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[IdealistaApi] publishListingToIdealistaApi error:", msg);
    await setApiState(listingId, "failed", { error: msg });
    return { success: false, listingId, error: msg };
  }
}
