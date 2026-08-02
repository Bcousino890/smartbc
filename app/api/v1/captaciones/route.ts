import "server-only";
import { withApiRoute } from "@/lib/api/handler";
import { CaptacionInputSchema } from "@/lib/api/v1/captaciones/schema";
import { listCaptaciones, upsertCaptacion } from "@/lib/api/v1/captaciones/service";

/**
 * /api/v1/captaciones
 *
 *  POST · alta o actualización de una captación completa (las seis pestañas de
 *         la ficha). 201 si se crea, 200 si se actualiza.
 *  GET  · listado paginado por cursor de lo que este cliente ha enviado, para
 *         que pueda conciliar contra su propio sistema.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: CaptacionInputSchema,
  handler: async (input, ctx) => {
    const result = await upsertCaptacion(ctx.client, input, { dryRun: ctx.dryRun });

    ctx.counters.total = 1;
    if (result.action === "created") ctx.counters.created = 1;
    else if (result.action === "updated") ctx.counters.updated = 1;
    else ctx.counters.unchanged = 1;

    return {
      data: result,
      status: result.action === "created" && !ctx.dryRun ? 201 : 200,
    };
  },
});

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export const GET = withApiRoute({
  scope: "captaciones:read",
  handler: async (_input, ctx) => {
    const rawLimit = Number(ctx.searchParams.get("limit"));
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const changedBy = ctx.searchParams.get("changed_by") === "panel" ? "panel" : null;

    const result = await listCaptaciones(ctx.client, {
      limit,
      cursor: ctx.searchParams.get("cursor"),
      updatedSince: ctx.searchParams.get("updated_since"),
      stage: ctx.searchParams.get("stage"),
      changedBy,
    });

    ctx.counters.total = result.items.length;

    return {
      data: result.items,
      meta: {
        limit,
        has_more: result.has_more,
        next_cursor: result.next_cursor,
        // Con changed_by=panel el cursor y updated_since se aplican sobre
        // updated_by_user_at, no sobre updated_at.
        cursor_field: changedBy === "panel" ? "updated_by_user_at" : "updated_at",
      },
    };
  },
});
