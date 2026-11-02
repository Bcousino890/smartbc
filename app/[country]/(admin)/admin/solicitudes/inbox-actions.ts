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
import { assertPermission, checkPermission, checkRoles } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canActOnLead, canActOnLeads, LEADS_COUNTRY } from "@/lib/db/queries/view-scope";
import { getClientReassignScope, type ClientReassignScope } from "@/lib/db/queries/routing";
import { ADMIN_ROLES, isExactLink, routingErrorMessage } from "@/lib/sales-inbox/routing";
import { confirmPrepareVisits, lookupPrepareVisits } from "./prepare-visits-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export type ActionResult = { ok: true } | { ok: false; error: string };

const NO_ACCESS = "No tienes acceso a esta solicitud.";

/** Filtra a los leads editables por el alcance; error si no queda ninguno. */
async function allowedBulkIds(
  leadIds: string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const ids = leadIds.slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: false, error: "Nada seleccionado." };
  const allowed = await canActOnLeads(ids, "edit");
  if (allowed.length === 0) return { ok: false, error: NO_ACCESS };
  return { ok: true, ids: allowed };
}

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
//
// Política confirmada (2026-11-02): solo un ADMINISTRADOR asigna o reasigna, y
// el cliente tiene un único asesor. Una solicitud con cliente vinculado no se
// asigna suelta: se reasigna el cliente entero (`reassignClient`). La base
// vuelve a comprobar el rol y la versión (assign_lead_admin, 0237).

const ADMIN_ONLY = "Solo un administrador puede asignar o reasignar. Las solicitudes nuevas se reparten solas por inmueble.";

async function adminGate() {
  return checkRoles(ADMIN_ROLES, { country: LEADS_COUNTRY, message: ADMIN_ONLY });
}

/**
 * Asigna (o deja sin asignar) una solicitud SIN cliente vinculado.
 * `expectedVersion` es la versión de asignación que vio la pantalla: si otra
 * persona la cambió entretanto, no se sobrescribe.
 */
export async function assignLead(
  leadId: string,
  advisorId: string | null,
  opts: { expectedVersion?: number; reason?: string } = {},
): Promise<ActionResult> {
  const gate = await adminGate();
  if (!gate.ok) return gate;

  let expected = opts.expectedVersion;
  if (expected === undefined) {
    const { data } = await db()
      .from("idealista_leads")
      .select("assignment_version")
      .eq("id", leadId)
      .maybeSingle();
    if (!data) return { ok: false, error: NO_ACCESS };
    expected = Number(data.assignment_version ?? 0);
  }

  const { error } = await db().rpc("assign_lead_admin", {
    p_actor: gate.profile.id,
    p_lead: leadId,
    p_advisor: advisorId,
    p_reason: opts.reason?.trim() || null,
    p_expected_version: expected,
  });
  if (error) return { ok: false, error: routingErrorMessage(error) };
  refresh();
  return { ok: true };
}

/** Un clic para el administrador que se queda una solicitud pendiente. */
export async function assignLeadToMe(leadId: string, expectedVersion?: number): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "No autenticado" };
  return assignLead(leadId, profile.id, { expectedVersion });
}

/** Lo que mueve reasignar a este cliente. Solo administradores. */
export async function getReassignScope(
  clientId: string,
): Promise<{ ok: true; scope: ClientReassignScope } | { ok: false; error: string }> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  const scope = await getClientReassignScope(clientId);
  if (!scope) return { ok: false, error: "Cliente no encontrado." };
  return { ok: true, scope };
}

export type ReassignResult =
  | { ok: true; leads: number; tasks: number; unchanged: boolean }
  | { ok: false; error: string };

/**
 * Reasigna el cliente completo: su asesor, sus solicitudes abiertas (con sus
 * tareas) y la conversación de Zinto (en cola). Los contactos, notas y
 * eventos anteriores conservan su autor.
 */
export async function reassignClient(input: {
  clientId: string;
  advisorId: string;
  reason: string;
  expectedVersion: number;
}): Promise<ReassignResult> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  const { data, error } = await db().rpc("reassign_client_admin", {
    p_actor: gate.profile.id,
    p_client: input.clientId,
    p_advisor: input.advisorId,
    p_reason: input.reason,
    p_expected_version: input.expectedVersion,
  });
  if (error) return { ok: false, error: routingErrorMessage(error) };
  refresh();
  revalidatePath(`/es/admin/clientes/${input.clientId}`);
  revalidatePath(`/cl/admin/clientes/${input.clientId}`);
  return {
    ok: true,
    leads: Number(data?.leads ?? 0),
    tasks: Number(data?.tasks ?? 0),
    unchanged: data?.outcome === "unchanged",
  };
}

