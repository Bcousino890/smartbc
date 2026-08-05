import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { idealistaApiRequest, IdealistaApiError } from "./api-client";
import { buildPropertyPayload, buildImagesPayload, type IdealistaListingRow } from "./property-payload";

export interface PublishApiResult {
  ok: boolean;
  idealistaPropertyId?: string;
  error?: string;
  details?: string;
  warnings?: string[];
}

async function getListing(listingId: string): Promise<(IdealistaListingRow & { id: string; idealista_property_id: string | null }) | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("idealista_listings").select("*").eq("id", listingId).single();
  return data ?? null;
}

async function setListingState(listingId: string, state: "published" | "failed", idealistaPropertyId?: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  await db
    .from("idealista_listings")
    .update({
      idealista_state: state,
      ...(idealistaPropertyId ? { idealista_property_id: idealistaPropertyId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);
}

/** GET /v1/customer/publishinfo — valida las credenciales y devuelve el estado de la cuenta. */
export async function testIdealistaApiConnection(): Promise<{ ok: boolean; info?: unknown; error?: string }> {
  try {
    const { status, data } = await idealistaApiRequest("read", "/v1/customer/publishinfo");
    if (status >= 200 && status < 300) {
      return { ok: true, info: data };
    }
    return { ok: false, error: extractErrorMessage(data, status) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const msg = (d.message ?? d.error ?? d.detail) as string | undefined;
    if (msg) return `${msg} (HTTP ${status})`;
  }
  if (typeof data === "string" && data) return `${data.slice(0, 300)} (HTTP ${status})`;
  return `Idealista devolvió HTTP ${status}`;
}

/**
 * Publica (crea o actualiza) una ficha por el Partner API real. Si la ficha ya
 * tiene idealista_property_id, hace PUT (update); si no, POST (create) y guarda
 * el id devuelto. Después intenta subir las fotos (no bloqueante: si falla, la
 * propiedad queda creada/actualizada igual, con aviso).
 */
export async function publishListingViaApi(listingId: string): Promise<PublishApiResult> {
  const listing = await getListing(listingId);
  if (!listing) {
    return { ok: false, error: "Ficha no encontrada" };
  }

  let built;
  try {
    built = buildPropertyPayload(listing);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ficha incompleta" };
  }

  const isUpdate = !!listing.idealista_property_id && /^\d+$/.test(listing.idealista_property_id);

  try {
    const { status, data } = await idealistaApiRequest(
      "write",
      isUpdate ? `/v1/properties/${listing.idealista_property_id}` : "/v1/properties",
      { method: isUpdate ? "PUT" : "POST", body: built.payload }
    );

    if (status < 200 || status >= 300) {
      await setListingState(listingId, "failed");
      return { ok: false, error: extractErrorMessage(data, status), details: typeof data === "string" ? data : JSON.stringify(data) };
    }

    const returnedId =
      (data && typeof data === "object" && ((data as Record<string, unknown>).propertyId ?? (data as Record<string, unknown>).id)) ||
      listing.idealista_property_id;
    const idealistaPropertyId = returnedId != null ? String(returnedId) : undefined;

    await setListingState(listingId, "published", idealistaPropertyId);

    const warnings = [...built.warnings];

    // Fotos: no bloqueante — si falla, se avisa pero la propiedad queda publicada.
    if (idealistaPropertyId) {
      const imagesPayload = buildImagesPayload(listing);
      if (imagesPayload) {
        try {
          const imgRes = await idealistaApiRequest("write", `/v1/properties/${idealistaPropertyId}/images`, {
            method: "PUT",
            body: imagesPayload,
          });
          if (imgRes.status < 200 || imgRes.status >= 300) {
            warnings.push(`Fotos no subidas: ${extractErrorMessage(imgRes.data, imgRes.status)}`);
          }
        } catch (err) {
          warnings.push(`Fotos no subidas: ${err instanceof Error ? err.message : "error desconocido"}`);
        }
      } else {
        warnings.push("La ficha no tiene fotos — Idealista puede rechazar o penalizar anuncios sin fotos.");
      }
    }

    return { ok: true, idealistaPropertyId, warnings };
  } catch (err) {
    await setListingState(listingId, "failed");
    if (err instanceof IdealistaApiError) {
      return { ok: false, error: err.message, details: err.details };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

/** POST /v1/properties/{id}/deactivate — baja la ficha de Idealista sin borrarla. */
export async function deactivateListingViaApi(listingId: string): Promise<PublishApiResult> {
  const listing = await getListing(listingId);
  if (!listing?.idealista_property_id) {
    return { ok: false, error: "Esta ficha no tiene un ID de Idealista (no fue publicada por API todavía)." };
  }

  try {
    const { status, data } = await idealistaApiRequest("write", `/v1/properties/${listing.idealista_property_id}/deactivate`, {
      method: "POST",
    });
    if (status < 200 || status >= 300) {
      return { ok: false, error: extractErrorMessage(data, status) };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    await db
      .from("idealista_listings")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", listingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof IdealistaApiError) return { ok: false, error: err.message, details: err.details };
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}
