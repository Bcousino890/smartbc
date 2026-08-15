import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { IdealistaRunSchema } from "@/lib/api/v1/idealista/schema";
import { upsertIdealistaRun } from "@/lib/api/v1/idealista/runs";

/**
 * POST /api/v1/idealista/runs
 *
 * Ejecuciones del scraper. Un solo endpoint para abrir, actualizar y cerrar:
 * el upsert va por `external_run_id`, así que mandar el mismo id con
 * `status: "running"` y luego con `status: "completed"` actualiza el mismo run.
 * No hay endpoints separados de start/finish a propósito — con uno, un reintento
 * tras un timeout no puede crear un run duplicado ni dejar uno huérfano.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withApiRoute({
  scope: "idealista:write",
  schema: IdealistaRunSchema,
  handler: async (input, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const result = await upsertIdealistaRun(db, input, {
      apiClientId: ctx.client.id,
      dryRun: ctx.dryRun,
    });

    ctx.counters.total = 1;
    if (result.action === "created") ctx.counters.created = 1;
    else ctx.counters.updated = 1;

    return {
      data: {
        success: true,
        external_run_id: result.external_run_id,
        action: result.action,
        internal_id: result.internal_id,
        shards: result.shards,
        dry_run: ctx.dryRun,
      },
      status: result.action === "created" && !ctx.dryRun ? 201 : 200,
    };
  },
});

/**
 * GET /api/v1/idealista/runs
 *
 * Últimas ejecuciones. Le sirve al scraper para retomar tras un reinicio sin
 * llevar estado local: consulta cuál fue su último run y si quedó abierto.
 */
export const GET = withApiRoute({
  scope: "idealista:read",
  handler: async (_input, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const limit = Math.min(Math.max(Number(ctx.searchParams.get("limit") ?? 20), 1), 100);
    const status = ctx.searchParams.get("status");
    const runType = ctx.searchParams.get("run_type");

    let query = db
      .from("idealista_scraper_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    if (runType) query = query.eq("run_type", runType);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    ctx.counters.total = (data ?? []).length;
    return { data: data ?? [] };
  },
});