/** Reintento autorizado de la sincronización con Zinto (sin duplicar). */
export async function retryZintoSync(syncId: string): Promise<ActionResult> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  const { data, error } = await db().rpc("zinto_owner_sync_retry", {
    p_actor: gate.profile.id,
    p_id: syncId,
  });
  if (error) return { ok: false, error: routingErrorMessage(error) };
  if (data === "not_retryable") {
    return { ok: false, error: "Esa sincronización ya no es la vigente; recarga la ficha." };
  }
  refresh();
  return { ok: true };
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
  if (!(await canActOnLead(leadId, "edit"))) return { ok: false, error: NO_ACCESS };
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

/**
 * «Registrar contacto»: resultado obligatorio, nota opcional y, si se pide, la
 * próxima tarea, en UNA transacción (lead_register_contact, 0237).
 * `clientKey` lo genera el formulario al abrirse: un doble clic o un
 * reintento tras un corte no duplica nada.
 *
 * Abrir Zinto o el teléfono NO pasa por aquí: no son contacto.
 */
export async function registerContact(input: {
  leadId: string;
  /** Habló / No contesta (llamada), Email enviado, Escrito por WhatsApp. */
  result: "answered" | "no_answer" | "email" | "whatsapp";
  note?: string;
  task?: { at: string; note?: string } | null;
  completeTask?: boolean;
  clientKey: string;
}): Promise<ActionResult & { duplicate?: boolean }> {
  const gate = await checkPermission("solicitudes", "edit");
  if (!gate.ok) return gate;
  if (!(await canActOnLead(input.leadId, "edit"))) return { ok: false, error: NO_ACCESS };
  if (input.task && Number.isNaN(new Date(input.task.at).getTime())) {
    return { ok: false, error: "Fecha de la tarea no válida." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.clientKey)) return { ok: false, error: "Formulario no válido; recarga." };

  const isCall = input.result === "answered" || input.result === "no_answer";
  const { data, error } = await db().rpc("lead_register_contact", {
    p_actor: gate.profile.id,
    p_lead: input.leadId,
    p_kind: isCall ? "call" : input.result,
    p_outcome: isCall ? input.result : null,
    p_note: input.note?.trim() || null,
    p_next_at: input.task?.at ?? null,
    p_next_note: input.task?.note?.trim() || null,
    p_complete_task: !!input.completeTask,
    p_client_key: input.clientKey,
  });
  if (error) {
    const raw = error.message ?? "";
    if (/outcome_required/.test(raw)) return { ok: false, error: "Indica qué ocurrió en la llamada." };
    return { ok: false, error: raw || "No se pudo guardar el contacto." };
  }
  refresh();
  return { ok: true, duplicate: data?.outcome === "duplicate" };
}

// ─── Unir solicitudes del mismo teléfono ─────────────────────────────────────

export type MergeResult =
  | { ok: true; survivorId: string; merged: number }
  | { ok: false; error: string };

/**
 * Une en UNA todas las solicitudes con el mismo teléfono (últimos 9 dígitos).
 *
 * La fusión automática de la ingesta se frena cuando los nombres son
 * distintos (pareja, oficina) y solo mira lo que entra en cada captura, así
 * que lo anterior se quedaba duplicado. Aquí decide una persona: el botón es
 * explícito, y por eso no se aplica la revisión por nombre.
 *
 * Misma mecánica que `autoMergeLeadsByPhone`: sobrevive la MÁS ANTIGUA, el
 * historial y los chats de Zinto pasan a ella y a las demás se les marca
 * `merged_into_id` (no se borra nada; separar es ponerlo a NULL).
 */
