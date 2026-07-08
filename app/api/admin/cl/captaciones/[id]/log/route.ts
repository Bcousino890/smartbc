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

    const { data: captacion } = await db
      .from("captaciones")
      .select("assigned_to, created_by, title, status")
      .eq("id", id)
      .single();

    if (!captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    // Pueden registrar intentos: la captadora/ejecutivo asignado, el creador
    // (agente) y los admins — antes solo captadoras, pero el seguimiento
    // también lo hacen los ejecutivos que llaman.
    const isAdmin = profile.role === "admin" || profile.role === "agent_admin";
    const isAssigned = captacion.assigned_to === profile.id;
    const isCreator = captacion.created_by === profile.id;
    if (!isAdmin && !isAssigned && !isCreator) {
      return NextResponse.json(
        { error: "No tienes acceso a esta captación" },
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

    // Actualizar seguimiento en la captación. El estado pasa a "contactando"
    // solo si el workflow está en una etapa previa (no pisar confirmada,
    // rechazada, visita presencial ni revisión).
    const captacionUpdates: any = {
      last_contact_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (["assigned", "preliminary_data", "contacting"].includes(captacion.status)) {
      captacionUpdates.status = "contacting";
    }
    // Próximo paso agendado (ej: "volver a llamar el viernes en la mañana")
    if (body.next_action_at !== undefined) {
      captacionUpdates.next_action_at = body.next_action_at || null;
      captacionUpdates.next_action_note = body.next_action_note || null;
    }
    await db.from("captaciones").update(captacionUpdates).eq("id", id);

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
      await db.from("crm_notifications").insert({
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
