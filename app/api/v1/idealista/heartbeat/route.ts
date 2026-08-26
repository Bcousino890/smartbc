import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { IdealistaHeartbeatSchema } from "@/lib/api/v1/idealista/schema";
import { getIdealistaScraperConfig } from "@/lib/api/v1/idealista/config";

/**
 * POST /api/v1/idealista/heartbeat
 *
 * "Sigo vivo". Una fila por `worker_id`, siempre la misma: no es un log, es el
 * último estado conocido. El panel compara `last_heartbeat_at` contra
 * `heartbeat_stale_minutes` para decidir si el scraper está RUNNING o STALE.
 *
 * Es lo que convierte "no llegan anuncios" en un diagnóstico: sin heartbeat no
 * se distingue "el scraper está caído" de "el scraper funciona pero hoy no hay
 * anuncios nuevos".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiRoute({
  scope: "idealista:write",
  schema: IdealistaHeartbeatSchema,
  handler: async (input, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const now = new Date().toISOString();

    if (!ctx.dryRun) {
      const { error } = await db.from("idealista_scraper_workers").upsert(
        {
          worker_id: input.worker_id,
          status: input.status ?? "running",
          // El timestamp que manda el scraper se guarda si viene, pero el
          // umbral de STALE se mide contra la hora de RECEPCIÓN: un worker con
          // el reloj adelantado no debe poder fingir que está vivo.
          last_heartbeat_at: now,
          current_run_type: input.current_run_type ?? null,
          current_run_id: input.current_run_id ?? null,
          current_shard: input.current_shard ?? null,
          message: input.message ?? null,
          requests_used_month: input.requests_used_month ?? null,
          metadata: input.metadata ?? null,
        },
        { onConflict: "worker_id" },
      );
      if (error) throw new Error(`upsert heartbeat: ${error.message}`);
    }

    // Se devuelve la configuración en la respuesta del heartbeat: el scraper ya
    // está llamando, así que se entera de un cambio de frecuencia (o de un
    // `scraping_enabled: false`) sin una segunda petición.
    const config = await getIdealistaScraperConfig();

    ctx.counters.total = 1;
    ctx.counters.updated = 1;

    return {
      data: {
        success: true,
        worker_id: input.worker_id,
        received_at: now,
        config_version: config.version,
        scraping_enabled: config.scraping_enabled,
        dry_run: ctx.dryRun,
      },
    };
  },
});
