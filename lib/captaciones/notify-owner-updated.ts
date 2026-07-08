// Notifica al equipo de la captación (ejecutivo creador y asignado) que los
// datos del propietario fueron actualizados y ya puede llamar. Se usa al
// guardar/editar contactos y datos del dueño. Nunca lanza: la notificación
// es secundaria al guardado.
export async function notifyOwnerUpdated(
  db: any,
  captacionId: string,
  actorId: string | null
): Promise<void> {
  try {
    const { data: captacion } = await db
      .from("captaciones")
      .select("created_by, assigned_to, title")
      .eq("id", captacionId)
      .single();
    if (!captacion) return;

    const propertyTitle = captacion.title || "Captación";
    const notifyIds = [captacion.created_by, captacion.assigned_to].filter(
      (uid: string | null, i: number, arr: (string | null)[]) =>
        uid && uid !== actorId && arr.indexOf(uid) === i
    );
    for (const uid of notifyIds) {
      await db.from("crm_notifications").insert({
        user_id: uid,
        type: "captacion_owner_updated",
        title: "📞 Propietario actualizado",
        body: `Ya tienes el propietario actualizado de la captación: ${propertyTitle}`,
        link: `/cl/admin/captaciones/${captacionId}`,
        data: { captacion_id: captacionId },
      });
    }
  } catch (err) {
    console.error("[notifyOwnerUpdated]", err);
  }
}
