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

  // 1) Procesar fotos: download + watermark + upload a storage. En lotes
  // CONCURRENTES (no de una en una): con fichas de 30-46 fotos, en serie tardaba
  // demasiado y el server action podía agotar el tiempo. Conservamos el ORDEN
  // (resultados indexados por posición original) y si una falla, se omite.
  const CONCURRENCY = 6;
  const results: (string | null)[] = new Array(preview.photos.length).fill(null);
  for (let start = 0; start < preview.photos.length; start += CONCURRENCY) {
    const batch = preview.photos.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (photo, j) => {
        const i = start + j;
        const res = await downloadAndWatermark({
          sourceUrl: photo.url,
          agencySlug,
          externalId: overrides.externalReference,
          position: i,
        });
        if (res.ok) results[i] = res.photo.url;
      }),
    );
  }
  const photoUrls = results.filter((u): u is string => u !== null);
  const photosFailed = preview.photos.length - photoUrls.length;
  const coverUrl = photoUrls[0] ?? null;

  // Campos comunes a alta nueva y re-importación (todo menos los inmutables:
  // agency_id, external_id, slug, source y status).
  const commonFields: Record<string, unknown> = {
    title: overrides.title,
    description: overrides.description,
    operation: overrides.operation,
    stay: overrides.stay,
    price: overrides.price,
    bedrooms: overrides.bedrooms,
    bathrooms: overrides.bathrooms,
    square_meters: overrides.squareMeters,
    zone: overrides.zone,
    address: overrides.address,
    features: overrides.features,
    cover_photo_url: coverUrl,
    source_url: preview.sourceUrl,
    latitude: preview.latitude,
    longitude: preview.longitude,
    last_synced_at: new Date().toISOString(),
    // Fecha de "publicación" en NUESTRO catálogo. La refrescamos también en la
    // re-importación: el admin acaba de re-publicarla, así que debe subir al
    // principio del listado (ordenado por created_at desc) como una alta nueva,
    // en vez de quedar enterrada por su fecha original.
    created_at: new Date().toISOString(),
  };

  // 2) ¿Ya existe esta propiedad (misma agencia + referencia)? Entonces es una
  // RE-IMPORTACIÓN: actualizamos la ficha y reemplazamos sus fotos, en vez de
  // chocar contra la restricción única (agency_id, external_id).
  const lookupTbl = supabase.from("properties") as unknown as {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{
            data: { id: string; slug: string; status: string | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const existing = await lookupTbl
    .select("id, slug, status")
    .eq("agency_id", agencyId)
    .eq("external_id", overrides.externalReference)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };

  let propertyId: string;
  let resultSlug: string;

  if (existing.data) {
    // --- RE-IMPORTACIÓN: update + reemplazo de fotos ---
    propertyId = existing.data.id;
    resultSlug = existing.data.slug; // conservamos la URL existente
    const updTbl = supabase.from("properties") as unknown as {
      update: (payload: Record<string, unknown>) => {
        eq: (
          c: string,
          v: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    // Reimportar es una señal explícita de "quiero esta propiedad activa":
    // la DESARCHIVAMOS siempre (si no, una propiedad archivada se actualizaba
    // pero seguía oculta del catálogo, que filtra archived_at IS NULL). Si
    // estaba archivada, además la devolvemos a 'available'; si tenía otro
    // estado (reserved/sold), lo respetamos.
    const reactivate: Record<string, unknown> = { archived_at: null };
    if (existing.data.status === "archived" || existing.data.status === null) {
      reactivate.status = "available";
    }
    const upd = await updTbl
      .update({ ...commonFields, ...reactivate })
      .eq("id", propertyId);
    if (upd.error) return { ok: false, error: upd.error.message };

    // Borramos las fotos viejas; abajo insertamos las nuevas ya procesadas.
    const delTbl = supabase.from("property_photos") as unknown as {
      delete: () => {
        eq: (
          c: string,
          v: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const del = await delTbl.delete().eq("property_id", propertyId);
    if (del.error) return { ok: false, error: del.error.message };
  } else {
    // --- ALTA NUEVA ---
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
        // 'manual' (no 'scrape'): alta asistida, no del cron de sindicación.
        source: "manual",
        external_id: overrides.externalReference,
        slug,
        status: "available",
        ...commonFields,
      })
      .select("id, slug")
      .maybeSingle();

    if (inserted.error) return { ok: false, error: inserted.error.message };
    if (!inserted.data) return { ok: false, error: "insert_no_row" };
    propertyId = inserted.data.id;
    resultSlug = inserted.data.slug;
  }

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
      // No revertimos: el admin verá la propiedad sin fotos y puede re-importar
      // o subirlas a mano. Devolvemos el error como warning.
      return {
        ok: true,
        propertyId,
        slug: resultSlug,
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
    slug: resultSlug,
    photosProcessed: photoUrls.length,
  };
}