export async function mergeSamePhoneLeads(leadId: string): Promise<MergeResult> {
  const gate = await checkPermission("solicitudes", "edit");
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!(await canActOnLead(leadId, "edit"))) return { ok: false, error: NO_ACCESS };

  const { data: lead } = await db()
    .from("idealista_leads")
    .select("id, phone_digits")
    .eq("id", leadId)
    .maybeSingle();
  const digits = String(lead?.phone_digits ?? "").replace(/\D/g, "");
  if (digits.length < 9) return { ok: false, error: "La solicitud no tiene teléfono." };
  const tail = digits.slice(-9);

  const { data: rows, error } = await db()
    .from("idealista_leads")
    .select("id, phone_digits, created_at, client_id, converted_at, converted_by, property_title")
    .like("phone_digits", `%${tail}`)
    .is("merged_into_id", null)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return { ok: false, error: error.message };

  // `like %tail` puede traer un número más largo que TERMINA igual.
  const group = ((rows ?? []) as any[]).filter(
    (r) => String(r.phone_digits ?? "").replace(/\D/g, "").slice(-9) === tail,
  );
  if (group.length < 2) return { ok: false, error: "No hay otra solicitud con este teléfono." };

  // Solo se une lo que esta persona puede editar: no se esconde una solicitud
  // ajena dentro de otra.
  const allowed = new Set(await canActOnLeads(group.map((r) => r.id), "edit"));
  if (group.some((r) => !allowed.has(r.id))) return { ok: false, error: NO_ACCESS };

  const [survivor, ...rest] = group;
  const ids = rest.map((r) => r.id);

  // Historial primero: si se corta entre las dos escrituras quedan dos leads
  // visibles con el historial ya junto, nunca uno escondido con el suyo colgando.
  await db().from("lead_activity").update({ lead_id: survivor.id }).in("lead_id", ids);
  await db().from("zinto_conversations").update({ lead_id: survivor.id }).in("lead_id", ids);

  // Si la que sobrevive no está vinculada a un cliente y otra sí, no se pierde el vínculo.
  const linked = rest.find((r) => r.client_id);
  if (!survivor.client_id && linked) {
    await db()
      .from("idealista_leads")
      .update({
        client_id: linked.client_id,
        converted_at: linked.converted_at,
        converted_by: linked.converted_by,
      })
      .eq("id", survivor.id);
  }

  const { error: mergeError } = await db()
    .from("idealista_leads")
    .update({ merged_into_id: survivor.id, merged_at: new Date().toISOString() })
    .in("id", ids);
  if (mergeError) return { ok: false, error: mergeError.message };

  // Los pisos por los que preguntaron las absorbidas dejan de verse en su
  // propia fila: se anotan en el hilo para no perder esa información.
  const titles = [...new Set(rest.map((r) => r.property_title).filter(Boolean))];
  await log(survivor.id, "note", {
    body: `Unida con ${ids.length} solicitud${ids.length === 1 ? "" : "es"} del mismo teléfono${
      titles.length ? `: ${titles.join(" · ")}` : ""
    }`,
  });

  refresh();
  return { ok: true, survivorId: survivor.id, merged: ids.length };
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
  if (!(await canActOnLead(leadId, "edit"))) return { ok: false, error: NO_ACCESS };

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
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!(await canActOnLead(leadId, "edit"))) return { ok: false, error: NO_ACCESS };
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
  if (!(await canActOnLead(leadId, "edit"))) return { ok: false, error: NO_ACCESS };
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
  if (!(await canActOnLead(input.leadId, "edit"))) return { ok: false, error: NO_ACCESS };

  const { data: lead } = await db()
    .from("idealista_leads")
    .select("id, assigned_to, matched_property_id, client_id, property_link_method")
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
    // Solo un inmueble CONFIRMADO entra en la selección del cliente: con un
    // enlace sin evidencia se estaría preparando la visita a un piso supuesto.
    propertyId:
      input.addProperty !== false && lead.matched_property_id && isExactLink(lead.property_link_method)
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

  // Un asesor por cliente (route_lead, 0237): si el cliente ya tenía asesor,
  // la solicitud lo hereda (también si la había repartido la regla del piso,
  // con auditoría); si no lo tenía, el cliente toma el de la solicitud. Solo
  // cuando un ADMINISTRADOR asignó la solicitud a otra persona queda en
  // conflicto visible, para que decida un administrador.
  const { error: routeError } = await db().rpc("route_lead", { p_lead: input.leadId });
  if (routeError) console.error("[convertLeadToClient] route_lead", routeError.message);

  await log(input.leadId, "conversion", {
    body: input.existingClientId ? "vinculado a cliente existente" : "cliente creado",
  });
  refresh();
  revalidatePath(`/es/admin/clientes/${result.clientId}`);
  revalidatePath(`/cl/admin/clientes/${result.clientId}`);
  return result;
}

