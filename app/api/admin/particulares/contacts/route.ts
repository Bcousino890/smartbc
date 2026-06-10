import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const particularId = url.searchParams.get("id");
  if (!particularId) return Response.json({ error: "id_required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("particulares_contacts")
    .select("id, contact_type, outcome, notes, contacted_at, advisor_id, profiles(first_name, last_name)")
    .eq("particular_id", particularId)
    .order("contacted_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ contacts: data ?? [] });
}
