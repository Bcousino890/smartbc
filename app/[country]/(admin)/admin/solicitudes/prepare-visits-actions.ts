"use server";

// ============================================================================
// Solicitudes → Viewing Collections.
//
// Solicitudes es una SEGUNDA PUERTA al mismo sistema, no otro sistema: aquí no
// se crea ninguna entidad de itinerario nueva. El flujo resuelve (o crea) el
// `profile` del cliente y aterriza en su ficha, donde viven la selección y los
// itinerarios de siempre.
//
// Tres casos:
//   1 · La solicitud ya tiene client_id (visit_requests) → directo a la ficha.
//   2 · Lead sin cliente (Idealista / consulta web) → crear cliente con los
//       datos ya conocidos, previa confirmación del agente en el diálogo.
//   3 · El teléfono/email coincide con un cliente existente → se ofrece
//       VINCULAR en lugar de duplicar. La coincidencia se muestra, nunca se
//       decide sola: mínima fricción, no automatización ciega.
//
// Si el lead trae una propiedad matcheada, se puede añadir a la selección en
// el mismo paso (source='manual': la origina el agente, no el algoritmo).
// ============================================================================

import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { checkPermission } from "@/lib/auth/guard";
import { addPropertyToSelection } from "../clientes/viewing-collections-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cómo se ha reconocido a un candidato, de más a menos fiable:
 *   email       — mismo correo normalizado. Prácticamente concluyente.
 *   phone       — mismo teléfono completo normalizado (con prefijo país).
 *   phone_tail  — solo coinciden los últimos 9 dígitos. INDICIO, no prueba:
 *                 dos números de países distintos pueden acabar igual.
 */
export type ClientMatchKind = "email" | "phone" | "phone_tail";

export type ClientMatch = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  matchedBy: ClientMatchKind;
};

export type PrepareVisitsLookup =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Candidatos ordenados por fiabilidad. Vacío = ninguno. */
      matches: ClientMatch[];
      /** true = hay que mirar antes de vincular (varios, o solo cola de 9). */
      ambiguous: boolean;
      prefill: { name: string; email: string; phone: string };
      property: { id: string; title: string } | null;
    };

/** Dígitos del teléfono, sin prefijo internacional en formato 00. */
function phoneDigits(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.startsWith("00") ? d.slice(2) : d;
}

/** Últimos 9 dígitos: casa +34 612..., 612..., 0034612... — y también casa
 *  números de países distintos, por eso es el último recurso. */
function phoneTail(phone: string | null | undefined): string | null {
  const digits = phoneDigits(phone);
  return digits.length >= 9 ? digits.slice(-9) : null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/**
 * Busca clientes que puedan ser la misma persona, en cascada de fiabilidad:
 * email exacto → teléfono completo → últimos 9 dígitos.
 *
 * Devuelve TODOS los candidatos, no el primero: vincular es una decisión del
 * agente, y para decidir necesita ver si hay más de uno. Nada se vincula solo.
 */
async function findExistingClients(
  email: string | null,
  phone: string | null,
): Promise<{ matches: ClientMatch[]; ambiguous: boolean }> {
  const admin = createAdminClient() as any;
  const byId = new Map<string, ClientMatch>();
  const add = (row: any, matchedBy: ClientMatchKind) => {
    const prev = byId.get(row.id);
    // Si ya estaba, se queda con el reconocimiento más fiable.
    const rank: Record<ClientMatchKind, number> = {
      email: 0,
      phone: 1,
      phone_tail: 2,
    };
    if (prev && rank[prev.matchedBy] <= rank[matchedBy]) return;
    byId.set(row.id, {
      id: row.id,
      fullName: row.full_name ?? row.email,
      email: row.email,
      phone: row.phone,
      matchedBy,
    });
  };

  const wanted = normalizeEmail(email);
  if (wanted) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("role", "client")
      .ilike("email", wanted)
      .limit(5);
    // `ilike` sin comodines ya es igualdad sin distinguir mayúsculas; se
    // reconfirma en memoria por si el dato guardado trae espacios.
    for (const row of (data ?? []) as any[]) {
      if (normalizeEmail(row.email) === wanted) add(row, "email");
    }
  }

  const digits = phoneDigits(phone);
  const tail = phoneTail(phone);
  if (tail) {
    // No hay formato canónico de teléfono en profiles, así que se comparan en
    // memoria los candidatos con teléfono (volumen pequeño hoy).
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("role", "client")
      .not("phone", "is", null)
      .limit(500);
    for (const row of (data ?? []) as any[]) {
      const rowDigits = phoneDigits(row.phone);
      if (!rowDigits) continue;
      if (digits && rowDigits === digits) add(row, "phone");
      else if (phoneTail(row.phone) === tail) add(row, "phone_tail");
    }
  }

  const order: Record<ClientMatchKind, number> = {
    email: 0,
    phone: 1,
    phone_tail: 2,
  };
  const matches = [...byId.values()]
    .sort((a, b) => order[a.matchedBy] - order[b.matchedBy])
    .slice(0, 4);

  // Ambiguo cuando hay más de un candidato, o cuando el único que hay se
  // sostiene solo en nueve dígitos: ahí el agente tiene que mirar.
  const ambiguous =
    matches.length > 1 ||
    (matches.length === 1 && matches[0].matchedBy === "phone_tail");

  return { matches, ambiguous };
}

