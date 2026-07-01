import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) {
      return Response.json({ error: "Falta id" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("idealista_listings").delete().eq("id", id);
    if (error) {
      console.error("Delete idealista listing error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    revalidatePath("/es/admin/idealista");
    revalidatePath("/cl/admin/idealista");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Error al borrar" },
      { status: 500 },
    );
  }
}
