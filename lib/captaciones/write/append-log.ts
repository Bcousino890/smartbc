import "server-only";

/**
 * Pestaña «Intentos»: historial de contacto con el propietario.
 *
 * Además de insertar la fila en `captacion_logs`, mantiene en la ficha los
 * campos de seguimiento que el panel muestra en la cabecera
 * (`last_contact_attempt_at`, `next_action_at`, `next_action_note`), igual que
 * hace la ruta de intentos del admin.
 */

export const ATTEMPT_TYPES = ["call", "visit", "message", "whatsapp", "status_change"] as const;
export const ATTEMPT_RESULTS = [
  "answered",
  "no_answer",
  "interested",
  "not_interested",
  "call_back",
  "wrong_number",
  "busy",
] as const;

export type AttemptType = (typeof ATTEMPT_TYPES)[number];

export type AttemptInput = {
  external_id?: string | null;
  attempt_type: AttemptType;
  /** El CHECK de `result` se liberó en 0065; se acepta texto libre. */
  result: string;
  owner_phone?: string | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  address_real?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  /** Próximo paso agendado (columnas next_action_* de la migración 0077). */
  next_action_at?: string | null;
  next_action_note?: string | null;
};

export type AttemptSyncResult = {
  created: number;
  unchanged: number;
  errors: { external_id?: string | null; message: string }[];
};

export async function appendCaptacionAttempts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  createdBy: string,
  attempts: AttemptInput[],
  opts: { dryRun?: boolean } = {}
): Promise<AttemptSyncResult> {
  const result: AttemptSyncResult = { created: 0, unchanged: 0, errors: [] };
  if (attempts.length === 0) return result;

  // Los intentos ya recibidos no se duplican en una resincronización: se
  // identifican por el external_id del proveedor.
  const externalIds = attempts
    .map((a) => a.external_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const known = new Set<string>();
  if (externalIds.length > 0) {
    const { data } = await db
      .from("captacion_logs")
      .select("external_id")
      .eq("captacion_id", captacionId)
      .in("external_id", externalIds);
    for (const row of data ?? []) {
      if (row.external_id) known.add(row.external_id);
    }
  }

  let latestFollowUp: { at: string | null; note: string | null } | null = null;

  for (const attempt of attempts) {
    if (attempt.external_id && known.has(attempt.external_id)) {
      result.unchanged += 1;
      continue;
    }

    if (attempt.next_action_at !== undefined || attempt.next_action_note !== undefined) {
      latestFollowUp = {
        at: attempt.next_action_at ?? null,
        note: attempt.next_action_note ?? null,
      };
    }

    if (opts.dryRun) {
      result.created += 1;
      continue;
    }

    const { error } = await db.from("captacion_logs").insert({
      captacion_id: captacionId,
      created_by: createdBy,
      external_id: attempt.external_id ?? null,
      attempt_type: attempt.attempt_type,
      result: attempt.result,
      owner_phone: attempt.owner_phone ?? null,
      owner_name: attempt.owner_name ?? null,
      owner_contact: attempt.owner_contact ?? null,
      address_real: attempt.address_real ?? null,
      notes: attempt.notes ?? null,
      photo_url: attempt.photo_url ?? null,
    });

    if (error) {
      result.errors.push({ external_id: attempt.external_id, message: error.message });
      continue;
    }
    result.created += 1;
  }

  if (!opts.dryRun && result.created > 0) {
    const patch: Record<string, unknown> = {
      last_contact_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (latestFollowUp) {
      patch.next_action_at = latestFollowUp.at;
      patch.next_action_note = latestFollowUp.note;
    }
    await db.from("captaciones").update(patch).eq("id", captacionId);
  }

  return result;
}
