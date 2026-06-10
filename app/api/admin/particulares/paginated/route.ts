import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const pageSize = 100;

  const supabase = createAdminClient() as any;

  let queryResult = await supabase
    .from("particulares")
    .select(
      "id, portal, external_id, particular_reference, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, description, photos, features, owner_name, phone, chat_only, latitude, longitude, taken_down_at, created_at, is_active"
    )
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Fallback si la migración no está aplicada
  if (queryResult.error && queryResult.error.message.includes("particular_reference")) {
    queryResult = await supabase
      .from("particulares")
      .select(
        "id, portal, external_id, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, description, photos, features, owner_name, phone, chat_only, latitude, longitude, taken_down_at, created_at, is_active"
      )
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
  }

  if (queryResult.error) {
    return Response.json({ error: queryResult.error.message }, { status: 500 });
  }

  return Response.json({ rows: queryResult.data ?? [] });
}
