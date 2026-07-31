import "server-only";
import { withApiRoute } from "@/lib/api/handler";
import { CaptacionBatchEnvelopeSchema } from "@/lib/api/v1/captaciones/schema";
import { upsertCaptacionBatch } from "@/lib/api/v1/captaciones/service";

/**
 * POST /api/v1/captaciones/batch
 *
 * Hasta 100 captaciones en una llamada. Devuelve siempre 200 con un `results[]`
 * por elemento: ni un fallo de validación ni uno de negocio pueden tumbar a los
 * demás. El proveedor mira `meta.summary.failed` y reintenta solo lo que falló.
 *
 * Solo se valida aquí el sobre; cada elemento se valida por separado dentro de
 * upsertCaptacionBatch. Si el schema completo se aplicara al cuerpo entero, una
 * sola ficha con un enum mal escrito devolvería 400 y se perderían las otras 99
 * —y como el dato sucio sigue en el origen, el lote volvería a fallar en cada
 * sincronización.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: CaptacionBatchEnvelopeSchema,
  handler: async (input, ctx) => {
    const { results, summary } = await upsertCaptacionBatch(ctx.client, input.items, {
      dryRun: ctx.dryRun,
      defaultOptions: input.options ?? undefined,
    });

    ctx.counters.total = summary.total;
    ctx.counters.created = summary.created;
    ctx.counters.updated = summary.updated;
    ctx.counters.unchanged = summary.unchanged;
    ctx.counters.failed = summary.failed;

    return { data: results, meta: { summary } };
  },
});
