import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import {
  publishPropertyToIdealista,
  publishListingToIdealista,
} from "@/lib/services/idealista/publisher";

export const maxDuration = 300;

// Called by a system cron: */5 * * * * curl -H "x-cron-secret: $CRON_SECRET" localhost:3000/api/admin/idealista/process-scheduled
export async function GET(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient() as any;

  // Incluye tanto fichas de sistema (property_id != null) como inspo puras
  // (property_id == null). Antes el `.not("property_id","is",null)` dejaba las
  // inspo programadas sin publicarse nunca.
  const { data: due, error } = await db
    .from("idealista_listings")
    .select("id, property_id, idealista_state")
    .lte("scheduled_publish_at", new Date().toISOString())
    .not("idealista_state", "eq", "published")
    .limit(10);

  if (error) {
    console.error("[process-scheduled] query error:", error);
    return Response.json({ error: "DB error" }, { status: 500 });
  }

  const results: Array<{ id: string; success: boolean; error?: string }> = [];

  for (const listing of (due ?? [])) {
    try {
      // Dispatch igual que /publish-property: inspo pura → por listingId,
      // ficha de sistema → por su property_id.
      const result = listing.property_id
        ? await publishPropertyToIdealista(listing.property_id)
        : await publishListingToIdealista(listing.id);
      results.push({ id: listing.id, success: result.success, error: result.error });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: listing.id, success: false, error: msg });
    }
  }

  return Response.json({ processed: results.length, results });
}
