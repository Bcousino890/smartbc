"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { getPropertyForOffer } from "@/lib/db/queries/suggested-properties";
import { sendPropertyOfferEmail } from "@/lib/email/property-offer";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Botón "Enviar por correo" en una propiedad sugerida/seleccionada de la
 * ficha del cliente. Manual a propósito (no automático al añadir a la
 * selección): así el asesor decide el momento exacto y nunca se le manda al
 * cliente algo que todavía se está preparando internamente (p.ej. durante
 * "preparar visita").
 */
export async function offerPropertyToClient(
  clientId: string,
  propertyId: string,
  note?: string,
): Promise<ActionResult> {
  const gate = await checkPermission("clientes", "edit");
  if (!gate.ok) return gate;

  const db = createAdminClient() as any;

  const { data: client } = await db
    .from("profiles")
    .select("email, full_name")
    .eq("id", clientId)
    .maybeSingle();

  if (!client?.email) {
    return { ok: false, error: "El cliente no tiene un correo electrónico registrado." };
  }

  const property = await getPropertyForOffer(propertyId);
  if (!property) {
    return { ok: false, error: "No se encontró la propiedad." };
  }

  const result = await sendPropertyOfferEmail({
    to: client.email,
    clientName: client.full_name || "Cliente",
    property,
    note: note?.trim() || undefined,
  });

  if (!result.success) {
    return { ok: false, error: result.error || "No se pudo enviar el correo." };
  }

  return { ok: true };
}

/**
 * Activa/desactiva el aviso de "nuevas propiedades que coinciden" para un
 * cliente (digest de app/api/cron/property-alerts). Opt-in por cliente,
 * activado por un asesor — nunca se enciende solo.
 */
export async function setNewListingAlertsEnabled(
  clientId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const gate = await checkPermission("clientes", "edit");
  if (!gate.ok) return gate;

  const db = createAdminClient() as any;

  // Mismo patrón que saveClientPreferences: UPDATE si ya existe la fila de
  // preferencias, INSERT si no (client_preferences tiene PK = client_id).
  const existing = await db
    .from("client_preferences")
    .select("client_id")
    .eq("client_id", clientId)
    .maybeSingle();

  const payload = {
    new_listing_alerts_enabled: enabled,
    // Al activar por primera vez, arranca el reloj ahora — así el primer
    // digest solo incluye lo que entre DESPUÉS de activarlo, no el catálogo
    // entero acumulado hasta hoy.
    ...(enabled ? { new_listing_alerts_last_sent_at: new Date().toISOString() } : {}),
  };

  const { error } = existing.data
    ? await db.from("client_preferences").update(payload).eq("client_id", clientId)
    : await db.from("client_preferences").insert({ client_id: clientId, ...payload });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clientes");
  revalidatePath("/cl/admin/clientes");
  return { ok: true };
}
