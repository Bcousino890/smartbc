import "server-only";
import { z } from "zod";
import { withApiRoute } from "@/lib/api/handler";
import { CaptacionPatchSchema } from "@/lib/api/v1/captaciones/schema";
import {
  archiveCaptacion,
  getCaptacionDetail,
  toUpsertInput,
} from "@/lib/api/v1/captaciones/service";
import { upsertCaptacionFromApi } from "@/lib/captaciones/write/upsert-captacion";

/**
 * /api/v1/captaciones/{external_id}
 *
 *  GET    · ficha completa tal y como la ve el panel (las seis pestañas).
 *  PATCH  · actualización parcial; los campos ausentes no se tocan.
 *  DELETE · baja LÓGICA (etapa de rechazo). Nunca se borra físicamente.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = withApiRoute({
  scope: "captaciones:read",
  handler: async (_input, ctx) => {
    const detail = await getCaptacionDetail(ctx.client, ctx.params.externalId);
    ctx.counters.total = 1;
    return { data: detail };
  },
});

export const PATCH = withApiRoute({
  scope: "captaciones:write",
  schema: CaptacionPatchSchema,
  handler: async (input, ctx) => {
    const result = await upsertCaptacionFromApi(
      ctx.client,
      toUpsertInput(input, ctx.params.externalId),
      { dryRun: ctx.dryRun }
    );
    ctx.counters.total = 1;
    if (result.action === "updated") ctx.counters.updated = 1;
    else if (result.action === "created") ctx.counters.created = 1;
    else ctx.counters.unchanged = 1;
    return { data: result };
  },
});

const DeleteSchema = z
  .object({ reason: z.string().trim().max(2000).nullable().optional() })
  .strict();

export const DELETE = withApiRoute({
  scope: "captaciones:write",
  schema: DeleteSchema,
  handler: async (input, ctx) => {
    const result = await archiveCaptacion(
      ctx.client,
      ctx.params.externalId,
      input.reason ?? null,
      { dryRun: ctx.dryRun }
    );
    ctx.counters.total = 1;
    if (result.action === "archived") ctx.counters.updated = 1;
    else ctx.counters.unchanged = 1;
    return { data: result };
  },
});
