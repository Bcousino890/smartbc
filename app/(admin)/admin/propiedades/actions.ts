"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import type { Operation, StayType } from "@/lib/types";

export type CreatePropertyInput = {
  title: string;
  slug?: string;
  agencySlug: string;
  operation: Operation;
  stayType?: StayType;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareMeters?: number;
  zone: string;
  address?: string;
  description?: string;
  externalReference?: string;
};

export type CreatePropertyResult =
  | { ok: true; slug: string; id: string }
  | { ok: false; error: string };

function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createProperty(
  input: CreatePropertyInput,
): Promise<CreatePropertyResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  const title = input.title.trim();
  if (!title) return { ok: false, error: "title_required" };

  // Slug: si no llega lo derivamos del título; añadimos un sufijo corto para
  // evitar colisiones cuando varias propiedades comparten título.
  const baseSlug = normalizeSlug(input.slug?.trim() || title);
  if (!baseSlug) return { ok: false, error: "slug_required" };
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  // Resolver agencia desde su slug.
  const agencyLookup = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", input.agencySlug)
    .maybeSingle();
  const agencyRow = agencyLookup.data as { id: string } | null;
  if (!agencyRow) return { ok: false, error: "agency_not_found" };

  // supabase-js no infiere bien Insert tras chains tipadas — bypass puntual.
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

  const insertResult = await propsTbl
    .insert({
      title,
      slug,
      agency_id: agencyRow.id,
      source: "manual",
      external_id: input.externalReference?.trim() || null,
      operation: input.operation === "alquiler" ? "rent" : "sale",
      stay: input.stayType
        ? input.stayType === "corta"
          ? "short"
          : "long"
        : null,
      status: "available",
      price: input.price,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      square_meters: input.squareMeters ?? null,
      zone: input.zone.trim(),
      address: input.address?.trim() || null,
      description: input.description?.trim() || null,
    })
    .select("id, slug")
    .maybeSingle();

  if (insertResult.error) {
    return { ok: false, error: insertResult.error.message };
  }
  if (!insertResult.data) return { ok: false, error: "insert_no_row" };

  revalidatePath("/admin/propiedades");
  revalidatePath(`/admin/agencias/${input.agencySlug}`);
  return { ok: true, slug: insertResult.data.slug, id: insertResult.data.id };
}

export type ArchivePropertyInput = { slug: string };

export type ArchivePropertyResult =
  | { ok: true }
  | { ok: false; error: string };

