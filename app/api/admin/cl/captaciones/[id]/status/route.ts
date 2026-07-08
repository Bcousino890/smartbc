import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionEditPermissions } from "@/lib/db/queries/permissions";
import { isTerminalStageType } from "@/lib/captaciones/pipeline-stage-types";

// Mueve una captación a otra etapa de su mismo pipeline. Las etapas son
// configurables (migración 0078): en vez de un enum fijo, cada pipeline
// define sus propias etapas con un stage_type que determina el
// comportamiento (ver lib/captaciones/pipeline-stage-types.ts). Por eso las
// reglas de aquí son genéricas en vez de un mapa de transiciones fijo:
//  - No se puede mover DESDE una etapa terminal (rejected/converted).
//  - No se puede mover manualmente HACIA "converted": eso solo lo hace
//    POST /captaciones/[id]/convert (crea la propiedad real).
//  - No se puede mover manualmente HACIA "assign": eso lo hace
//    POST /captaciones/[id]/assign (requiere elegir un usuario).
//  - Si la etapa destino pide notas (requires_notes), son obligatorias.
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
    const { new_stage_id, notes } = body;

    if (!new_stage_id) {
      return NextResponse.json({ error: "new_stage_id es requerido" }, { status: 400 });
    }

    const db = createAdminClient() as any;

    const { data: captacion, error: fetchError } = await db
      .from("captaciones")
      .select("id, pipeline_id, stage_id, assigned_to, created_by, title")
      .eq("id", id)
      .single();

    if (fetchError || !captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }
    if (!captacion.pipeline_id || !captacion.stage_id) {
      return NextResponse.json(
        { error: "Esta captación no tiene pipeline asignado. Ábrela y guarda cualquier cambio para migrarla." },
        { status: 400 }
      );
    }

    const editPerms = getCaptacionEditPermissions(profile.role);
    const isAdmin = profile.role === "admin" || profile.role === "agent_admin";
    const isCaptadora = profile.role === "captadora" && captacion.assigned_to === profile.id;
    const isCreator = captacion.created_by === profile.id;

    if (!isAdmin && !isCaptadora && !isCreator) {
      return NextResponse.json({ error: "No tienes acceso a esta captación" }, { status: 403 });
    }
    if (!isAdmin && !editPerms.fields.canEditStatus) {
      return NextResponse.json({ error: "No tienes permisos para cambiar el estado" }, { status: 403 });
    }

    const [{ data: currentStage }, { data: targetStage }] = await Promise.all([
      db.from("captacion_pipeline_stages").select("*").eq("id", captacion.stage_id).single(),
      db.from("captacion_pipeline_stages").select("*").eq("id", new_stage_id).single(),
    ]);

    if (!targetStage || targetStage.pipeline_id !== captacion.pipeline_id) {
      return NextResponse.json({ error: "Esa etapa no pertenece al pipeline de esta captación" }, { status: 400 });
    }
    if (currentStage && isTerminalStageType(currentStage.stage_type)) {
      return NextResponse.json(
        { error: `"${currentStage.label}" es una etapa terminal, no se puede mover desde ahí` },
        { status: 400 }
      );
    }
    if (targetStage.stage_type === "converted") {
      return NextResponse.json(
        { error: "Para convertir a propiedad usa el botón \"Convertir a propiedad\" de la ficha" },
        { status: 400 }
      );
    }
    if (targetStage.stage_type === "assign") {
      return NextResponse.json(
        { error: "Para mover a una etapa de asignación indica a quién (usa el flujo de asignar)" },
        { status: 400 }
      );
    }
    if (targetStage.requires_notes && !notes) {
      return NextResponse.json(
        { error: `Escribe una nota para mover a "${targetStage.label}"` },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await db
      .from("captaciones")
      .update({
        stage_id: new_stage_id,
        revision_notes: targetStage.requires_notes ? notes : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    await db.from("captacion_logs").insert({
      captacion_id: id,
      created_by: profile.id,
      attempt_type: "status_change",
      result: targetStage.key,
      notes: notes || `Movida a ${targetStage.label}`,
    });

    // Notificaciones según el tipo de la etapa destino
    const propertyTitle = captacion.title || "Captación";
    const notifyIds = [captacion.assigned_to, captacion.created_by].filter(
      (uid: string | null, i: number, arr: (string | null)[]) =>
        uid && uid !== profile.id && arr.indexOf(uid) === i
    );

    if (targetStage.requires_notes) {
      for (const uid of notifyIds) {
        await db.from("crm_notifications").insert({
          user_id: uid,
          type: "captacion_stage_notes",
          title: `📍 ${targetStage.label}`,
          body: `${propertyTitle}: se movió a "${targetStage.label}". ${notes}`,
          link: `/cl/admin/captaciones/${id}`,
          data: { captacion_id: id },
        });
      }
    } else if (targetStage.stage_type === "confirmed") {
      for (const uid of notifyIds) {
        await db.from("crm_notifications").insert({
          user_id: uid,
          type: "captacion_confirmed",
          title: "✅ Captación confirmada",
          body: `${propertyTitle} está en "${targetStage.label}" - El dueño quiere vender`,
          link: `/cl/admin/captaciones/${id}`,
          data: { captacion_id: id },
        });
      }
    } else if (targetStage.stage_type === "rejected") {
      if (captacion.created_by && captacion.created_by !== profile.id) {
        await db.from("crm_notifications").insert({
          user_id: captacion.created_by,
          type: "captacion_rejected",
          title: "Captación rechazada",
          body: `${propertyTitle} fue rechazada`,
          link: `/cl/admin/captaciones/${id}`,
          data: { captacion_id: id },
        });
      }
    }

    return NextResponse.json({
      success: true,
      captacion: updated,
      message: `Movida a ${targetStage.label}`,
    });
  } catch (err) {
    console.error("[captaciones status]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al cambiar de etapa" },
      { status: 500 }
    );
  }
}
