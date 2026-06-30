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
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, role")
      .in("role", ["client", "owner"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (q.trim()) {
      query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ data: data ?? [] });
  } catch (err) {
    console.error("[clientes-search] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
