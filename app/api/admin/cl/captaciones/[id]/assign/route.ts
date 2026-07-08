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
      .select("id, title, pipeline_id, stage_id, created_by, assigned_to")
      .eq("id", id)
      .single();

    if (fetchError || !captacion) {
      return NextResponse.json(
        { error: "Captación no encontrada" },
        { status: 404 }
      );
    }

    // Validar que el usuario existe y es staff. Antes solo se podía asignar
    // a captadoras; ahora cualquier ejecutivo/admin puede recibir la
    // captación para llamar. No se filtra por country: ese campo del
    // perfil no siempre está seteado a 'cl' aunque el usuario trabaje en
    // captaciones (default histórico 'es'), y filtrar por él dejaba la
    // lista de asignables vacía.
    const { data: captadora, error: captadoraError } = await db
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", captadora_id)
      .in("role", [
        "owner",
        "admin",
        "advisor",
        "agent_junior",
        "agent_senior",
        "agent_admin",
        "captadora",
      ])
      .single();

    if (captadoraError || !captadora) {
      if (captadoraError) console.error("[captaciones assign] lookup error:", captadoraError);
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Una captación ya convertida a propiedad no se reasigna: reabrir su
    // workflow no tiene efecto (la propiedad real ya existe aparte).
    if (captacion.stage_id) {
      const { data: currentStage } = await db
        .from("captacion_pipeline_stages")
        .select("stage_type")
        .eq("id", captacion.stage_id)
        .single();
      if (currentStage?.stage_type === "converted") {
        return NextResponse.json(
          { error: "Esta captación ya fue convertida a propiedad, no se puede reasignar" },
          { status: 400 }
        );
      }
    }

    // Si el pipeline tiene una etapa de tipo "assign", la captación se mueve
    // ahí (mismo comportamiento que antes: asignar la lleva a "Asignada").
    // Si no tiene ninguna, solo se actualiza el usuario asignado.
    const updates: any = {
      assigned_to: captadora_id,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (captacion.pipeline_id) {
      const { data: assignStage } = await db
        .from("captacion_pipeline_stages")
        .select("id")
        .eq("pipeline_id", captacion.pipeline_id)
        .eq("stage_type", "assign")
        .limit(1)
        .maybeSingle();
      if (assignStage) updates.stage_id = assignStage.id;
    }

    const { data: updated, error: updateError } = await db
      .from("captaciones")
      .update(updates)
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
