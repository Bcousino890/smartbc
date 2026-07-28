import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getCaptacionEditableFields } from "@/lib/permissions";
import { getCaptacionActor, actorCanWorkCaptacion } from "@/lib/db/queries/captacion-access";
import { getStagesForPipeline, pickWorkingStage } from "@/lib/captaciones/pipeline";

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

    // Permisos EFECTIVOS (rol por país + rol personalizado + excepciones del
    // usuario). Antes se miraba `profile.role` a pelo, así que un rol de Chile
    // o un rol personalizado con permiso de edición recibía 403 al guardar.
    const actor = await getCaptacionActor(profile);

    const body = await request.json();
    const db = createAdminClient() as any;

    // Obtener la captación
    const { data: captacion } = await db
      .from("captaciones")
      .select("assigned_to, created_by, title, owner_confirmed, status, pipeline_id, stage_id")
      .eq("id", id)
      .single();

    if (!captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    // Etapas del pipeline de esta captación (para las auto-transiciones de
    // abajo: confirmar/desconfirmar dueño, primeros datos preliminares)
    const stages = captacion.pipeline_id ? await getStagesForPipeline(captacion.pipeline_id) : [];
    const currentStage = stages.find((s) => s.id === captacion.stage_id) || null;

    // Validar acceso a ESTA captación: asignado, creador o permiso de edición.
    if (!actorCanWorkCaptacion(actor, captacion)) {
      return NextResponse.json({ error: "No tienes acceso a esta captación" }, { status: 403 });
    }

    // Restricciones de campos por rol efectivo (ficha y estado siguen siendo
    // de los roles con mando; los datos del dueño los edita quien trabaja la
    // captación).
    const isAdmin = actor.isAdmin;
    const fieldRestrictions = getCaptacionEditableFields(actor.role);
    const canEditPropertyFields = isAdmin || fieldRestrictions.canEditPropertyFields;
    const canEditStatusField = isAdmin || fieldRestrictions.canEditStatus;

    // Detectar qué tipo de campos intenta editar
    // (commune se excluye: la captadora la corrige desde la pestaña Ubicación)
    const isEditingPropertyFields = [
      "title", "price", "currency", "bedrooms", "bathrooms",
      "square_meters", "region", "zone", "subzone"
    ].some(field => field in body && body[field] !== undefined);

    const isEditingStatus = "status" in body && body.status !== undefined;

    // Quien no tiene mando sobre la ficha solo edita los datos del dueño
    if (isEditingPropertyFields && !canEditPropertyFields) {
      return NextResponse.json(
        { error: "Solo puedes editar los datos del propietario" },
        { status: 403 }
      );
    }
    if (isEditingStatus && !canEditStatusField) {
      return NextResponse.json(
        { error: "No puedes cambiar el estado de la captación" },
        { status: 403 }
      );
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
    if (body.property_type !== undefined) updates.property_type = body.property_type || null;
    if (body.rol_propiedad !== undefined) updates.rol_propiedad = body.rol_propiedad || null;
    if (body.commune !== undefined) updates.commune = body.commune || null;
    if (body.address_verified !== undefined) updates.address_verified = body.address_verified || false;
    if (body.latitude !== undefined && body.latitude !== null) updates.latitude = body.latitude;
    if (body.longitude !== undefined && body.longitude !== null) updates.longitude = body.longitude;

    // Campos de la ficha: solo quien tiene mando sobre ella
    if (canEditPropertyFields) {
      if (body.title !== undefined) updates.title = body.title || null;
      if (body.price !== undefined) updates.price = body.price || null;
      if (body.currency !== undefined) updates.currency = body.currency || null;
      if (body.bedrooms !== undefined) updates.bedrooms = body.bedrooms || null;
      if (body.bathrooms !== undefined) updates.bathrooms = body.bathrooms || null;
      if (body.square_meters !== undefined) updates.square_meters = body.square_meters || null;
      if (body.region !== undefined) updates.region = body.region || null;
      if (body.zone !== undefined) updates.zone = body.zone || null;
    }

    // Auto-mover de etapa si se marca/desmarca como confirmado
    const isCurrentlyConfirmed = currentStage?.stage_type === "confirmed";
    if (nowConfirmed && !isCurrentlyConfirmed) {
      const confirmedStage = stages.find((s) => s.stage_type === "confirmed");
      if (confirmedStage) updates.stage_id = confirmedStage.id;
      updates.completed_at = new Date().toISOString();
    } else if (!nowConfirmed && isCurrentlyConfirmed) {
      // Si desmarca, vuelve a la primera etapa de trabajo en curso
      const workingStage = pickWorkingStage(stages);
      if (workingStage) updates.stage_id = workingStage.id;
      updates.completed_at = null;
    }

    // Al llenar los primeros datos del dueño desde la etapa de asignación,
    // avanza a la primera etapa de trabajo en curso del pipeline (lo haga
    // quien lo haga: el trabajo ya empezó, igual que al registrar un intento)
    if (currentStage?.stage_type === "assign" && (body.owner_phone || body.owner_name)) {
      const workingStage = pickWorkingStage(stages);
      if (workingStage) updates.stage_id = workingStage.id;
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
    } else if (body.owner_phone || body.owner_name || body.owner_contact || body.address_real) {
      // Datos del propietario actualizados: avisar al ejecutivo (creador) y
      // al asignado para que ya pueda llamar — excepto a quien editó.
      const propertyTitle = captacion.title || "Captación";
      const notifyIds = [captacion.created_by, captacion.assigned_to].filter(
        (uid: string | null, i: number, arr: (string | null)[]) =>
          uid && uid !== profile.id && arr.indexOf(uid) === i
      );
      for (const uid of notifyIds) {
        await db.from("crm_notifications").insert({
          user_id: uid,
          type: "captacion_owner_updated",
          title: "📞 Propietario actualizado",
          body: `Ya tienes el propietario actualizado de la captación: ${propertyTitle}`,
          link: `/cl/admin/captaciones/${id}`,
          data: { captacion_id: id },
        });
      }
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
