import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import {
  cleanDynamicWatermarkPaths,
  publicUrlToStoragePath,
} from "@/lib/sync/watermark-dynamic-paths";

// Opt-in: quita la marca de agua DINÁMICA (la de la agencia de origen) de las
// fotos YA alojadas de una propiedad. Potencialmente destructivo (puede tocar
// fotos sin marca real), por eso NO es automático — el admin lo dispara a mano.
// Requiere el motor /opt/wmrm en el VPS y ≥8 fotos en nuestro storage.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const db = createAdminClient() as any;

  const { data: property } = await db
    .from("properties")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!property) {
    return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const { data: photos } = await db
    .from("property_photos")
    .select("url")
    .eq("property_id", property.id);

  // Solo las fotos que ya están en NUESTRO storage se pueden limpiar (las que
  // conserven su URL de origen porque aún no se re-alojaron se dejan igual).
  const paths = ((photos ?? []) as Array<{ url: string }>)
    .map((p) => publicUrlToStoragePath((p.url ?? "").split("?")[0]))
    .filter((p): p is string => !!p);

  const result = await cleanDynamicWatermarkPaths(paths);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  // Refresca last_synced_at para invalidar la caché del proxy de fotos
  // (/p/{slug}/{idx}) y que se sirvan ya las versiones limpias.
  await db
    .from("properties")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", property.id);

  return Response.json({ ok: true, cleaned: result.cleaned });
}
