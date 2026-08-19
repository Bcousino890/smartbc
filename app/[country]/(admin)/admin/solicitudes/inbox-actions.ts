"use server";

// ============================================================================
// SALES INBOX · escritura
//
// Lo que faltaba para que la bandeja sea un sitio donde se trabaja: asignar,
// registrar contacto, poner una próxima acción, vincular o crear el cliente
// conservando el origen, y hacerlo en lote.
//
// ⚠️ Aquí NO se reimplementa nada de lo que ya funciona. Crear y vincular
// cliente pasan por `confirmPrepareVisits`, que es el camino protegido (crea
// el `auth.user` de verdad, comprueba permisos y mete la propiedad en la
// selección). Esta capa solo añade alrededor lo que se perdía: **quién vino de
// dónde**.
// ============================================================================

import { revalidatePath } from "next/cache";
import { assertPermission, checkPermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { confirmPrepareVisits, lookupPrepareVisits } from "./prepare-visits-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export type ActionResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
}

/** Deja constancia en el hilo. Es lo que después deriva el estado comercial. */
async function log(
  leadId: string,
  kind: string,
  extra: { body?: string | null; outcome?: string | null } = {},
) {
  const profile = await getCurrentProfile();
  await db().from("lead_activity").insert({
    lead_id: leadId,
    author_id: profile?.id ?? null,
    kind,
    body: extra.body ?? null,
    outcome: extra.outcome ?? null,
  });
}

// ─── Asignación ──────────────────────────────────────────────────────────────

