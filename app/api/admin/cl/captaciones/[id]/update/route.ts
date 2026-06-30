import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    // Verify ownership and get created_by for notification
    const { data: captacion } = await db
      .from("captaciones")
      .select("assigned_to, created_by, title, owner_confirmed, status")
      .eq("id", id)
      .single();

    if (!captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    const isAdmin = profile.role === "admin";
    const isCaptadora = profile.role === "captadora" && captacion.assigned_to === profile.id;
    const isCreator = profile.id === captacion.created_by;

    // Permisos
    if (!isAdmin && !isCaptadora && !isCreator) {
      return NextResponse.json({ error: "No tienes permisos para actualizar" }, { status: 403 });
    }

    // Captadoras solo pueden editar owner data
    if (!isAdmin && isCaptadora) {
      if (body.status || body.title || body.price) {
        return NextResponse.json(
          { error: "Solo puedes editar los datos del dueño" },
          { status: 403 }
        );
      }
    }

    const wasConfirmed = captacion.owner_confirmed;
    const nowConfirmed = body.owner_confirmed || false;

    // Construir objeto de actualización dinámicamente
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    // Campos que anyone puede editar
    if (body.owner_phone !== undefined) updates.owner_phone = body.owner_phone || null;
    if (body.owner_name !== undefined) updates.owner_name = body.owner_name || null;
    if (body.owner_contact !== undefined) updates.owner_contact = body.owner_contact || null;
    if (body.address_real !== undefined) updates.address_real = body.address_real || null;
    if (body.notes !== undefined) updates.notes = body.notes || null;
    if (body.owner_confirmed !== undefined) updates.owner_confirmed = nowConfirmed;

    // Campos que solo admin puede editar
    if (isAdmin) {
      if (body.title !== undefined) updates.title = body.title || null;
      if (body.price !== undefined) updates.price = body.price || null;
      if (body.currency !== undefined) updates.currency = body.currency || null;
      if (body.bedrooms !== undefined) updates.bedrooms = body.bedrooms || null;
      if (body.bathrooms !== undefined) updates.bathrooms = body.bathrooms || null;
      if (body.square_meters !== undefined) updates.square_meters = body.square_meters || null;
      if (body.region !== undefined) updates.region = body.region || null;
      if (body.commune !== undefined) updates.commune = body.commune || null;
      if (body.zone !== undefined) updates.zone = body.zone || null;
    }

    // Auto-actualizar status si se marca como confirmado
    if (nowConfirmed && captacion.status !== "confirmed") {
      updates.status = "confirmed";
      updates.completed_at = new Date().toISOString();
    } else if (!nowConfirmed && captacion.status === "confirmed") {
      // Si desmarca, volver a preliminary_data
      updates.status = "preliminary_data";
      updates.completed_at = null;
    }

    // Cambiar status a preliminary_data si se está llenando datos por primera vez
    if (isCaptadora && captacion.status === "assigned" && (body.owner_phone || body.owner_name)) {
      updates.status = "preliminary_data";
    }

    const { data, error } = await db
      .from("captaciones")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Notificaciones según lo que cambió
    if (nowConfirmed && !wasConfirmed && captacion.created_by) {
      const propertyTitle = captacion.title || "Captación";
      await db.from("crm_notifications").insert({
        user_id: captacion.created_by,
        type: "captacion_confirmed",
        title: "✅ Captación confirmada",
        body: `${profile.full_name || "La captadora"} confirmó que el dueño quiere vender: ${propertyTitle}`,
        link: `/cl/admin/captaciones/${id}`,
        data: { captacion_id: id },
      });
    } else if (isCaptadora && (body.owner_phone || body.owner_name || body.owner_contact || body.address_real) && captacion.status === "assigned") {
      // Notificar al agente que se agregaron datos preliminares
      const propertyTitle = captacion.title || "Captación";
      await db.from("crm_notifications").insert({
        user_id: captacion.created_by,
        type: "captacion_preliminary_data_added",
        title: "Datos agregados",
        body: `Se agregaron datos preliminares para ${propertyTitle}`,
        link: `/cl/admin/captaciones/${id}`,
        data: { captacion_id: id },
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[captaciones update]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar" },
      { status: 500 }
    );
  }
}