// ─── Propiedad ───────────────────────────────────────────────────────────────

/**
 * «Revisar vínculo»: corrección autorizada del anuncio consultado, con motivo
 * y auditoría (set_lead_link_manual, 0237). Sustituye a la edición sin rastro
 * de antes. `propertyId = null` deja la solicitud sin vínculo («Por verificar»).
 */
export async function matchLeadProperty(
  leadId: string,
  propertyId: string | null,
  reason?: string,
): Promise<ActionResult> {
  const gate = await checkPermission("solicitudes", "edit");
  if (!gate.ok) return gate;
  if (!(await canActOnLead(leadId, "edit"))) return { ok: false, error: NO_ACCESS };
  if (!reason?.trim()) return { ok: false, error: "Indica el motivo y la evidencia de la corrección." };

  // El anuncio de Idealista se conserva solo si es de ESA ficha.
  const { data: lead } = await db()
    .from("idealista_leads")
    .select("matched_listing_id")
    .eq("id", leadId)
    .maybeSingle();
  let listingId: string | null = null;
  if (propertyId && lead?.matched_listing_id) {
    const { data: l } = await db()
      .from("idealista_listings")
      .select("property_id")
      .eq("id", lead.matched_listing_id)
      .maybeSingle();
    if (l?.property_id === propertyId) listingId = lead.matched_listing_id;
  }

  const { error } = await db().rpc("set_lead_link_manual", {
    p_actor: gate.profile.id,
    p_lead: leadId,
    p_property: propertyId,
    p_listing: listingId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: routingErrorMessage(error) };
  refresh();
  return { ok: true };
}

// ─── Lote ────────────────────────────────────────────────────────────────────
//
// A propósito NO hay envío masivo de WhatsApp ni de email: una bandeja con
// 322 leads y un botón de "escribir a todos" es una máquina de quemar la
// cuenta. El lote sirve para ORDENAR el trabajo, no para hacer campañas.

const BULK_MAX = 200;

export type BulkItemResult = { id: string; ok: boolean; error?: string };

/**
 * Asignar en lote (solo administradores). Cada solicitud se asigna por
 * separado, con su versión, y devuelve su resultado: las que tienen cliente
 * vinculado o cambiaron entretanto se informan, no se fuerzan.
 */
export async function bulkAssign(
  leadIds: string[],
  advisorId: string | null,
): Promise<{ ok: true; results: BulkItemResult[] } | { ok: false; error: string }> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  const ids = [...new Set(leadIds)].slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: false, error: "Nada seleccionado." };

  const { data: rows } = await db()
    .from("idealista_leads")
    .select("id, assignment_version")
    .in("id", ids);
  const versions = new Map<string, number>(
    ((rows ?? []) as any[]).map((r) => [r.id, Number(r.assignment_version ?? 0)]),
  );

  const results: BulkItemResult[] = [];
  for (const id of ids) {
    if (!versions.has(id)) {
      results.push({ id, ok: false, error: "No encontrada." });
      continue;
    }
    const { error } = await db().rpc("assign_lead_admin", {
      p_actor: gate.profile.id,
      p_lead: id,
      p_advisor: advisorId,
      p_reason: "Asignación en lote",
      p_expected_version: versions.get(id),
    });
    results.push(error ? { id, ok: false, error: routingErrorMessage(error) } : { id, ok: true });
  }
  refresh();
  return { ok: true, results };
}

/** Descartar en lote: reversible (Recuperar) y con el motivo en el hilo. */
export async function bulkDiscard(leadIds: string[], reason?: string): Promise<ActionResult> {
  try {
    await assertPermission("solicitudes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const scoped = await allowedBulkIds(leadIds);
  if (!scoped.ok) return scoped;
  const ids = scoped.ids;

  const { error } = await db()
    .from("idealista_leads")
    .update({ status: "descartado", next_action_at: null, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const profile = await getCurrentProfile();
  await db()
    .from("lead_activity")
    .insert(
      ids.map((id) => ({
        lead_id: id,
        author_id: profile?.id ?? null,
        kind: "discarded",
        body: reason?.trim() || null,
      })),
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
  const scoped = await allowedBulkIds(leadIds);
  if (!scoped.ok) return scoped;
  const ids = scoped.ids;
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
  const scoped = await allowedBulkIds(leadIds);
  if (!scoped.ok) return scoped;
  const ids = scoped.ids;
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
