import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { apiErrors } from "@/lib/api/errors";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";

/**
 * DELETE /api/v1/captaciones/{external_id}/fotos/{photoId}
 *
 * Borra la fila y también la copia del bucket, para no dejar archivos
 * huérfanos ocupando storage.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "properties-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE = withApiRoute({
  scope: "captaciones:write",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    const photoId = ctx.params.photoId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const column = UUID_RE.test(photoId) ? "id" : "external_id";

    const { data: existing } = await db
      .from("captacion_photos")
      .select("id, storage_path")
      .eq("captacion_id", captacion.id)
      .eq(column, photoId)
      .maybeSingle();

    if (!existing) {
      throw apiErrors.notFound(`No existe la foto "${photoId}" en esta captación`);
    }

    if (!ctx.dryRun) {
      if (existing.storage_path) {
        try {
          await db.storage.from(BUCKET).remove([existing.storage_path]);
        } catch (err) {
          console.error("[api fotos delete storage]", err);
        }
      }
      const { error } = await db.from("captacion_photos").delete().eq("id", existing.id);
      if (error) throw error;
    }

    ctx.counters.total = 1;
    ctx.counters.updated = 1;
    return { data: { id: existing.id, deleted: true, dry_run: ctx.dryRun } };
  },
});
