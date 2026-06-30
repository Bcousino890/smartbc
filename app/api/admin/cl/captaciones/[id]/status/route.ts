import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

// Transiciones de estado permitidas
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["assigned"],
  assigned: ["preliminary_data", "rejected"],
  preliminary_data: ["contacting", "revision", "rejected"],
  contacting: ["confirmation_pending", "revision", "confirmed", "rejected"],
  revision: ["preliminary_data", "contacting"],
  confirmed: ["converted_to_property", "rejected"],
  converted_to_property: [],
  rejected: [],
};

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
    const { new_status, notes } = body;

    if (!new_status) {
      return NextResponse.json(
        { error: "new_status es requerido" },
        { status: 400 }
      );
    }

    const db = createAdminClient() as any;

    // Obtener captacion actual
    const { data: captacion, error: fetchError } = await db
      .from("captaciones")
      .select("id, status, assigned_to, created_by, title")
      .eq("id", id)
      .single();

    if (fetchError || !captacion) {
      return NextResponse.json(
        { error: "Captación no encontrada" },
        { status: 404 }
      );
    }

    // Validar permisos
    const isAdmin = profile.role === "admin";
    const isCaptadora = profile.role === "captadora" && captacion.assigned_to === profile.id;
    const isCreator = captacion.created_by === profile.id;

    if (!isAdmin && !isCaptadora && !isCreator) {
      return NextResponse.json(
        { error: "No tienes permisos para cambiar el estado" },
        { status: 403 }
      );
    }

    // Validar transición
    const allowedNextStates = ALLOWED_TRANSITIONS[captacion.status] || [];
    if (!allowedNextStates.includes(new_status)) {
      return NextResponse.json(
        {
          error: `No puedes cambiar de ${captacion.status} a ${new_status}. Estados permitidos: ${allowedNextStates.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validar que si es cambio a "revision", tenga notas
    if (new_status === "revision" && !notes) {
      return NextResponse.json(
        { error: "Se requieren notas al marcar como revisión" },
        { status: 400 }
      );
    }

    // Actualizar status
    const { data: updated, error: updateError } = await db
      .from("captaciones")
      .update({
        status: new_status,
        revision_notes: new_status === "revision" ? notes : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Registrar en log
    await db.from("captacion_logs").insert({
      captacion_id: id,
      created_by: profile.id,
      attempt_type: "status_change",
      result: new_status,
      notes: notes || `Estado cambiado a ${new_status}`,
    });

    // Enviar notificaciones según el nuevo estado
    const propertyTitle = captacion.title || "Captación";

    if (new_status === "revision") {
      // Notificar al agente que hay que revisar
      await db.from("crm_notifications").insert({
        user_id: captacion.created_by,
        type: "captacion_revision_needed",
        title: "Revisión necesaria",
        body: `Datos inconsistentes en ${propertyTitle}: ${notes}`,
        link: `/cl/admin/captaciones/${id}`,
        data: { captacion_id: id },
      });
    } else if (new_status === "confirmed") {
      // Notificar al agente que está confirmada
      await db.from("crm_notifications").insert({
        user_id: captacion.created_by,
        type: "captacion_confirmed",
        title: "✅ Captación confirmada",
        body: `${propertyTitle} está confirmada - El dueño quiere vender`,
        link: `/cl/admin/captaciones/${id}`,
        data: { captacion_id: id },
      });
    } else if (new_status === "rejected") {
      // Notificar al agente que fue rechazada
      await db.from("crm_notifications").insert({
        user_id: captacion.created_by,
        type: "captacion_rejected",
        title: "Captación rechazada",
        body: `${propertyTitle} fue rechazada`,
        link: `/cl/admin/captaciones/${id}`,
        data: { captacion_id: id },
      });
    }

    return NextResponse.json({
      success: true,
      captacion: updated,
      message: `Estado actualizado a ${new_status}`,
    });
  } catch (err) {
    console.error("[captaciones status]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al cambiar estado" },
      { status: 500 }
    );
  }
}
