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
    if (!profile || profile.role !== "captadora") {
      return NextResponse.json({ error: "Only captadoras can log attempts" }, { status: 403 });
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    // Verify ownership
    const { data: captacion } = await db
      .from("captaciones")
      .select("assigned_to")
      .eq("id", id)
      .single();

    if (!captacion || captacion.assigned_to !== profile.id) {
      return NextResponse.json({ error: "Not assigned to you" }, { status: 403 });
    }

    // Obtener info de la captacion para notificaciones
    const { data: captacionInfo } = await db
      .from("captaciones")
      .select("created_by, title")
      .eq("id", id)
      .single();

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

    // Actualizar last_contact_attempt_at en la captacion
    await db
      .from("captaciones")
      .update({
        last_contact_attempt_at: new Date().toISOString(),
        status: "contacting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Notificar al agente del intento de contacto
    if (captacionInfo?.created_by) {
      const propertyTitle = captacionInfo.title || "Captación";
      const resultLabel = getResultLabel(body.result);
      const attemptTypeLabel = getAttemptTypeLabel(body.attempt_type);

      await db.from("crm_notifications").insert({
        user_id: captacionInfo.created_by,
        type: "captacion_contact_attempt",
        title: `${attemptTypeLabel}: ${resultLabel}`,
        body: `${profile.full_name || "Captadora"} contactó sobre ${propertyTitle} - ${resultLabel}`,
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
    visit: "Visita",
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
  };
  return labels[result] || result;
}
