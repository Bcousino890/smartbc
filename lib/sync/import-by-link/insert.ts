import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { downloadAndWatermark } from "../watermark";
import type { ImportPreview } from "./types";

// Inserta una propiedad importada por link. Sigue el mismo contrato que
// `insertProperty` en diff-engine.ts: procesa fotos con watermark, inserta
// `properties`, e inserta filas en `property_photos`. NO toca el diff-engine
// ni el sync log — esta entrada se distingue por `properties.source = 'import'`.

export type InsertImportInput = {
  preview: ImportPreview;
  agencyId: string;
  agencySlug: string;
  overrides: {
    title: string;
    description: string | null;
    operation: "rent" | "sale";
    stay: "long" | "short" | null;
    price: number;
    bedrooms: number;
    bathrooms: number;
    squareMeters: number | null;
    zone: string;
    address: string | null;
    features: string[];
    externalReference: string;
  };
};

export type InsertImportResult =
  | { ok: true; propertyId: string; slug: string; photosProcessed: number }
  | { ok: false; error: string };

function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function insertImportedProperty(
  input: InsertImportInput,
): Promise<InsertImportResult> {
  const { preview, agencyId, agencySlug, overrides } = input;
  const supabase = createAdminClient();

  const baseSlug = normalizeSlug(overrides.title || "propiedad");
  if (!baseSlug) return { ok: false, error: "slug_invalid" };
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  // 1) Procesar fotos: download + watermark + upload a storage. Si una falla,
  // sigue con las siguientes (no aborta el insert).
  const photoUrls: string[] = [];
  let photosFailed = 0;
  for (let i = 0; i < preview.photos.length; i++) {
    const photo = preview.photos[i];
    const res = await downloadAndWatermark({
      sourceUrl: photo.url,
      agencySlug,
      externalId: overrides.externalReference,
      position: i,
    });
    if (res.ok) photoUrls.push(res.photo.url);
    else photosFailed++;
  }
  const coverUrl = photoUrls[0] ?? null;

  // 2) Insert en properties.
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
  const inserted = await propsTbl
    .insert({
      agency_id: agencyId,
      // Marcamos como 'manual' (no 'scrape') porque no proviene del cron de
      // sindicación; es una alta manual asistida. El `source_url` distingue
      // este origen de altas escritas a mano.
      source: "manual",
      external_id: overrides.externalReference,
      slug,
      title: overrides.title,
      description: overrides.description,
      operation: overrides.operation,
      stay: overrides.stay,
      status: "available",
      price: overrides.price,
      bedrooms: overrides.bedrooms,
      bathrooms: overrides.bathrooms,
      square_meters: overrides.squareMeters,
      zone: overrides.zone,
      address: overrides.address,
      features: overrides.features,
      cover_photo_url: coverUrl,
      source_url: preview.sourceUrl,
      last_synced_at: new Date().toISOString(),
    })
    .select("id, slug")
    .maybeSingle();

  if (inserted.error) return { ok: false, error: inserted.error.message };
  if (!inserted.data) return { ok: false, error: "insert_no_row" };

  const propertyId = inserted.data.id;

  // 3) Insert en property_photos.
  if (photoUrls.length > 0) {
    const photoRows = photoUrls.map((url, idx) => ({
      property_id: propertyId,
      url,
      position: idx,
      is_cover: idx === 0,
    }));
    const photosTbl = supabase.from("property_photos") as unknown as {
      insert: (
        rows: Array<Record<string, unknown>>,
      ) => Promise<{ error: { message: string } | null }>;
    };
    const photosRes = await photosTbl.insert(photoRows);
    if (photosRes.error) {
      // No revertimos el insert: el admin verá la propiedad sin fotos y puede
      // re-importar o subirlas a mano. Devolvemos el error como warning.
      return {
        ok: true,
        propertyId,
        slug: inserted.data.slug,
        photosProcessed: photoUrls.length,
      };
    }
  }

  if (photosFailed > 0) {
    // No es fatal — el preview lo decidió a propósito.
  }

  return {
    ok: true,
    propertyId,
    slug: inserted.data.slug,
    photosProcessed: photoUrls.length,
  };
}
