import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { canAccess } from "@/lib/permissions";

// DELETE: elimina la captación completa. Fotos, logs, contactos y avisos de
// corredoras caen en cascada (FK ON DELETE CASCADE). Solo roles con permiso
// "delete" en captaciones, o el creador de la captación.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const db = createAdminClient() as any;
    const { data: captacion } = await db
      .from("captaciones")
      .select("id, created_by, status")
      .eq("id", id)
      .single();

    if (!captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    const canDelete =
      canAccess(profile.role, "captaciones", "delete") ||
      captacion.created_by === profile.id;
    if (!canDelete) {
      return NextResponse.json(
        { error: "No tienes permisos para eliminar captaciones" },
        { status: 403 }
      );
    }

    // Una captación ya convertida tiene una propiedad real enlazada: no se
    // borra desde aquí para no dejar la propiedad sin trazabilidad.
    if (captacion.status === "converted_to_property") {
      return NextResponse.json(
        { error: "No se puede eliminar una captación ya convertida a propiedad" },
        { status: 400 }
      );
    }

    const { error } = await db.from("captaciones").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[captaciones DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar la captación" },
      { status: 500 }
    );
  }
}
