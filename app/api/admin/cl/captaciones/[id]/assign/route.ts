import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionEditPermissions } from "@/lib/db/queries/permissions";

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

    // Verificar permiso granular: solo quien puede asignar captadora
    const editPerms = getCaptacionEditPermissions(profile.role);
    if (!editPerms.fields.canAssignCaptadora) {
      return NextResponse.json(
        { error: "No tienes permisos para asignar captaciones" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { captadora_id } = body;

    if (!captadora_id) {
      return NextResponse.json(
        { error: "captadora_id es requerido" },
        { status: 400 }
      );
    }

    const db = createAdminClient() as any;

    // Obtener captacion para validación
    const { data: captacion, error: fetchError } = await db
      .from("captaciones")
      .select("id, title, status, created_by, assigned_to")
      .eq("id", id)
      .single();

    if (fetchError || !captacion) {
      return NextResponse.json(
        { error: "Captación no encontrada" },
        { status: 404 }
      );
    }

    // Validar que la captadora existe
    const { data: captadora, error: captadoraError } = await db
      .from("profiles")
      .select("id, full_name")
      .eq("id", captadora_id)
      .eq("role", "captadora")
      .single();

    if (captadoraError || !captadora) {
      return NextResponse.json(
        { error: "Captadora no encontrada" },
        { status: 404 }
      );
    }

    // Actualizar captacion: asignar y cambiar estado a "assigned"
    const { data: updated, error: updateError } = await db
      .from("captaciones")
      .update({
        assigned_to: captadora_id,
        assigned_at: new Date().toISOString(),
        status: "assigned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Registrar en log de captacion (attempt_type must be in allowed set)
    await db.from("captacion_logs").insert({
      captacion_id: id,
      created_by: profile.id,
      attempt_type: "message",
      result: "assigned",
      notes: `Asignada a ${captadora.full_name}`,
    }).then(() => {}).catch(() => {}); // non-critical, ignore errors

    // Enviar notificación a la captadora
    const propertyTitle = captacion.title || "Captación";
    await db.from("crm_notifications").insert({
      user_id: captadora_id,
      type: "captacion_assigned",
      title: "Nueva captación asignada",
      body: `${profile.full_name || "Admin"} te asignó una captación: ${propertyTitle}`,
      link: `/cl/admin/captaciones/${id}`,
      data: {
        captacion_id: id,
        assigned_by: profile.id,
        assigned_by_name: profile.full_name,
      },
    });

    return NextResponse.json({
      success: true,
      captacion: updated,
      message: `Captación asignada a ${captadora.full_name}`,
    });
  } catch (err) {
    console.error("[captaciones assign]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al asignar" },
      { status: 500 }
    );
  }
}
