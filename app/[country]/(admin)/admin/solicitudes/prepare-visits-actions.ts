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

export type ClientMatch = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  matchedBy: "email" | "phone";
};

export type PrepareVisitsLookup =
  | { ok: false; error: string }
  | {
      ok: true;
      match: ClientMatch | null;
      prefill: { name: string; email: string; phone: string };
      property: { id: string; title: string } | null;
    };

/** Últimos 9 dígitos: suficiente para casar +34 612..., 612..., 0034612... */
function phoneTail(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

async function findExistingClient(
  email: string | null,
  phone: string | null,
): Promise<ClientMatch | null> {
  const admin = createAdminClient() as any;

  if (email?.trim()) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("role", "client")
      .ilike("email", email.trim())
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        id: data.id,
        fullName: data.full_name ?? data.email,
        email: data.email,
        phone: data.phone,
        matchedBy: "email",
      };
    }
  }

  const tail = phoneTail(phone);
  if (tail) {
    // No hay formato canónico de teléfono en profiles: se compara por cola de
    // 9 dígitos sobre los candidatos con teléfono (volumen pequeño).
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("role", "client")
      .not("phone", "is", null)
      .limit(500);
    const hit = ((data ?? []) as any[]).find(
      (p) => phoneTail(p.phone) === tail,
    );
    if (hit) {
      return {
        id: hit.id,
        fullName: hit.full_name ?? hit.email,
        email: hit.email,
        phone: hit.phone,
        matchedBy: "phone",
      };
    }
  }

  return null;
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
    const { data: lead } = await admin
      .from("idealista_leads")
      .select("name, phone, matched_property_id, matched_property_title")
      .eq("id", id)
      .maybeSingle();
    if (!lead) return { ok: false, error: "Lead no encontrado." };
    name = lead.name ?? "";
    phone = lead.phone ?? "";
    if (lead.matched_property_id) {
      property = {
        id: lead.matched_property_id,
        title: lead.matched_property_title ?? "Propiedad del anuncio",
      };
    }
  } else {
    const { data: contact } = await admin
      .from("contact_requests")
      .select("name, email, phone")
      .eq("id", id)
      .maybeSingle();
    if (!contact) return { ok: false, error: "Consulta no encontrada." };
    name = contact.name ?? "";
    email = contact.email ?? "";
    phone = contact.phone ?? "";
  }

  const match = await findExistingClient(email || null, phone || null);

  return { ok: true, match, prefill: { name, email, phone }, property };
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
