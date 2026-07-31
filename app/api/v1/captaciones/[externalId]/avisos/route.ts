import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { ListingSchema } from "@/lib/api/v1/captaciones/schema";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { syncCaptacionListings } from "@/lib/captaciones/write/sync-listings";

/**
 * /api/v1/captaciones/{external_id}/avisos
 *
 * Pestaña «Avisos»: la misma propiedad publicada por varias corredoras. El
 * upsert va por `source_url` (UNIQUE (captacion_id, source_url)), y cada cambio
 * de precio deja automáticamente un punto en el histórico — que es lo que
 * permite ver quién subió o bajó el precio sin seguimiento manual.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = withApiRoute({
  scope: "captaciones:read",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const { data: listings } = await db
      .from("captacion_listings")
      .select("*")
      .eq("captacion_id", captacion.id)
      .order("created_at", { ascending: true });

    const rows = listings ?? [];
    const ids = rows.map((l: { id: string }) => l.id);

    let prices: { listing_id: string }[] = [];
    if (ids.length > 0) {
      const { data } = await db
        .from("captacion_listing_prices")
        .select("id, listing_id, price, currency, source, scraped_at")
        .in("listing_id", ids)
        .order("scraped_at", { ascending: false });
      prices = data ?? [];
    }

    ctx.counters.total = rows.length;
    return {
      data: rows.map((listing: { id: string }) => ({
        ...listing,
        price_history: prices.filter((p) => p.listing_id === listing.id),
      })),
    };
  },
});

const ListingsPayloadSchema = z
  .object({ listings: z.array(ListingSchema).min(1).max(20) })
  .strict();

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: ListingsPayloadSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const result = await syncCaptacionListings(db, captacion.id, input.listings, {
      dryRun: ctx.dryRun,
    });

    ctx.counters.total = input.listings.length;
    ctx.counters.created = result.created;
    ctx.counters.updated = result.updated;
    ctx.counters.unchanged = result.unchanged;
    ctx.counters.failed = result.errors.length;

    return {
      data: {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        price_snapshots: result.priceSnapshots,
        errors: result.errors,
      },
      status: result.created > 0 && !ctx.dryRun ? 201 : 200,
    };
  },
});
