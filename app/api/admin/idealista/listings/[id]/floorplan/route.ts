import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { generateApproximateFloorPlanForListing } from "@/lib/services/properties/floorplan-sketch";

// Distribución APROXIMADA (no un plano medido) de una ficha de "Fichas
// guardadas" — ver lib/services/properties/floorplan-sketch.ts. Se guarda
// como un plano más de la propia ficha (idealista_listings.plan_ids, la
// misma galería que usa el formulario de Idealista en su sección "Videos y
// planos"), no en property_media — esa es la galería de la propiedad, una
// cosa distinta.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const { id } = await params;

  const sketch = await generateApproximateFloorPlanForListing(id);
  if (!sketch.ok) {
    return Response.json({ error: sketch.error }, { status: 502 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const storagePath = `idealista/${id}/plan/${Date.now()}-distribucion-aproximada-ia.png`;
  const { error: uploadErr } = await db.storage
    .from("properties-photos")
    .upload(storagePath, sketch.pngBuffer, { contentType: "image/png", upsert: false });
  if (uploadErr) {
    console.error("[listings/floorplan] storage error:", uploadErr);
    return Response.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: urlData } = db.storage.from("properties-photos").getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl as string;

  const { data: current, error: fetchErr } = await db
    .from("idealista_listings")
    .select("plan_ids")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }

  const nextPlanIds = [...(((current?.plan_ids ?? []) as string[])), publicUrl];
  const { error: updateErr } = await db
    .from("idealista_listings")
    .update({ plan_ids: nextPlanIds })
    .eq("id", id);
  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, url: publicUrl, planIds: nextPlanIds });
}
