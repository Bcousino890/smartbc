import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionEditableFields } from "@/lib/permissions";
import { getCaptacionActor, actorCanWorkCaptacion } from "@/lib/db/queries/captacion-access";
import { panelChange, stampPanelChange } from "@/lib/captaciones/panel-change";

// Mueve una captación a otra etapa de su mismo pipeline. Las etapas son
// configurables (migración 0078): en vez de un enum fijo, cada pipeline
// define sus propias etapas con un stage_type que determina el
// comportamiento (ver lib/captaciones/pipeline-stage-types.ts). La
// captación se puede mover libremente entre cualquier par de etapas del
// mismo pipeline (sin importar desde dónde venga, incluida Rechazada), con
// solo dos excepciones:
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

    // Rol EFECTIVO (rol por país / personalizado incluidos): con el rol global
    // a pelo, un senior de Chile no podía mover la etapa.
    const actor = await getCaptacionActor(profile);
    // Los roles con permiso para cambiar el estado (agent_senior, owner…)
    // pueden mover cualquier captación que ven a una nueva etapa (p. ej.
    // confirmarla para luego convertirla), no solo la que crearon o tienen
    // asignada.
    const canManageStatus =
      actor.isAdmin || getCaptacionEditableFields(actor.role).canEditStatus;

    if (!actorCanWorkCaptacion(actor, captacion) && !canManageStatus) {
      return NextResponse.json({ error: "No tienes acceso a esta captación" }, { status: 403 });
    }
    if (!canManageStatus) {
      return NextResponse.json({ error: "No tienes permisos para cambiar el estado" }, { status: 403 });
    }

    const { data: targetStage } = await db
      .from("captacion_pipeline_stages")
      .select("*")
      .eq("id", new_stage_id)
      .single();

    if (!targetStage || targetStage.pipeline_id !== captacion.pipeline_id) {
      return NextResponse.json({ error: "Esa etapa no pertenece al pipeline de esta captación" }, { status: 400 });
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

    // Origen del rechazo (migración 0107): si el equipo mueve a mano a una
    // etapa "rechazada", queda marcada como rechazo humano y NO se reabre
    // sola cuando el proveedor la reenvíe por la API. Si el equipo la saca de
    // "rechazada" (a cualquier otra etapa), se limpia — vuelve a poder
    // reabrirse por reenvío normal más adelante si el equipo la rechaza de
    // nuevo por otra vía.
    const { data: currentStage } = await db
      .from("captacion_pipeline_stages")
      .select("stage_type")
      .eq("id", captacion.stage_id)
      .maybeSingle();
    const rejectionUpdate: Record<string, unknown> = {};
    if (targetStage.stage_type === "rejected") {
      rejectionUpdate.status = "rejected";
      rejectionUpdate.rejected_by = "panel";
    } else if (currentStage?.stage_type === "rejected") {
      rejectionUpdate.status = "draft";
      rejectionUpdate.rejected_by = null;
    }

    const { data: updated, error: updateError } = await db
      .from("captaciones")
      .update({
        stage_id: new_stage_id,
        revision_notes: targetStage.requires_notes ? notes : null,
        ...rejectionUpdate,
        ...panelChange(),
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
