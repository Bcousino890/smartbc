import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Un enlace a una captación de NUESTRO CRM (…/captaciones?ficha=<id>) se
// convierte en propiedad igual que el botón «Crear propiedad» de Captaciones:
// copia los datos del anuncio que ya tenemos en la base, sin volver a leer el
// portal (que aquí no tendría nada que leer). Mismo criterio que
// createPropertyFromParticular; aquí va con el cliente de servicio porque lo
// usa el proceso automático, que no tiene sesión de usuario.
// ============================================================================

const CRM_HOST = /(^|\.)bcousinoprop\.com$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de la captación si el enlace apunta a una ficha de este CRM; si no, null. */
export function crmParticularIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!CRM_HOST.test(u.hostname) || !u.pathname.includes("/captaciones")) return null;
    const id = u.searchParams.get("ficha") ?? "";
    return UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Crea (o devuelve, si ya existe) la propiedad de una captación del CRM.
 * Idempotente por external_id «particular-<id>», igual que el botón.
 */
export async function propertyFromCrmParticular(
  particularId: string,
): Promise<{ ok: true; propertyId: string; alreadyExisted: boolean } | { ok: false; error: string }> {
  const db = createAdminClient() as any;
  const { data: part } = await db
    .from("particulares")
    .select("id, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, description, features, photos, owner_name, phone, latitude, longitude")
    .eq("id", particularId)
    .maybeSingle();
  if (!part) return { ok: false, error: "La captación no existe en el CRM." };

  const { data: agency } = await db.from("agencies").select("id").eq("slug", "portales-externos").maybeSingle();
  if (!agency) return { ok: false, error: 'No existe la agencia "portales-externos".' };

  const externalId = `particular-${part.id}`;
  const { data: existing } = await db
    .from("properties")
    .select("id")
    .eq("agency_id", agency.id)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing?.id) return { ok: true, propertyId: existing.id, alreadyExisted: true };

  const operation = part.operation === "rent" ? "rent" : "sale";
  const title = `${operation === "rent" ? "Alquiler" : "Venta"} de piso${part.zone ? ` en ${part.zone}` : ""}`;
  const slug = `${normalizeSlug(title) || "propiedad"}-${Math.random().toString(36).slice(2, 6)}`;
  const photos: Array<{ url: string; alt?: string }> = Array.isArray(part.photos) ? part.photos : [];

  const { data: ins, error } = await db
    .from("properties")
    .insert({
      title,
      slug,
      agency_id: agency.id,
      source: "manual",
      external_id: externalId,
      operation,
      status: "available",
      price: part.price ?? 0,
      bedrooms: part.bedrooms ?? 0,
      bathrooms: part.bathrooms ?? 0,
      square_meters: part.square_meters,
      zone: part.zone ?? "Madrid",
      description: part.description,
      features: Array.isArray(part.features) ? part.features : [],
      owner_name: part.owner_name,
      owner_phone: part.phone,
      internal_notes: ["Captado de un anuncio de particular.", part.source_url ? `Anuncio: ${part.source_url}` : null]
        .filter(Boolean)
        .join(" "),
      latitude: part.latitude,
      longitude: part.longitude,
      cover_photo_url: photos[0]?.url ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!ins?.id) return { ok: false, error: "insert_no_row" };

  if (photos.length) {
    await db.from("property_photos").insert(
      photos.map((ph, i) => ({ property_id: ins.id, url: ph.url, alt: ph.alt ?? null, position: i, is_cover: i === 0 })),
    );
  }
  return { ok: true, propertyId: ins.id, alreadyExisted: false };
}