/**
 * Datos para el diálogo "Preparar visitas" de un lead: prellenado, posible
 * cliente existente y la propiedad de contexto si el lead la trae.
 */
export async function lookupPrepareVisits(
  source: "idealista" | "contact",
  id: string,
): Promise<PrepareVisitsLookup> {
  const gate = await checkPermission("viewing_collections", "create");
  if (!gate.ok) return gate;
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient() as any;

  let name = "";
  let email = "";
  let phone = "";
  let property: { id: string; title: string } | null = null;

  if (source === "idealista") {
    // ⚠️ matched_property_title NO es columna de idealista_leads (el panel la
    // deriva con un join); pedirla aquí hacía fallar el select entero y el
    // diálogo decía "Lead no encontrado" para todos los leads.
    const { data: lead, error: leadError } = await admin
      .from("idealista_leads")
      .select("name, phone, matched_property_id")
      .eq("id", id)
      .maybeSingle();
    if (leadError) {
      console.error("lookupPrepareVisits idealista:", leadError.message);
      return { ok: false, error: "No se pudo leer el lead." };
    }
    if (!lead) return { ok: false, error: "Lead no encontrado." };
    name = lead.name ?? "";
    phone = lead.phone ?? "";
    if (lead.matched_property_id) {
      const { data: prop } = await admin
        .from("properties")
        .select("id, title")
        .eq("id", lead.matched_property_id)
        .maybeSingle();
      if (prop) {
        property = { id: prop.id, title: prop.title ?? "Propiedad del anuncio" };
      }
    }
  } else {
    const { data: contact, error: contactError } = await admin
      .from("contact_requests")
      .select("name, email, phone")
      .eq("id", id)
      .maybeSingle();
    if (contactError) {
      console.error("lookupPrepareVisits contact:", contactError.message);
      return { ok: false, error: "No se pudo leer la consulta." };
    }
    if (!contact) return { ok: false, error: "Consulta no encontrada." };
    name = contact.name ?? "";
    email = contact.email ?? "";
    phone = contact.phone ?? "";
  }

  const { matches, ambiguous } = await findExistingClients(
    email || null,
    phone || null,
  );

  return {
    ok: true,
    matches,
    ambiguous,
    prefill: { name, email, phone },
    property,
  };
}

export type ConfirmPrepareVisits =
  | { ok: false; error: string }
  | { ok: true; clientId: string; propertyAdded: boolean };

/**
 * Cierra el diálogo: usa el cliente elegido o crea uno nuevo con el mecanismo
 * real del CRM (auth.users + trigger de profile, igual que create-no-email), y
 * opcionalmente añade la propiedad de contexto a su selección.
 */
export async function confirmPrepareVisits(input: {
  existingClientId?: string;
  newClient?: { name: string; email: string; phone: string };
  propertyId?: string;
}): Promise<ConfirmPrepareVisits> {
  const gate = await checkPermission("viewing_collections", "create");
  if (!gate.ok) return gate;
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient() as any;
  let clientId: string;

  if (input.existingClientId) {
    // Vincular: verificar que sigue existiendo y siendo cliente.
    const { data } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", input.existingClientId)
      .maybeSingle();
    if (!data || data.role !== "client") {
      return { ok: false, error: "El cliente seleccionado ya no existe." };
    }
    clientId = data.id;
  } else if (input.newClient) {
    const name = input.newClient.name.trim();
    if (!name) return { ok: false, error: "El nombre es obligatorio." };

    // Crear cliente exige permiso de clientes, no solo de colecciones.
    const clientGate = await checkPermission("clientes", "create");
    if (!clientGate.ok) return clientGate;

    // Todo cliente es un auth.user (arquitectura del CRM). Sin email real se
    // genera uno interno inequívocamente sintético; el agente puede corregirlo
    // después desde la ficha.
    const email =
      input.newClient.email.trim().toLowerCase() ||
      `lead-${randomBytes(4).toString("hex")}@sin-email.bcousinoprop.com`;

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: randomBytes(16).toString("base64").slice(0, 16),
        email_confirm: true,
        user_metadata: { full_name: name },
      });
    if (createError || !created?.user) {
      return {
        ok: false,
        error: createError?.message ?? "No se pudo crear el cliente.",
      };
    }
    clientId = created.user.id;

    const phone = input.newClient.phone.trim() || null;
    await admin
      .from("profiles")
      .update({ full_name: name, ...(phone ? { phone } : {}), country: "es" })
      .eq("id", clientId);
  } else {
    return { ok: false, error: "Falta el cliente." };
  }

  // Propiedad de contexto del lead → selección. Idempotente; si falla no
  // rompemos el flujo: el agente ya tiene al cliente resuelto.
  let propertyAdded = false;
  if (input.propertyId) {
    const res = await addPropertyToSelection(
      clientId,
      input.propertyId,
      "manual",
    );
    propertyAdded = res.ok;
  }

  return { ok: true, clientId, propertyAdded };
}
