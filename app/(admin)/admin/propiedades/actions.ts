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
