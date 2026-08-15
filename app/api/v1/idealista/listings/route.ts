import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { IdealistaListingSchema } from "@/lib/api/v1/idealista/schema";
import { upsertIdealistaListing } from "@/lib/api/v1/idealista/upsert";
import { resolveRunId } from "@/lib/api/v1/idealista/runs";

/**
 * POST /api/v1/idealista/listings
 *
 * Alta o actualización de UN anuncio del mercado de Idealista. La clave de
 * deduplicación es `idealista_id`: el mismo payload dos veces devuelve
 * `unchanged` y no escribe nada.
 *
 * Para volumen, usar `/listings/batch` — 200 por llamada en vez de 200 llamadas.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withApiRoute({
  scope: "idealista:write",
  schema: IdealistaListingSchema,
  handler: async (input, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const runId = await resolveRunId(db, input.run_id ?? null);

    const result = await upsertIdealistaListing(db, input, {
      apiClientId: ctx.client.id,
      runId,
      dryRun: ctx.dryRun,
    });

    ctx.counters.total = 1;
    if (result.action === "created") ctx.counters.created = 1;
    else if (result.action === "updated") ctx.counters.updated = 1;
    else ctx.counters.unchanged = 1;

    return {
      data: {
        success: true,
        idealista_id: result.idealista_id,
        action: result.action,
        internal_id: result.internal_id,
        events_created: result.events_created,
        sections: {
          photos: result.photos,
          phones: result.phones,
          links: result.links,
          observations: result.observations,
        },
        warnings: result.warnings,
        dry_run: ctx.dryRun,
      },
      status: result.action === "created" && !ctx.dryRun ? 201 : 200,
    };
  },
});

/**
 * GET /api/v1/idealista/listings
 *
 * Lectura de lo ya ingerido, con cursor opaco. Sirve al scraper para reconciliar
 * (`?updated_since=`) y para saber qué tiene que volver a mirar
 * (`?status=active&stale_hours=48`), sin tener que llevar él su propio espejo
 * de nuestro estado.
 */
export const GET = withApiRoute({
  scope: "idealista:read",
  handler: async (_input, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const sp = ctx.searchParams;

    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50), 1), 200);
    const status = sp.get("status");
    const advertiserType = sp.get("advertiser_type");
    const updatedSince = sp.get("updated_since");
    const staleHours = sp.get("stale_hours");
    const cursor = sp.get("cursor");

    let query = db
      .from("idealista_market_listings")
      .select(
        "id, idealista_id, listing_url, status, operation, advertiser_type, current_price, " +
          "municipality, district, neighborhood, first_seen_at, last_seen_at, " +
          "last_detail_scraped_at, missing_since, off_market_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(limit + 1);

    if (status) query = query.eq("status", status);
    if (advertiserType) query = query.eq("advertiser_type", advertiserType);
    if (updatedSince) query = query.gte("updated_at", updatedSince);
    if (cursor) query = query.lt("updated_at", decodeCursor(cursor));
    if (staleHours) {
      // "Lo que no se mira desde hace N horas". NULLS FIRST no se puede pedir
      // por PostgREST aquí, pero el índice parcial de 0122 ya deja las fichas
      // nunca scrapeadas delante en la cola de refresco del panel.
      const threshold = new Date(Date.now() - Number(staleHours) * 3600_000).toISOString();
      query = query.or(`last_detail_scraped_at.is.null,last_detail_scraped_at.lt.${threshold}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    ctx.counters.total = page.length;
    return {
      data: page,
      meta: {
        limit,
        has_more: hasMore,
        next_cursor: hasMore ? encodeCursor(page[page.length - 1].updated_at) : null,
      },
    };
  },
});

// Cursor opaco: es una fecha en base64. Se codifica para que el cliente no
// construya el suyo — el día que la paginación cambie de columna, el cursor
// viejo debe dejar de funcionar en vez de devolver datos mal paginados.
function encodeCursor(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function decodeCursor(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}
