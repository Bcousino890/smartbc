import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccess(profile.role, "properties", "delete")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) {
      return Response.json({ error: "Falta id" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    // Pipeline de bajas: una ficha que ya se publicó en Idealista no se borra
    // (se perderían fotos/datos/historial), se ARCHIVA. Solo se borra de
    // verdad si nunca llegó a publicarse (borrador/fallida).
    const { data: listing } = await db
      .from("idealista_listings")
      .select("idealista_state")
      .eq("id", id)
      .single();

    if (listing?.idealista_state === "published") {
      const { error: archiveError } = await db
        .from("idealista_listings")
        .update({
          idealista_state: "archived",
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (archiveError) {
        console.error("Archive idealista listing error:", archiveError);
        return Response.json({ error: archiveError.message }, { status: 500 });
      }
      revalidatePath("/es/admin/idealista");
      revalidatePath("/cl/admin/idealista");
      return Response.json({ ok: true, archived: true });
    }

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
