import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { apiErrors } from "@/lib/api/errors";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { resolveListing } from "./resolve";

/**
 * DELETE /api/v1/captaciones/{external_id}/avisos/{listingId}
 *
 * Da de baja un aviso de corredora (por ejemplo, porque ya no está publicado).
 * El histórico de precios cae con él por ON DELETE CASCADE.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withApiRoute({
  scope: "captaciones:write",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const listing = await resolveListing(db, captacion.id, ctx.params.listingId);
    if (!listing) {
      throw apiErrors.notFound(`No existe el aviso "${ctx.params.listingId}" en esta captación`);
    }

    if (!ctx.dryRun) {
      const { error } = await db.from("captacion_listings").delete().eq("id", listing.id);
      if (error) throw error;
    }

    ctx.counters.total = 1;
    ctx.counters.updated = 1;
    return { data: { id: listing.id, deleted: true, dry_run: ctx.dryRun } };
  },
});
