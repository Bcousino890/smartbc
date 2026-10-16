import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { applyWebPhotos, getWebPhotosOffer, restoreWebPhotos } from "@/lib/particulares/web-photos";

/**
 * Fotos sin marca de agua desde la web de la agencia (lib/particulares/web-photos.ts):
 *  GET  → ¿se ofrece?, fotos de la web, fotos actuales y copia recuperable.
 *  POST {mode: "apply" | "restore"} → reemplaza la galería (copia previa en property_photos_backup) o la restaura.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const gate = await requirePermission("properties", "edit");
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  const offer = await getWebPhotosOffer(slug);
  if (!offer) return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
  return Response.json(offer);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const gate = await requirePermission("properties", "edit");
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const res = body.mode === "restore" ? await restoreWebPhotos(slug, gate.profile.id) : body.mode === "apply" ? await applyWebPhotos(slug, gate.profile.id) : null;
  if (!res) return Response.json({ error: "mode no válido" }, { status: 400 });
  return Response.json(res, { status: res.ok ? 200 : 422 });
}
