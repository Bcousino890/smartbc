import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import {
  cleanDynamicWatermarkPaths,
  publicUrlToStoragePath,
} from "@/lib/sync/watermark-dynamic-paths";

// Opt-in: quita la marca de agua DINÁMICA (la del portal de origen) de las fotos
// de una inspo YA alojadas en nuestro storage. Es una operación potencialmente
// destructiva (puede tocar fotos sin marca), por eso NO es automática: el usuario
// la dispara a mano desde el botón "Quitar marca de agua".

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "edit")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { listingId } = await req.json().catch(() => ({ listingId: null }));
  if (!listingId || typeof listingId !== "string") {
    return Response.json({ error: "listingId es requerido" }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data: listing } = await db
    .from("idealista_listings")
    .select("id, photo_ids")
    .eq("id", listingId)
    .single();

  if (!listing) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404 });
  }

  const urls: string[] = (listing.photo_ids ?? []) as string[];
  // Solo las fotos que están en NUESTRO storage se pueden limpiar (las que
  // conservan su URL de origen porque falló el re-alojado se dejan como están).
  const pathByUrl = new Map<string, string>();
  for (const u of urls) {
    const p = publicUrlToStoragePath(u.split("?")[0]);
    if (p) pathByUrl.set(u, p);
  }

  const paths = [...pathByUrl.values()];
  const result = await cleanDynamicWatermarkPaths(paths);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  // Cache-bust: las URLs apuntan al mismo path (upsert), así que añadimos ?v=
  // para forzar que la extensión/navegador sirvan la versión limpia.
  const v = Date.now().toString();
  const newUrls = urls.map((u) => {
    if (!pathByUrl.has(u)) return u;
    const base = u.split("?")[0];
    return `${base}?v=${v}`;
  });

  await db
    .from("idealista_listings")
    .update({ photo_ids: newUrls, updated_at: new Date().toISOString() })
    .eq("id", listingId);

  return Response.json({ ok: true, cleaned: result.cleaned });
}
