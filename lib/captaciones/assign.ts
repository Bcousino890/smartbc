import "server-only";
import { panelChange } from "./panel-change";

/**
 * Aplica la asignación de una captación a un usuario y deja todo consistente:
 *   1. Actualiza `assigned_to` / `assigned_at`.
 *   2. Si el pipeline tiene una etapa de tipo "assign" (p. ej. "Asignada"), mueve
 *      la captación ahí (mismo comportamiento que arrastrar la tarjeta a esa
 *      columna).
 *   3. Registra un log de captación (no crítico).
 *   4. Notifica al usuario asignado (no crítico).
 *
 * NO valida permisos ni que el destinatario sea staff: eso es responsabilidad
 * del llamador (la ruta manual valida al actor y al usuario; el reparto
 * automático solo usa usuarios del pool que el admin ya curó). Así la misma
 * lógica sirve para la asignación manual y para el reparto automático, sin que
 * se puedan desincronizar.
 *
 * @returns la fila de la captación ya actualizada.
 */
export async function applyCaptacionAssignment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  opts: {
    captacion: { id: string; title: string | null; pipeline_id: string | null };
    assigneeId: string;
    assigneeName: string | null;
    assignedBy: { id: string; full_name?: string | null };
    /** Marca la asignación como automática (cambia el texto de log/notificación). */
    auto?: boolean;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { captacion, assigneeId, assigneeName, assignedBy, auto } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {
    assigned_to: assigneeId,
    assigned_at: new Date().toISOString(),
    // Una asignación MANUAL es trabajo del equipo y se marca como tal. El
    // reparto automático no: lo dispara la creación por API, y contarlo como
    // cambio del panel devolvería al integrador el eco de su propio envío.
    ...(auto ? { updated_at: new Date().toISOString() } : panelChange()),
  };

  // Si el pipeline tiene una etapa de tipo "assign", la captación se mueve ahí.
  // Si no tiene ninguna, solo se actualiza el usuario asignado.
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
    .eq("id", captacion.id)
    .select()
    .single();

  if (updateError) throw updateError;

  const who = assigneeName || "usuario";

  // Log de captación (no crítico: attempt_type/result deben estar en el set
  // permitido; si el enum de la BD está desincronizado se ignora el error).
  await db
    .from("captacion_logs")
    .insert({
      captacion_id: captacion.id,
      created_by: assignedBy.id,
      attempt_type: "message",
      result: "assigned",
      notes: auto ? `Asignada automáticamente a ${who}` : `Asignada a ${who}`,
    })
    .then(() => {})
    .catch(() => {}); // non-critical, ignore errors

  // Notificación al usuario asignado (no crítico: la asignación ya quedó
  // guardada aunque falle el aviso).
  const propertyTitle = captacion.title || "Captación";
  await db
    .from("crm_notifications")
    .insert({
      user_id: assigneeId,
      type: "captacion_assigned",
      title: auto ? "Nueva captación asignada (automática)" : "Nueva captación asignada",
      body: auto
        ? `Se te asignó automáticamente una captación: ${propertyTitle}`
        : `${assignedBy.full_name || "Admin"} te asignó una captación: ${propertyTitle}`,
      link: `/cl/admin/captaciones/${captacion.id}`,
      data: {
        captacion_id: captacion.id,
        assigned_by: assignedBy.id,
        assigned_by_name: assignedBy.full_name,
        auto: Boolean(auto),
      },
    })
    .then(() => {})
    .catch((e: unknown) => {
      console.warn("[captacion assign] notificación no enviada:", e);
    });

  return updated;
}
