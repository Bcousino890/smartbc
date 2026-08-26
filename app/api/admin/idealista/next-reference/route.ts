import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "edit")) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const db = createAdminClient() as any;
    const { data, error } = await db.rpc("next_bc_reference");
    if (error) throw error;
    return Response.json({ reference: data });
  } catch (err) {
    console.error("[next-reference]", err);
    return Response.json({ error: "Error al generar referencia" }, { status: 500 });
  }
}
