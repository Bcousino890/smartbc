"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";

export type UpdatePhoneResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateParticularPhone(
  particularId: string,
  phone: string | null,
): Promise<UpdatePhoneResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  if (!particularId) return { ok: false, error: "id_required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("particulares")
    .update({ phone, updated_at: new Date().toISOString() })
    .eq("id", particularId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/particulares");
  return { ok: true };
}

export type CreateFromParticularResult =
  | { ok: true; slug: string; alreadyExisted: boolean }
  | { ok: false; error: string };

function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Convierte un anuncio de particular en una propiedad propia, dentro de la
// agencia "Portales externos" (source=manual). Copia datos, fotos y el contacto
// del propietario (para poder llamarle). Idempotente: si ya se convirtió antes,
// devuelve la propiedad existente en vez de duplicar.
export async function createPropertyFromParticular(
  particularId: string,
): Promise<CreateFromParticularResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;
  if (!particularId) return { ok: false, error: "id_required" };

  // 1) Datos del particular.
  const partRes = await supabase
    .from("particulares")
    .select(
      "id, external_id, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, description, photos, owner_name, phone, latitude, longitude",
    )
    .eq("id", particularId)
    .maybeSingle();
  const part = partRes.data as {
    id: string;
    external_id: string | null;
    source_url: string | null;
    zone: string | null;
    price: number | null;
    operation: "rent" | "sale" | null;
    bedrooms: number | null;
    bathrooms: number | null;
    square_meters: number | null;
    description: string | null;
    photos: Array<{ url: string; alt?: string }> | null;
    owner_name: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  if (!part) return { ok: false, error: "particular_not_found" };

  // 2) Agencia "Portales externos".
  const agencyRes = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", "portales-externos")
    .maybeSingle();
  const agency = agencyRes.data as { id: string } | null;
  if (!agency) return { ok: false, error: "agency_not_found" };

  // external_id estable para idempotencia: si ya existe la propiedad de este
  // particular, devolvemos la suya (evita el duplicate-key y dobles clics).
  const externalId = `particular-${part.id}`;
  const existing = await supabase
    .from("properties")
    .select("slug")
    .eq("agency_id", agency.id)
    .eq("external_id", externalId)
    .maybeSingle();
  const existingRow = existing.data as unknown as { slug: string } | null;
  if (existingRow?.slug) {
    return { ok: true, slug: existingRow.slug, alreadyExisted: true };
  }

  const operation = part.operation === "rent" ? "rent" : "sale";
  const opLabel = operation === "rent" ? "Alquiler" : "Venta";
  const title = `${opLabel} de piso${part.zone ? ` en ${part.zone}` : ""}`;
  const slug = `${normalizeSlug(title) || "propiedad"}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const cover = part.photos?.[0]?.url ?? null;
  const notes = [
    "Captado de un anuncio de particular.",
    part.source_url ? `Anuncio: ${part.source_url}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  // 3) Crear la propiedad.
  const propsTbl = supabase.from("properties") as unknown as {
    insert: (payload: Record<string, unknown>) => {
      select: (cols: string) => {
        maybeSingle: () => Promise<{
          data: { id: string; slug: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const ins = await propsTbl
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
      owner_name: part.owner_name,
      owner_phone: part.phone,
      internal_notes: notes,
      latitude: part.latitude,
      longitude: part.longitude,
      cover_photo_url: cover,
    })
    .select("id, slug")
    .maybeSingle();
  if (ins.error) return { ok: false, error: ins.error.message };
  if (!ins.data) return { ok: false, error: "insert_no_row" };

  // 4) Copiar las fotos (referenciando las URLs del anuncio; uso interno).
  const photos = part.photos ?? [];
  if (photos.length > 0) {
    const photosTbl = supabase.from("property_photos") as unknown as {
      insert: (
        payload: Array<Record<string, unknown>>,
      ) => Promise<{ error: { message: string } | null }>;
    };
    await photosTbl.insert(
      photos.map((ph, i) => ({
        property_id: ins.data!.id,
        url: ph.url,
        alt: ph.alt ?? null,
        position: i,
        is_cover: i === 0,
      })),
    );
  }

  revalidatePath("/admin/propiedades");
  revalidatePath("/admin/agencias/portales-externos");
  return { ok: true, slug: ins.data.slug, alreadyExisted: false };
}

export type BulkActionResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

export async function markParticularAsVerified(
  particularIds: string[],
): Promise<BulkActionResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  if (!particularIds || particularIds.length === 0) {
    return { ok: false, error: "no_ids" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, data } = await (supabase as any)
    .from("particulares")
    .update({
      phone_verified: true,
      updated_at: new Date().toISOString(),
    })
    .in("id", particularIds)
    .select("id");

  if (error) return { ok: false, error: error.message };

  const updated = (data as { id: string }[])?.length ?? 0;
  revalidatePath("/admin/particulares");
  return { ok: true, updated };
}

export async function rescrapeParticularPhones(
  particularIds: string[],
): Promise<BulkActionResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  if (!particularIds || particularIds.length === 0) {
    return { ok: false, error: "no_ids" };
  }

  // Mark as needing re-scrape by resetting phone and phone_verified
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, data } = await (supabase as any)
    .from("particulares")
    .update({
      phone: null,
      phone_verified: false,
      updated_at: new Date().toISOString(),
    })
    .in("id", particularIds)
    .select("id");

  if (error) return { ok: false, error: error.message };

  const updated = (data as { id: string }[])?.length ?? 0;
  revalidatePath("/admin/particulares");
  return { ok: true, updated };
}
