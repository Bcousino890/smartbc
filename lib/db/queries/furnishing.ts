import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import {
  isPublishable,
  resolveTexts,
  toViewerImages,
  type FurnishingImageRow,
  type FurnishingProposalRow,
  type FurnishingTexts,
  type FurnishingViewerImage,
} from "@/lib/furnishing/proposal";

// Propuesta de mobiliario (migración 0235). Las tablas no están en
// database.types.ts, de ahí los `as any` (mismo caso que property_media).

const IMAGE_COLUMNS =
  "id, position, label, room, compare, after_path, after_url, after_width, after_height, before_path, before_url, before_width, before_height";

export type FurnishingAdminData = {
  proposal: FurnishingProposalRow | null;
  images: FurnishingImageRow[];
};

/**
 * Para la ficha del admin (sesión de staff, RLS). Tolerante a fallos: sin la
 * migración 0235 aplicada devuelve vacío y la ficha se abre igual.
 */
export async function getFurnishingForAdmin(propertyId: string): Promise<FurnishingAdminData> {
  try {
    const supabase = (await createClient()) as any;
    const [proposalRes, imagesRes] = await Promise.all([
      supabase
        .from("property_furnishing_proposals")
        .select("status, headline, subtitle, disclaimer")
        .eq("property_id", propertyId)
        .maybeSingle(),
      supabase
        .from("property_furnishing_images")
        .select(IMAGE_COLUMNS)
        .eq("property_id", propertyId)
        .order("position", { ascending: true }),
    ]);
    return {
      proposal: proposalRes.error ? null : (proposalRes.data as FurnishingProposalRow | null),
      images: imagesRes.error ? [] : ((imagesRes.data ?? []) as FurnishingImageRow[]),
    };
  } catch {
    return { proposal: null, images: [] };
  }
}

export type PublicFurnishing = {
  texts: FurnishingTexts;
  images: FurnishingViewerImage[];
};

/**
 * Para el visitante del enlace compartido: el llamador ya resolvió la
 * propiedad con las reglas de su enlace (slug no archivado, o token sin
 * caducar) y pasa SU id; aquí solo se mira esa propiedad. Devuelve null si no
 * hay propuesta publicada con imágenes, o si la tabla aún no existe.
 */
export async function getFurnishingPublic(propertyId: string): Promise<PublicFurnishing | null> {
  try {
    const supabase = createAdminClient() as any;
    const proposalRes = await supabase
      .from("property_furnishing_proposals")
      .select("status, headline, subtitle, disclaimer")
      .eq("property_id", propertyId)
      .eq("status", "published")
      .maybeSingle();
    if (proposalRes.error || !proposalRes.data) return null;
    const imagesRes = await supabase
      .from("property_furnishing_images")
      .select(IMAGE_COLUMNS)
      .eq("property_id", propertyId)
      .order("position", { ascending: true });
    if (imagesRes.error) return null;
    const rows = (imagesRes.data ?? []) as FurnishingImageRow[];
    const proposal = proposalRes.data as FurnishingProposalRow;
    if (!isPublishable(proposal, rows)) return null;
    return { texts: resolveTexts(proposal), images: toViewerImages(rows) };
  } catch {
    return null;
  }
}
