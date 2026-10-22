import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { effectivePhotos, type EffectivePhotos, type PhotoInput, type PhotoPrefs } from "./photo-selection";

// ============================================================================
// Fotos y ajustes de fotos de un catálogo, leídos para la GESTIÓN (BCP-01 E3).
// Solo lectura. Lee la tabla de ajustes ENTERA (también los de fotos borradas
// o reimportadas, para avisar: corrección 2 de D-QA19) y aplica la regla única
// (photo-selection.ts). Las claves se calculan igual que catalog_photo_key.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

/** La misma clave que catalog_photo_key (0202) y el proxy /p (?f=). */
export function photoKeyOf(photoId: string): string {
  return createHash("md5").update(`catalog-photo:${photoId}`).digest("hex").slice(0, 16);
}

export interface PropertyPhotoData {
  /** Para la regla única: en el orden de la instantánea (position, id). */
  input: PhotoInput[];
  prefs: PhotoPrefs;
  /** Clave → id de la fila (para las acciones de la gestión). */
  idByKey: Map<string, string>;
  /** Ajustes que ya no aplican, por id (la foto ya no existe). */
  staleIds: { excluded: string[]; opening: string | null };
  eff: EffectivePhotos;
}

/** Fotos y ajustes de unas viviendas en un catálogo. Sin catálogo (búsqueda
 *  de viviendas que aún no están), los ajustes van vacíos. */
export async function catalogPhotoData(catalogId: string | null, propertyIds: string[]): Promise<Map<string, PropertyPhotoData>> {
  const out = new Map<string, PropertyPhotoData>();
  const ids = [...new Set(propertyIds)];
  if (ids.length === 0) return out;
  const { data: photos } = await db()
    .from("property_photos")
    .select("id, property_id, url, position, is_cover, source_width, source_height, class_override, ai_class, ai_confidence")
    .in("property_id", ids)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  const prefsRows = catalogId
    ? (((await db().from("catalog_photo_prefs").select("property_id, photo_id, kind").eq("catalog_id", catalogId).in("property_id", ids)).data ?? []) as any[])
    : [];
  const byProp = new Map<string, any[]>(ids.map((id) => [id, []]));
  for (const ph of (photos ?? []) as any[]) byProp.get(ph.property_id)?.push(ph);
  for (const pid of ids) {
    const rows = byProp.get(pid) ?? [];
    const idByKey = new Map<string, string>();
    const input: PhotoInput[] = rows
      .filter((ph) => typeof ph?.url === "string" && ph.url)
      .map((ph) => {
        const f = photoKeyOf(ph.id);
        idByKey.set(f, ph.id);
        const k = ph.class_override ?? ((ph.ai_confidence ?? 0) >= 0.75 ? ph.ai_class : null);
        return { u: createHash("md5").update(ph.url).digest("hex"), f, w: ph.source_width ?? null, h: ph.source_height ?? null, c: ph.is_cover === true, k };
      });
    const existing = new Set(rows.map((r) => r.id));
    const mine = prefsRows.filter((r) => r.property_id === pid);
    const prefs: PhotoPrefs = {
      x: mine.filter((r) => r.kind === "exclude").map((r) => photoKeyOf(r.photo_id)),
      o: mine.find((r) => r.kind === "opening") ? photoKeyOf(mine.find((r) => r.kind === "opening").photo_id) : null,
      // PR7b (0227): «Sin acabado en esta foto» (la gestión las ve siempre;
      // la instantánea, solo con el acabado activo).
      n: mine.filter((r) => r.kind === "no_finish").map((r) => photoKeyOf(r.photo_id)),
    };
    const staleOpening = mine.find((r) => r.kind === "opening" && !existing.has(r.photo_id));
    out.set(pid, {
      input,
      prefs,
      idByKey,
      staleIds: {
        excluded: mine.filter((r) => r.kind === "exclude" && !existing.has(r.photo_id)).map((r) => r.photo_id),
        opening: staleOpening ? staleOpening.photo_id : null,
      },
      eff: effectivePhotos(input, prefs),
    });
  }
  return out;
}
