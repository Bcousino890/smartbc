import "server-only";

/**
 * Notificaciones del CRM para captaciones.
 *
 * Extraído de app/api/admin/cl/captaciones/[id]/update/route.ts: cuando una
 * captación entra o cambia por API, el equipo tiene que enterarse igual que si
 * lo hubiera hecho una persona desde el panel.
 *
 * Best-effort a propósito: una notificación que falla nunca debe tumbar la
 * ingesta (mismo criterio que lib/captaciones/notify-owner-updated.ts).
 */

type NotificationTargets = {
  createdBy?: string | null;
  assignedTo?: string | null;
  /** Actor de la acción: no se le notifica a sí mismo. */
  actorId?: string | null;
};

function uniqueTargets({ createdBy, assignedTo, actorId }: NotificationTargets): string[] {
  const ids = [createdBy, assignedTo].filter(
    (id): id is string => typeof id === "string" && id.length > 0 && id !== actorId
  );
  return Array.from(new Set(ids));
}

async function insertNotifications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userIds: string[],
  payload: { type: string; title: string; body: string; captacionId: string }
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const rows = userIds.map((uid) => ({
      user_id: uid,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: `/cl/admin/captaciones/${payload.captacionId}`,
      data: { captacion_id: payload.captacionId },
    }));
    await db.from("crm_notifications").insert(rows);
  } catch (err) {
    console.error("[captacion notify]", err);
  }
}

/** El dueño ha confirmado que quiere vender. */
export async function notifyOwnerConfirmed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  propertyTitle: string | null,
  targets: NotificationTargets,
  actorLabel: string
): Promise<void> {
  await insertNotifications(db, uniqueTargets(targets), {
    type: "captacion_confirmed",
    title: "✅ Captación confirmada",
    body: `${actorLabel} confirmó que el dueño quiere vender: ${propertyTitle || "Captación"}`,
    captacionId,
  });
}

/** Han llegado o cambiado los datos de contacto del propietario. */
export async function notifyOwnerUpdated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  propertyTitle: string | null,
  targets: NotificationTargets
): Promise<void> {
  await insertNotifications(db, uniqueTargets(targets), {
    type: "captacion_owner_updated",
    title: "📞 Propietario actualizado",
    body: `Ya tienes el propietario actualizado de la captación: ${propertyTitle || "Captación"}`,
    captacionId,
  });
}

/** Una integración ha creado una captación nueva. */
export async function notifyCaptacionImported(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  propertyTitle: string | null,
  clientName: string,
  targets: NotificationTargets
): Promise<void> {
  await insertNotifications(db, uniqueTargets(targets), {
    type: "captacion_imported",
    title: "🔌 Captación recibida por API",
    body: `${clientName} envió una captación nueva: ${propertyTitle || "Sin título"}`,
    captacionId,
  });
}
