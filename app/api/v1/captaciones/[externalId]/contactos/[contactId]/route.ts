import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { apiErrors } from "@/lib/api/errors";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";

/**
 * DELETE /api/v1/captaciones/{external_id}/contactos/{contactId}
 *
 * `contactId` acepta tanto el id interno (UUID) como el `external_id` del
 * proveedor, para que no tenga que guardarse nuestros identificadores.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE = withApiRoute({
  scope: "captaciones:write",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    const contactId = ctx.params.contactId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const column = UUID_RE.test(contactId) ? "id" : "external_id";

    const { data: existing } = await db
      .from("captacion_contacts")
      .select("id")
      .eq("captacion_id", captacion.id)
      .eq(column, contactId)
      .maybeSingle();

    if (!existing) {
      throw apiErrors.notFound(`No existe el contacto "${contactId}" en esta captación`);
    }

    if (!ctx.dryRun) {
      const { error } = await db.from("captacion_contacts").delete().eq("id", existing.id);
      if (error) throw error;
    }

    ctx.counters.total = 1;
    ctx.counters.updated = 1;
    return { data: { id: existing.id, deleted: true, dry_run: ctx.dryRun } };
  },
});
