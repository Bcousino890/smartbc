import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { apiErrors } from "@/lib/api/errors";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { appendListingPrice } from "@/lib/captaciones/write/sync-listings";
import { resolveListing } from "../resolve";

/**
 * /api/v1/captaciones/{external_id}/avisos/{listingId}/precios
 *
 * Histórico de precios de un aviso. Normalmente los puntos los genera solo el
 * upsert cuando detecta un cambio; este endpoint existe para que un proveedor
 * que ya tiene su propio histórico pueda cargarlo o corregirlo.
 *
 * `source` distingue si el precio se vio en el portal o en la web propia de la
 * corredora (columna añadida en la migración 0076).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiRoute({
  scope: "captaciones:read",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const listing = await resolveListing(db, captacion.id, ctx.params.listingId);
    if (!listing) {
      throw apiErrors.notFound(`No existe el aviso "${ctx.params.listingId}" en esta captación`);
    }

    const { data } = await db
      .from("captacion_listing_prices")
      .select("id, price, currency, source, scraped_at")
      .eq("listing_id", listing.id)
      .order("scraped_at", { ascending: false });

    ctx.counters.total = (data ?? []).length;
    return { data: data ?? [] };
  },
});

const PriceSchema = z
  .object({
    price: z.number().min(0).max(1e15),
    currency: z.enum(["clp", "uf", "usd", "eur"]).nullable().optional(),
    source: z.enum(["portal", "broker_web"]).optional(),
  })
  .strict();

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: PriceSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const listing = await resolveListing(db, captacion.id, ctx.params.listingId);
    if (!listing) {
      throw apiErrors.notFound(`No existe el aviso "${ctx.params.listingId}" en esta captación`);
    }

    const source = input.source ?? "portal";

    if (!ctx.dryRun) {
      await appendListingPrice(db, listing.id, input.price, input.currency ?? null, source);
    }

    ctx.counters.total = 1;
    ctx.counters.created = 1;

    return {
      data: {
        listing_id: listing.id,
        price: input.price,
        currency: input.currency ?? null,
        source,
        dry_run: ctx.dryRun,
      },
      status: ctx.dryRun ? 200 : 201,
    };
  },
});