export type UploadPropertyPhotoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadPropertyPhoto(
  formData: FormData,
): Promise<UploadPropertyPhotoResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  const slug = String(formData.get("slug") ?? "").trim();
  const file = formData.get("file");
  const isCoverRaw = String(formData.get("isCover") ?? "false");
  const isCover = isCoverRaw === "true";

  if (!slug) return { ok: false, error: "slug_required" };
  if (!(file instanceof File)) return { ok: false, error: "file_required" };
  if (file.size === 0) return { ok: false, error: "file_empty" };

  // Buscar la propiedad por slug para tener su id (UUID).
  const propLookup = await supabase
    .from("properties")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const propRow = propLookup.data as { id: string } | null;
  if (!propRow) return { ok: false, error: "property_not_found" };

  // Path: {property_id}/{timestamp}-{filename}. Mantiene fotos agrupadas por
  // propiedad y evita colisiones cuando el admin sube dos archivos con el
  // mismo nombre original.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${propRow.id}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const uploadResult = await supabase.storage
    .from("properties-photos")
    .upload(path, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadResult.error) {
    return { ok: false, error: uploadResult.error.message };
  }

  const { data: urlData } = supabase.storage
    .from("properties-photos")
    .getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  // Insertar referencia en property_photos. Posición incremental.
  const positionLookup = await supabase
    .from("property_photos")
    .select("position")
    .eq("property_id", propRow.id)
    .order("position", { ascending: false })
    .limit(1);
  const lastPos =
    ((positionLookup.data as Array<{ position: number }> | null)?.[0]
      ?.position ?? -1) + 1;

  const photosTbl = supabase.from("property_photos") as unknown as {
    insert: (
      payload: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  };

  const photoInsert = await photosTbl.insert({
    property_id: propRow.id,
    url: publicUrl,
    position: lastPos,
    is_cover: isCover,
  });
  if (photoInsert.error) {
    return { ok: false, error: photoInsert.error.message };
  }

  // Si es cover, además guardarla en properties.cover_photo_url.
  if (isCover) {
    const propsTbl = supabase.from("properties") as unknown as {
      update: (payload: Record<string, unknown>) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    await propsTbl
      .update({ cover_photo_url: publicUrl })
      .eq("id", propRow.id);
  }

  revalidatePath("/admin/propiedades");
  revalidatePath(`/admin/propiedades/${slug}`);
  return { ok: true, url: publicUrl };
}

export type DeletePropertyPhotoInput = {
  slug: string;
  photoUrl: string;
};

export type DeletePropertyPhotoResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deletePropertyPhoto(
  input: DeletePropertyPhotoInput,
): Promise<DeletePropertyPhotoResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  const propLookup = await supabase
    .from("properties")
    .select("id, cover_photo_url")
    .eq("slug", input.slug)
    .maybeSingle();
  const propRow = propLookup.data as
    | { id: string; cover_photo_url: string | null }
    | null;
  if (!propRow) return { ok: false, error: "property_not_found" };

  // Storage path = todo después de '/storage/v1/object/public/properties-photos/'.
  const marker = "/properties-photos/";
  const idx = input.photoUrl.indexOf(marker);
  if (idx === -1) return { ok: false, error: "bad_photo_url" };
  const path = input.photoUrl.slice(idx + marker.length);

  await supabase.storage.from("properties-photos").remove([path]);

  const photosTbl = supabase.from("property_photos") as unknown as {
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const delResult = await photosTbl.delete().eq("url", input.photoUrl);
  if (delResult.error) {
    return { ok: false, error: delResult.error.message };
  }

  // Si la foto borrada era la cover, limpiar el campo en properties.
  if (propRow.cover_photo_url === input.photoUrl) {
    const propsTbl = supabase.from("properties") as unknown as {
      update: (payload: Record<string, unknown>) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    await propsTbl.update({ cover_photo_url: null }).eq("id", propRow.id);
  }

  revalidatePath("/admin/propiedades");
  return { ok: true };
}

export type UpdatePropertyInput = {
  slug: string;
  // Campos sindicados: si la propiedad viene de una agencia (source='scrape')
  // estos se sobrescriben en el siguiente sync. Para manuales son definitivos.
  // `null` (donde aplica) significa "limpiar el campo".
  title?: string;
  description?: string | null;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareMeters?: number | null;
  zone?: string;
  address?: string | null;
  status?: "available" | "reserved" | "sold" | "archived";
  features?: string[];
  // Campos internos del admin: el motor de sync NO los toca nunca.
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  internalNotes?: string | null;
};

export type UpdatePropertyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateProperty(
  input: UpdatePropertyInput,
): Promise<UpdatePropertyResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  if (!input.slug) return { ok: false, error: "slug_required" };

  // Solo incluimos los campos que el admin envía (undefined = no tocar).
  // Permitimos null explícito para limpiar un campo opcional.
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined)
    payload.description = input.description?.trim() || null;
  if (input.price !== undefined) payload.price = input.price;
  if (input.bedrooms !== undefined) payload.bedrooms = input.bedrooms;
  if (input.bathrooms !== undefined) payload.bathrooms = input.bathrooms;
  if (input.squareMeters !== undefined)
    payload.square_meters = input.squareMeters;
  if (input.zone !== undefined) payload.zone = input.zone.trim();
  if (input.address !== undefined)
    payload.address = input.address?.trim() || null;
  if (input.status !== undefined) {
    payload.status = input.status;
    // Si pasa a archived, también ponemos archived_at; si se reactiva, lo limpiamos.
    if (input.status === "archived") {
      payload.archived_at = new Date().toISOString();
    } else {
      payload.archived_at = null;
    }
  }
  if (input.features !== undefined) payload.features = input.features;
  if (input.ownerName !== undefined)
    payload.owner_name = input.ownerName?.trim() || null;
  if (input.ownerPhone !== undefined)
    payload.owner_phone = input.ownerPhone?.trim() || null;
  if (input.ownerEmail !== undefined)
    payload.owner_email = input.ownerEmail?.trim() || null;
  if (input.internalNotes !== undefined)
    payload.internal_notes = input.internalNotes?.trim() || null;

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "nothing_to_update" };
  }

  const propsTbl = supabase.from("properties") as unknown as {
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };

  const res = await propsTbl.update(payload).eq("slug", input.slug);
  if (res.error) return { ok: false, error: res.error.message };

  revalidatePath("/admin/propiedades");
  revalidatePath(`/admin/propiedades/${input.slug}`);
  return { ok: true };
}

export async function archiveProperty(
  input: ArchivePropertyInput,
): Promise<ArchivePropertyResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  const propsTbl = supabase.from("properties") as unknown as {
    update: (payload: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };

  const writeResult = await propsTbl
    .update({ archived_at: new Date().toISOString(), status: "archived" })
    .eq("slug", input.slug);

  if (writeResult.error) {
    return { ok: false, error: writeResult.error.message };
  }

  revalidatePath("/admin/propiedades");
  return { ok: true };
}
