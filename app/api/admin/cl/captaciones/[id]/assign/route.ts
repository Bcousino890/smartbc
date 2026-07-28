import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionActor } from "@/lib/db/queries/captacion-access";
import { getCaptacionEditableFields, STAFF_ROLES } from "@/lib/permissions";
import { applyCaptacionAssignment } from "@/lib/captaciones/assign";

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
    const actor = await getCaptacionActor(profile);
    if (!actor.isAdmin && !getCaptacionEditableFields(actor.role).canAssignCaptadora) {
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
    //
    // El filtro de rol se hace en JS, NO con .in("role", [...]) en la query:
    // pasar literales del enum `user_role` a Postgres hace fallar la consulta
    // entera con "invalid input value for enum user_role" cuando algún valor
    // no existe todavía en el enum de la BD (mismo bug que dejaba vacío el
    // selector "Asignar a"). Así la asignación funciona aunque el enum esté
    // desincronizado.
    const { data: captadora, error: captadoraError } = await db
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", captadora_id)
      .single();

    const staffRoles = new Set<string>(STAFF_ROLES as readonly string[]);
    if (captadoraError || !captadora || !staffRoles.has(captadora.role)) {
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

    // La asignación (mover a la etapa "assign", log y notificación) vive en un
    // helper compartido para que el reparto automático se comporte idéntico.
    const updated = await applyCaptacionAssignment(db, {
      captacion: { id, title: captacion.title, pipeline_id: captacion.pipeline_id },
      assigneeId: captadora_id,
      assigneeName: captadora.full_name,
      assignedBy: { id: profile.id, full_name: profile.full_name },
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
