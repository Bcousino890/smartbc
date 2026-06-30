import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { requireSession } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import type { ApplicationCountry, ApplicationOperation } from "@/lib/property-applications/types";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const isStaff = ["admin", "owner", "advisor", "agent_admin", "agent_senior", "agent_junior"].includes(auth.role);
    if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });

    const body = await req.json() as {
      client_id: string;
      country: ApplicationCountry;
      operation: ApplicationOperation;
      property_id?: string;
    };

    if (!body.client_id || !body.country || !body.operation) {
      return Response.json({ error: "Se requieren client_id, country y operation" }, { status: 400 });
    }

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("property_applications")
      .insert({
        client_id: body.client_id,
        country: body.country,
        operation: body.operation,
        property_id: body.property_id ?? null,
        status: "draft",
      })
      .select()
      .single();

    if (error) throw error;

    return Response.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[admin-apps-POST] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
