import "server-only";
import { withApiRoute } from "@/lib/api/handler";
import { CaptacionBatchSchema } from "@/lib/api/v1/captaciones/schema";
import { upsertCaptacionBatch } from "@/lib/api/v1/captaciones/service";

/**
 * POST /api/v1/captaciones/batch
 *
 * Hasta 100 captaciones en una llamada. Devuelve siempre 200 con un `results[]`
 * por elemento: un item mal formado no puede tumbar los otros 99. El proveedor
 * mira `summary.failed` y reintenta solo lo que falló.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: CaptacionBatchSchema,
  handler: async (input, ctx) => {
    // Las opciones del lote sirven de valor por defecto para cada elemento que
    // no traiga las suyas.
    const items = input.options
      ? input.items.map((item) => ({ ...item, options: item.options ?? input.options }))
      : input.items;

    const { results, summary } = await upsertCaptacionBatch(ctx.client, items, {
      dryRun: ctx.dryRun,
    });

    ctx.counters.total = summary.total;
    ctx.counters.created = summary.created;
    ctx.counters.updated = summary.updated;
    ctx.counters.unchanged = summary.unchanged;
    ctx.counters.failed = summary.failed;

    return { data: results, meta: { summary } };
  },
});
