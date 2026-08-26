import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getStagesForPipeline, pickWorkingStage } from "@/lib/captaciones/pipeline";
import { getCaptacionActor, actorCanWorkCaptacion } from "@/lib/db/queries/captacion-access";
import { panelChange, stampPanelChange } from "@/lib/captaciones/panel-change";

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

    const { data: captacion } = await db
      .from("captaciones")
      .select("assigned_to, created_by, title, status, pipeline_id, stage_id")
      .eq("id", id)
      .single();

    if (!captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    // Pueden registrar intentos: quien tiene la captación asignada, quien la
    // creó y cualquiera con permiso efectivo de edición en captaciones. Misma
    // regla exacta que usa la UI para enseñar el botón "+ Registrar Intento".
    const actor = await getCaptacionActor(profile);
    if (!actorCanWorkCaptacion(actor, captacion)) {
      return NextResponse.json(
        { error: "No tienes permiso para registrar intentos en esta captación" },
        { status: 403 }
      );
    }

    const { data, error } = await db
      .from("captacion_logs")
      .insert({
        captacion_id: id,
        created_by: profile.id,
        attempt_type: body.attempt_type,
        result: body.result,
        owner_phone: body.owner_phone || null,
        owner_name: body.owner_name || null,
        owner_contact: body.owner_contact || null,
        address_real: body.address_real || null,
        notes: body.notes || null,
        photo_url: body.photo_url || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Actualizar seguimiento en la captación. Si aún está en la etapa de
    // entrada o de asignación (no se ha empezado a trabajar), avanza a la
    // primera etapa de trabajo en curso del pipeline; en cualquier otra
    // etapa (revisión, confirmada, etc.) no se pisa.
    const captacionUpdates: any = {
      last_contact_attempt_at: new Date().toISOString(),
      ...panelChange(),
    };
    if (captacion.pipeline_id) {
      const stages = await getStagesForPipeline(captacion.pipeline_id);
      const currentStage = stages.find((s) => s.id === captacion.stage_id);
      if (currentStage && (currentStage.stage_type === "draft" || currentStage.stage_type === "assign")) {
        const workingStage = pickWorkingStage(stages);
        if (workingStage) captacionUpdates.stage_id = workingStage.id;
      }
    }
    // Próximo paso agendado (ej: "volver a llamar el viernes en la mañana")
    if (body.next_action_at !== undefined) {
      captacionUpdates.next_action_at = body.next_action_at || null;
      captacionUpdates.next_action_note = body.next_action_note || null;
    }
    // El intento ya quedó guardado; si la actualización de seguimiento falla
    // (ej: una migración pendiente en el VPS) se registra pero no se aborta,
    // para no perder el intento recién creado.
    const { error: updateError } = await db
      .from("captaciones")
      .update(captacionUpdates)
      .eq("id", id);
    if (updateError) {
      console.error("[captaciones log] update captacion:", updateError);
    }

    // Notificar al resto del equipo de la captación (creador y asignado,
    // excepto quien registró el intento)
    const propertyTitle = captacion.title || "Captación";
    const resultLabel = getResultLabel(body.result);
    const attemptTypeLabel = getAttemptTypeLabel(body.attempt_type);
    const notifyIds = [captacion.created_by, captacion.assigned_to].filter(
      (uid: string | null, i: number, arr: (string | null)[]) =>
        uid && uid !== profile.id && arr.indexOf(uid) === i
    );
    for (const uid of notifyIds) {
      const { error: notifyError } = await db.from("crm_notifications").insert({
        user_id: uid,
        type: "captacion_contact_attempt",
        title: `${attemptTypeLabel}: ${resultLabel}`,
        body: `${profile.full_name || "Alguien"} registró un intento en ${propertyTitle} - ${resultLabel}`,
        link: `/cl/admin/captaciones/${id}`,
        data: {
          captacion_id: id,
          attempt_type: body.attempt_type,
          result: body.result,
        },
      });
      if (notifyError) {
        console.error("[captaciones log] notificación:", notifyError);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[captaciones log]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error logging attempt" },
      { status: 500 }
    );
  }
}

function getAttemptTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    call: "Llamada",
    visit: "Visita presencial",
    message: "Mensaje",
    whatsapp: "WhatsApp",
  };
  return labels[type] || type;
}

function getResultLabel(result: string): string {
  const labels: Record<string, string> = {
    answered: "Respondió",
    no_answer: "No respondió",
    interested: "Interesado",
    not_interested: "No interesado",
    call_back: "Llamar después",
    wrong_number: "Número incorrecto",
    busy: "Ocupado",
    owner_found: "Dueño ubicado",
    visit_scheduled: "Visita agendada",
    no_owner_data: "Sin datos del dueño",
    left_note: "Se dejó nota/carta",
    nobody_home: "No había nadie",
  };
  return labels[result] || result;
}
