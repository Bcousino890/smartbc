import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { isMobiliaImageUrl, toMobiliaOriginal } from "@/lib/sync/scrapers/mobilia";
import { photoKeyOf } from "./photo-data";
import { pickProxyPhoto } from "./photo-selection";

// ============================================================================
// Qué foto se sirve para una propiedad (BCP-01 E3, N1). Compartido por el proxy
// /p/[slug]/[idx] y el PDF del catálogo, para que el PDF lleve EXACTAMENTE la
// imagen que ve el lector:
//   · solo propiedades no archivadas;
//   · con clave `f`, la foto de esa clave o ninguna (nunca otra);
//   · sin clave, la de la posición (deduplicada por URL), como siempre;
//   · Mobilia: primero la variante `-original.jpg` (sin marca), luego la normal.
// ============================================================================

export type PhotoRow = { id: string; url: string; position: number; is_cover: boolean };

type PropertyRow = { id: string; archived_at: string | null; status: string; property_photos: PhotoRow[] | null };

/** La foto de esa propiedad para (idx, f); null si la foto no existe;
 *  "unavailable" si la propiedad no existe o está archivada. */
export async function findPropertyPhoto(slug: string, idx: number, f: string | null): Promise<PhotoRow | null | "unavailable"> {
  const { data } = await createAdminClient()
    .from("properties")
    .select("id, archived_at, status, property_photos(id, url, position, is_cover)")
    .eq("slug", slug)
    .maybeSingle();
  const row = data as unknown as PropertyRow | null;
  if (!row || row.archived_at || row.status === "archived") return "unavailable";
  return pickProxyPhoto(row.property_photos ?? [], idx, f, (r) => photoKeyOf(r.id));
}

/** URLs a probar, en orden (la variante sin marca de Mobilia primero). */
export function photoCandidates(url: string): string[] {
  return isMobiliaImageUrl(url) ? [toMobiliaOriginal(url), url] : [url];
}
