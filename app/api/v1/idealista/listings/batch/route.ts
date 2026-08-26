import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import {
  IdealistaBatchEnvelopeSchema,
  IdealistaListingSchema,
} from "@/lib/api/v1/idealista/schema";
import { upsertIdealistaListing } from "@/lib/api/v1/idealista/upsert";
import { resolveRunId } from "@/lib/api/v1/idealista/runs";

/**
 * POST /api/v1/idealista/listings/batch
 *
 * Hasta 200 anuncios por llamada. Responde SIEMPRE 200: cada elemento trae su
 * propio resultado o su propio error, con el índice, de modo que un anuncio mal
 * formado no tumbe los otros 199.
 *
 * Es deliberado y tiene una razón operativa: si el lote entero fallara, el dato
 * sucio seguiría en el origen y el mismo lote volvería a fallar en cada
 * sincronización, dejando al scraper bloqueado indefinidamente. Validando
 * elemento a elemento, lo bueno entra y lo malo se reporta.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = withApiRoute({
  scope: "idealista:write",
  schema: IdealistaBatchEnvelopeSchema,
  handler: async (input, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const results: Record<string, unknown>[] = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    // Cache de runs: un lote entero suele venir del mismo run, así se resuelve
    // una vez en vez de una consulta por anuncio.
    const runIdCache = new Map<string, string | null>();

    for (let index = 0; index < input.listings.length; index++) {
      const raw = input.listings[index];
      const parsed = IdealistaListingSchema.safeParse(raw);

      if (!parsed.success) {
        failed++;
        results.push({
          index,
          ok: false,
          idealista_id: typeof raw.idealista_id === "string" ? raw.idealista_id : null,
          error: {
            code: "validation_error",
            message: "El elemento no cumple el contrato",
            details: parsed.error.issues.slice(0, 20).map((issue) => ({
              field: issue.path.map((p) => String(p)).join(".") || undefined,
              message: issue.message,
            })),
          },
        });
        continue;
      }

      try {
        const externalRunId = parsed.data.run_id ?? null;
        if (externalRunId && !runIdCache.has(externalRunId)) {
          runIdCache.set(externalRunId, await resolveRunId(db, externalRunId));
        }

        const result = await upsertIdealistaListing(db, parsed.data, {
          apiClientId: ctx.client.id,
          runId: externalRunId ? (runIdCache.get(externalRunId) ?? null) : null,
          dryRun: ctx.dryRun,
        });

        if (result.action === "created") created++;
        else if (result.action === "updated") updated++;
        else unchanged++;

        results.push({
          index,
          ok: true,
          idealista_id: result.idealista_id,
          action: result.action,
          internal_id: result.internal_id,
          events_created: result.events_created,
          warnings: result.warnings,
        });
      } catch (err) {
        // Un fallo de un anuncio no aborta el lote: se registra y se sigue.
        failed++;
        results.push({
          index,
          ok: false,
          idealista_id: parsed.data.idealista_id,
          error: {
            code: "internal_error",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    ctx.counters.total = input.listings.length;
    ctx.counters.created = created;
    ctx.counters.updated = updated;
    ctx.counters.unchanged = unchanged;
    ctx.counters.failed = failed;

    return {
      data: results,
      meta: {
        summary: {
          received: input.listings.length,
          created,
          updated,
          unchanged,
          failed,
        },
        dry_run: ctx.dryRun,
      },
    };
  },
});
