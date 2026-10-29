"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import { checkPermission } from "@/lib/auth/guard";
import {
  FURNISHING_IMAGE_TYPES,
  FURNISHING_MAX_BYTES,
  validatePair,
  type FurnishingImageRow,
  type FurnishingProposalRow,
} from "@/lib/furnishing/proposal";

// Propuesta de mobiliario de una propiedad (migración 0235). Mismo modelo que
// fotos y planos: permiso properties/edit + staff, y la sesión del usuario
// contra la RLS de staff (tablas y bucket properties-photos).
//
// La subida de la pareja de imágenes entra por
// /api/admin/properties/upload/furnishing (fuera del middleware, ver la ruta):
// un server action se cortaría a 10 MB.

const IMAGE_COLUMNS =
  "id, position, label, room, compare, after_path, after_url, after_width, after_height, before_path, before_url, before_width, before_height";

type Fail = { ok: false; error: string };
export type UploadFurnishingResult = { ok: true; item: FurnishingImageRow } | Fail;
export type FurnishingMutationResult = { ok: true } | Fail;
export type SaveFurnishingProposalResult = { ok: true; proposal: FurnishingProposalRow } | Fail;

type Ctx = { supabase: any; propertyId: string; userId: string };

async function gate(slug: string, country?: string): Promise<{ ok: true; ctx: Ctx } | Fail> {
  const perm = await checkPermission("properties", "edit", { country });
  if (!perm.ok) return perm;
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;
  if (!slug) return { ok: false, error: "slug_required" };
  const { data } = await supabase.from("properties").select("id").eq("slug", slug).maybeSingle();
  const prop = data as { id: string } | null;
  if (!prop) return { ok: false, error: "property_not_found" };
  return { ok: true, ctx: { supabase: supabase as any, propertyId: prop.id, userId: auth.userId } };
}

function revalidate(slug: string) {
  revalidatePath(`/admin/propiedades/${slug}`);
}

async function measure(buf: ArrayBuffer): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    // autoOrient: una foto vertical de móvil con EXIF guarda ancho/alto girados.
    const meta = await sharp(Buffer.from(buf), { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return null;
    const rotated = (meta.orientation ?? 1) >= 5;
    return rotated ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

function checkFile(file: FormDataEntryValue | null, what: string): File | Fail | null {
  if (file === null || (file instanceof File && file.size === 0)) return null;
  if (!(file instanceof File)) return { ok: false, error: `${what}: archivo no válido.` };
  if (!(FURNISHING_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: `${what}: usa JPG, PNG o WebP.` };
  }
  if (file.size > FURNISHING_MAX_BYTES) return { ok: false, error: `${what}: máximo 30 MB.` };
  return file;
}

/**
 * Una imagen de la propuesta: `after` (obligatoria) y `before` (la foto
 * actual de la misma toma, opcional si no se compara). Se guarda como UNA fila
 * con id propio; los nombres de archivo no se usan como vínculo.
 */
export async function uploadFurnishingPair(formData: FormData): Promise<UploadFurnishingResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const country = String(formData.get("country") ?? "") || undefined;
  const g = await gate(slug, country);
  if (!g.ok) return g;
  const { supabase, propertyId, userId } = g.ctx;

  const after = checkFile(formData.get("after"), "Propuesta");
  if (after && "ok" in after) return after;
  const before = checkFile(formData.get("before"), "Fotografía actual");
  if (before && "ok" in before) return before;

  const label = String(formData.get("label") ?? "").trim().slice(0, 120);
  const room = String(formData.get("room") ?? "").trim().slice(0, 60);
  const compare = String(formData.get("compare") ?? "true") === "true";

  const afterBuf = after ? await after.arrayBuffer() : null;
  const beforeBuf = before ? await before.arrayBuffer() : null;
  const afterSize = afterBuf ? await measure(afterBuf) : null;
  const beforeSize = beforeBuf ? await measure(beforeBuf) : null;
  if (after && !afterSize) return { ok: false, error: "No se pudo leer la imagen de la propuesta." };
  if (before && !beforeSize) return { ok: false, error: "No se pudo leer la fotografía actual." };

  const valid = validatePair({ label, room, compare, after: afterSize, before: beforeSize });
  if (!valid.ok) return valid;

  const stamp = Date.now();
  const safe = (f: File) => f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const afterPath = `${propertyId}/propuesta/${stamp}-despues-${safe(after!)}`;
  const beforePath = before ? `${propertyId}/propuesta/${stamp}-antes-${safe(before)}` : null;
  const bucket = supabase.storage.from("properties-photos");

  const uploaded: string[] = [];
  const cleanup = async () => {
    if (uploaded.length) await bucket.remove(uploaded).catch(() => undefined);
  };
  for (const [path, buf, file] of [
    [afterPath, afterBuf, after],
    [beforePath, beforeBuf, before],
  ] as const) {
    if (!path || !buf || !file) continue;
    const { error } = await bucket.upload(path, buf, { contentType: file.type, upsert: false });
    if (error) {
      console.error("[uploadFurnishingPair] storage error:", error);
      await cleanup();
      return { ok: false, error: error.message };
    }
    uploaded.push(path);
  }

  const last = await supabase
    .from("property_furnishing_images")
    .select("position")
    .eq("property_id", propertyId)
    .order("position", { ascending: false })
    .limit(1);
  const position = ((last.data as Array<{ position: number }> | null)?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("property_furnishing_images")
    .insert({
      property_id: propertyId,
      position,
      label,
      room,
      compare: compare && !!before,
      after_path: afterPath,
      after_url: bucket.getPublicUrl(afterPath).data.publicUrl,
      after_width: afterSize!.width,
      after_height: afterSize!.height,
      before_path: beforePath,
      before_url: beforePath ? bucket.getPublicUrl(beforePath).data.publicUrl : null,
      before_width: beforeSize?.width ?? null,
      before_height: beforeSize?.height ?? null,
      created_by: userId,
    })
    .select(IMAGE_COLUMNS)
    .single();
  if (error) {
    console.error("[uploadFurnishingPair] insert error:", error);
    await cleanup();
    return { ok: false, error: error.message };
  }

  revalidate(slug);
  return { ok: true, item: data as FurnishingImageRow };
}

/** Nombre, estancia y «comparar» de una imagen ya cargada. */
export async function updateFurnishingImage(
  slug: string,
  imageId: string,
  patch: { label: string; room: string; compare: boolean },
  country?: string,
): Promise<FurnishingMutationResult> {
  const g = await gate(slug, country);
  if (!g.ok) return g;
  const { supabase, propertyId } = g.ctx;

  const { data: current } = await supabase
    .from("property_furnishing_images")
    .select("after_width, after_height, before_width, before_height")
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!current) return { ok: false, error: "image_not_found" };
  const before =
    current.before_width && current.before_height
      ? { width: current.before_width, height: current.before_height }
      : null;
  const label = patch.label.trim().slice(0, 120);
  const room = patch.room.trim().slice(0, 60);
  const valid = validatePair({
    label,
    room,
    compare: patch.compare,
    after: { width: current.after_width, height: current.after_height },
    before,
  });
  if (!valid.ok) return valid;

  const { error } = await supabase
    .from("property_furnishing_images")
    .update({ label, room, compare: patch.compare })
    .eq("id", imageId)
    .eq("property_id", propertyId);
  if (error) return { ok: false, error: error.message };
  revalidate(slug);
  return { ok: true };
}

/** Nuevo orden: la lista completa de ids de la propuesta. */
export async function reorderFurnishingImages(
  slug: string,
  orderedIds: string[],
  country?: string,
): Promise<FurnishingMutationResult> {
  const g = await gate(slug, country);
  if (!g.ok) return g;
  const { supabase, propertyId } = g.ctx;

  const { data } = await supabase
    .from("property_furnishing_images")
    .select("id")
    .eq("property_id", propertyId);
  const ids = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id))) {
    return { ok: false, error: "La lista ha cambiado. Recarga la ficha." };
  }
  for (const [position, id] of orderedIds.entries()) {
    const { error } = await supabase
      .from("property_furnishing_images")
      .update({ position })
      .eq("id", id)
      .eq("property_id", propertyId);
    if (error) return { ok: false, error: error.message };
  }
  revalidate(slug);
  return { ok: true };
}

