import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

// Pipeline de bajas: cuando una ficha ya publicada se retira de Idealista no
// se borra (se perderían fotos/datos e historial), se ARCHIVA. La fila sigue
// en la base de datos pero desaparece de "Fichas guardadas" activas.

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = (await req.json().catch(() => ({ id: null }))) as { id?: string };
  if (!id) {
    return Response.json({ error: "Falta id" }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { error } = await db
    .from("idealista_listings")
    .update({
      idealista_state: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/es/admin/idealista");
  revalidatePath("/cl/admin/idealista");
  return Response.json({ ok: true });
}