export async function assignLead(
  leadId: string,
  advisorId: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (advisorId) {
    const { data } = await db()
      .from("profiles")
      .select("id, role")
      .eq("id", advisorId)
      .maybeSingle();
    if (!data || data.role === "client") {
      return { ok: false, error: "Ese usuario no puede llevar leads." };
    }
  }

  const { error } = await db()
    .from("idealista_leads")
    .update({
      assigned_to: advisorId,
      assigned_at: advisorId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  await log(leadId, "assignment", { body: advisorId ? null : "sin asignar" });
  refresh();
  return { ok: true };
}

/** Un clic. Es el gesto más repetido de una bandeja compartida. */
export async function assignLeadToMe(leadId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "No autenticado" };
  return assignLead(leadId, profile.id);
}

// ─── Contacto ────────────────────────────────────────────────────────────────

export type ContactKind = "call" | "whatsapp" | "email" | "note";
export type CallOutcome = "answered" | "no_answer" | "callback";

/**
 * Registra un contacto. Abrir `tel:` no marca nada por sí solo: que suene el
 * teléfono no significa que se haya hablado, y de esa diferencia depende que
 * el lead pase a "contactado" o a "en conversación".
 */
export async function logContact(
  leadId: string,
  kind: ContactKind,
  opts: { outcome?: CallOutcome; body?: string } = {},
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (kind !== "call" && opts.outcome) {
    return { ok: false, error: "El resultado solo aplica a llamadas." };
  }
  await log(leadId, kind, { outcome: opts.outcome ?? null, body: opts.body ?? null });

  // Una llamada que quedó en devolver es, por definición, una próxima acción:
  // si no queda agendada, se pierde.
  if (kind === "call" && opts.outcome === "callback") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    await db()
      .from("idealista_leads")
      .update({ next_action_at: tomorrow.toISOString(), updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("next_action_at", null);
  }

  refresh();
  return { ok: true };
}

// ─── Seguimiento ─────────────────────────────────────────────────────────────

export async function setFollowUp(
  leadId: string,
  at: string | null,
  note: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (at && Number.isNaN(new Date(at).getTime())) {
    return { ok: false, error: "Fecha no válida." };
  }

  const { error } = await db()
    .from("idealista_leads")
    .update({
      next_action_at: at,
      next_action_note: note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  await log(leadId, "follow_up", { body: at ? (note?.trim() || null) : "seguimiento retirado" });
  refresh();
  return { ok: true };
}

/** Aplazar N días conservando la nota. */
export async function snoozeFollowUp(
  leadId: string,
  days: number,
): Promise<ActionResult> {
  const { data } = await db()
    .from("idealista_leads")
    .select("next_action_at, next_action_note")
    .eq("id", leadId)
    .maybeSingle();
  const from = data?.next_action_at ? new Date(data.next_action_at) : new Date();
  const base = from.getTime() < Date.now() ? new Date() : from;
  base.setDate(base.getDate() + days);
  return setFollowUp(leadId, base.toISOString(), data?.next_action_note ?? null);
}

// ─── Descartar ───────────────────────────────────────────────────────────────

export async function setLeadDiscarded(
  leadId: string,
  discarded: boolean,
  reason?: string,
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { error } = await db()
    .from("idealista_leads")
    .update({
      status: discarded ? "descartado" : "nuevo",
      // Descartar cierra el trabajo: dejar una alarma pendiente sería ruido.
      ...(discarded ? { next_action_at: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  await log(leadId, "discarded", { body: discarded ? (reason ?? null) : "recuperado" });
  refresh();
  return { ok: true };
}

// ─── Cliente ─────────────────────────────────────────────────────────────────

/** Los candidatos a ser la misma persona, con la cascada de siempre. */
export async function findClientCandidates(leadId: string) {
  return lookupPrepareVisits("idealista", leadId);
}

export type ConvertResult =
  | { ok: true; clientId: string; propertyAdded: boolean }
  | { ok: false; error: string };

/**
 * Vincula el lead a un cliente —existente o recién creado— y **guarda el
 * origen**: hasta ahora se convertía y se perdía de dónde venía la relación.
 *
 * El cliente lo crea `confirmPrepareVisits`, que es el camino protegido. Aquí
 * solo se añade lo que faltaba alrededor:
 *   · `client_id`, `converted_at`, `converted_by` en el lead;
 *   · el asesor del lead pasa a ser el asesor del cliente si no tenía;
 *   · una entrada en el hilo.
 *
 * El lead NO se borra ni se archiva: queda como CONVERTIDO y sigue abriéndose.
 */
export async function convertLeadToClient(input: {
  leadId: string;
  existingClientId?: string;
  newClient?: { name: string; email: string; phone: string };
  /** Añadir la propiedad del anuncio a la selección del cliente. */
  addProperty?: boolean;
}): Promise<ConvertResult> {
  const gate = await checkPermission("solicitudes", "edit");
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: lead } = await db()
    .from("idealista_leads")
    .select("id, assigned_to, matched_property_id, client_id")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Lead no encontrado." };

  // Ya vinculado: no se vuelve a ejecutar el emparejado ni se crea otro
  // cliente. Reutilizar el vínculo es justo lo que evita duplicados.
  if (lead.client_id && !input.existingClientId && !input.newClient) {
    return { ok: true, clientId: lead.client_id, propertyAdded: false };
  }

  const result = await confirmPrepareVisits({
    existingClientId: input.existingClientId,
    newClient: input.newClient,
    propertyId:
      input.addProperty !== false && lead.matched_property_id
        ? lead.matched_property_id
        : undefined,
  });
  if (!result.ok) return result;

  const profile = await getCurrentProfile();
  const { error } = await db()
    .from("idealista_leads")
    .update({
      client_id: result.clientId,
      converted_at: new Date().toISOString(),
      converted_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.leadId);
  if (error) {
    // El cliente YA existe. Avisamos en vez de fingir que no pasó nada: es
    // preferible un cliente sin origen a perder el cliente.
    return {
      ok: false,
      error: `Cliente creado, pero no se pudo guardar el origen: ${error.message}`,
    };
  }

  // Herencia de asesor: quien trabajó el lead se queda con el cliente, salvo
  // que ya tuviera uno.
  if (lead.assigned_to) {
    await db()
      .from("profiles")
      .update({ assigned_advisor_id: lead.assigned_to })
      .eq("id", result.clientId)
      .is("assigned_advisor_id", null);
  }

  await log(input.leadId, "conversion", {
    body: input.existingClientId ? "vinculado a cliente existente" : "cliente creado",
  });
  refresh();
  revalidatePath(`/es/admin/clientes/${result.clientId}`);
  revalidatePath(`/cl/admin/clientes/${result.clientId}`);
  return result;
}

// ─── Propiedad ───────────────────────────────────────────────────────────────

export async function matchLeadProperty(
  leadId: string,
  propertyId: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { error } = await db()
    .from("idealista_leads")
    .update({ matched_property_id: propertyId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ─── Lote ────────────────────────────────────────────────────────────────────
//
// A propósito NO hay envío masivo de WhatsApp ni de email: una bandeja con
// 322 leads y un botón de "escribir a todos" es una máquina de quemar la
// cuenta. El lote sirve para ORDENAR el trabajo, no para hacer campañas.

const BULK_MAX = 200;

export async function bulkAssign(
  leadIds: string[],
  advisorId: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const ids = leadIds.slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: false, error: "Nada seleccionado." };

  const { error } = await db()
    .from("idealista_leads")
    .update({
      assigned_to: advisorId,
      assigned_at: advisorId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const profile = await getCurrentProfile();
  await db()
    .from("lead_activity")
    .insert(
      ids.map((id) => ({
        lead_id: id,
        author_id: profile?.id ?? null,
        kind: "assignment",
        body: advisorId ? null : "sin asignar",
      })),
    );
  refresh();
  return { ok: true };
}

export async function bulkDiscard(leadIds: string[]): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const ids = leadIds.slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: false, error: "Nada seleccionado." };

  const { error } = await db()
    .from("idealista_leads")
    .update({ status: "descartado", next_action_at: null, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const profile = await getCurrentProfile();
  await db()
    .from("lead_activity")
    .insert(
      ids.map((id) => ({ lead_id: id, author_id: profile?.id ?? null, kind: "discarded" })),
    );
  refresh();
  return { ok: true };
}

export async function bulkSetLeadType(
  leadIds: string[],
  leadType: "particular" | "agencia" | "relocation",
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const ids = leadIds.slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: false, error: "Nada seleccionado." };
  const { error } = await db()
    .from("idealista_leads")
    .update({ lead_type: leadType, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function bulkSetFollowUp(
  leadIds: string[],
  at: string,
): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const ids = leadIds.slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: false, error: "Nada seleccionado." };
  if (Number.isNaN(new Date(at).getTime())) {
    return { ok: false, error: "Fecha no válida." };
  }
  const { error } = await db()
    .from("idealista_leads")
    .update({ next_action_at: at, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const profile = await getCurrentProfile();
  await db()
    .from("lead_activity")
    .insert(
      ids.map((id) => ({ lead_id: id, author_id: profile?.id ?? null, kind: "follow_up" })),
    );
  refresh();
  return { ok: true };
}

// ─── Auxiliar ────────────────────────────────────────────────────────────────

/** Buscador de propiedades para emparejar a mano, sin salir del workspace. */
export async function searchPropertiesForLead(term: string) {
  const gate = await checkPermission("solicitudes", "view");
  if (!gate.ok) return [];
  const q = term.trim();
  if (q.length < 2) return [];
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return [];

  const like = `%${q.replace(/[%,]/g, " ")}%`;
  const { data } = await db()
    .from("properties")
    .select("id, slug, title, property_reference, price, operation, cover_photo_url")
    .or(`title.ilike.${like},address.ilike.${like},property_reference.ilike.${like}`)
    .limit(12);
  return (data ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    title: p.title ?? "—",
    reference: p.property_reference ?? null,
    price: p.price === null ? null : Number(p.price),
    operation: p.operation ?? null,
    coverUrl: p.cover_photo_url ?? null,
  }));
}
