import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { AttemptSchema } from "@/lib/api/v1/captaciones/schema";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { appendCaptacionAttempts } from "@/lib/captaciones/write/append-log";

/**
 * /api/v1/captaciones/{external_id}/intentos
 *
 * Pestaña «Intentos»: historial de contacto con el propietario. Al registrar un
 * intento se actualiza también el seguimiento de la cabecera de la ficha
 * (último contacto y próximo paso agendado), igual que cuando lo hace una
 * persona desde el panel.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiRoute({
  scope: "captaciones:read",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("captacion_logs")
      .select("id, external_id, attempt_type, result, owner_phone, owner_name, owner_contact, address_real, notes, photo_url, created_at")
      .eq("captacion_id", captacion.id)
      .order("created_at", { ascending: false });
    ctx.counters.total = (data ?? []).length;
    return { data: data ?? [] };
  },
});

const AttemptsPayloadSchema = z
  .object({ attempts: z.array(AttemptSchema).min(1).max(50) })
  .strict();

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: AttemptsPayloadSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const result = await appendCaptacionAttempts(
      db,
      captacion.id,
      ctx.client.default_created_by,
      input.attempts,
      { dryRun: ctx.dryRun }
    );

    ctx.counters.total = input.attempts.length;
    ctx.counters.created = result.created;
    ctx.counters.unchanged = result.unchanged;
    ctx.counters.failed = result.errors.length;

    return {
      data: result,
      status: result.created > 0 && !ctx.dryRun ? 201 : 200,
    };
  },
});