export async function deleteFurnishingImage(
  slug: string,
  imageId: string,
  country?: string,
): Promise<FurnishingMutationResult> {
  const g = await gate(slug, country);
  if (!g.ok) return g;
  const { supabase, propertyId } = g.ctx;

  const { data: row } = await supabase
    .from("property_furnishing_images")
    .select("after_path, before_path")
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!row) return { ok: false, error: "image_not_found" };

  const { error } = await supabase
    .from("property_furnishing_images")
    .delete()
    .eq("id", imageId)
    .eq("property_id", propertyId);
  if (error) return { ok: false, error: error.message };
  // Después de borrar la fila: si falla el storage queda un archivo huérfano,
  // nunca una fila apuntando a un archivo que ya no existe.
  const paths = [row.after_path, row.before_path].filter(Boolean) as string[];
  await supabase.storage.from("properties-photos").remove(paths).catch(() => undefined);

  revalidate(slug);
  return { ok: true };
}

/** Estado (borrador/publicada) y textos del visor. Texto vacío = el de por defecto. */
export async function saveFurnishingProposal(
  slug: string,
  input: { status: "draft" | "published"; headline: string; subtitle: string; disclaimer: string },
  country?: string,
): Promise<SaveFurnishingProposalResult> {
  const g = await gate(slug, country);
  if (!g.ok) return g;
  const { supabase, propertyId, userId } = g.ctx;
  if (input.status !== "draft" && input.status !== "published") {
    return { ok: false, error: "status_invalido" };
  }

  if (input.status === "published") {
    const { count } = await supabase
      .from("property_furnishing_images")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId);
    if (!count) return { ok: false, error: "Añade al menos una imagen antes de publicar." };
  }

  const clean = (v: string, max: number) => (v.trim() ? v.trim().slice(0, max) : null);
  const { data: prev } = await supabase
    .from("property_furnishing_proposals")
    .select("status, published_at")
    .eq("property_id", propertyId)
    .maybeSingle();
  const publishedAt =
    input.status === "published"
      ? prev?.status === "published" && prev.published_at
        ? prev.published_at
        : new Date().toISOString()
      : null;

  const { data, error } = await supabase
    .from("property_furnishing_proposals")
    .upsert(
      {
        property_id: propertyId,
        status: input.status,
        headline: clean(input.headline, 140),
        subtitle: clean(input.subtitle, 400),
        disclaimer: clean(input.disclaimer, 400),
        published_at: publishedAt,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "property_id" },
    )
    .select("status, headline, subtitle, disclaimer")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidate(slug);
  return { ok: true, proposal: data as FurnishingProposalRow };
}
