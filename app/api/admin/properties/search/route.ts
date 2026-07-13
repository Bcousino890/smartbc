import "server-only";
import { requireSession } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const isStaff = ["admin", "owner", "advisor", "agent_admin", "agent_senior", "agent_junior"].includes(auth.role);
    if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });

    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any)
      .from("properties")
      .select("id, slug, title, address, bc_reference, cover_photo_url, price, operation")
      .order("created_at", { ascending: false })
      .limit(20);

    if (q.trim()) {
      query = query.or(`title.ilike.%${q}%,address.ilike.%${q}%,bc_reference.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ data: data ?? [] });
  } catch (err) {
    console.error("[properties-search] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
