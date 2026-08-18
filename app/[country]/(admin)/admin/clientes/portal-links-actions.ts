"use server";

// ============================================================================
// Server actions de "Enlaces de portales" (ficha de cliente).
//
// Mismo criterio que viewing-collections-actions.ts: devuelven
// { ok: false, error } en vez de lanzar, porque Next.js redacta el mensaje de
// cualquier excepción no capturada en producción y el agente se quedaría sin
// saber que el problema es de permisos.
//
// El recurso de permisos es `viewing_collections`: este panel es la fase
// previa del mismo trabajo (curar pisos para un cliente), y quien puede
// preparar una colección puede recopilar los enlaces que la alimentan.
// ============================================================================

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { checkPermission } from "@/lib/auth/guard";
import { canAccessClientLinks } from "@/lib/db/queries/portal-links";
import {
  insertPortalLinks,
  linkText,
  translateLinkDbError,
} from "@/lib/portal-links/insert";
import {
  isLinkStatus,
  LINK_STATUS_LABEL,
  SELECTABLE_LINK_STATUSES,
  type PortalLinkInput,
  type PortalLinkStatus,
} from "@/lib/portal-links/types";

export type LinkActionResult<T = unknown> =
  | ({ ok: true } & (T extends object ? T : unknown))
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db() {
  return createAdminClient() as any;
}

// ─── Gate ────────────────────────────────────────────────────────────────────

type Gate = { ok: true; userId: string } | { ok: false; error: string };

async function gate(
  action: "view" | "create" | "edit" | "delete",
  clientId?: string,
): Promise<Gate> {
  const perm = await checkPermission("viewing_collections", action);
  if (!perm.ok) return perm;

  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (clientId && !(await canAccessClientLinks(clientId))) {
    return { ok: false, error: "No tienes acceso a este cliente." };
  }
  return { ok: true, userId: auth.userId };
}

function revalidateClient(clientId: string) {
  revalidatePath(`/es/admin/clientes/${clientId}`);
  revalidatePath(`/cl/admin/clientes/${clientId}`);
}

async function clientIdOfLink(linkId: string): Promise<string | null> {
  const { data } = await db()
    .from("client_portal_links")
    .select("client_id")
    .eq("id", linkId)
    .maybeSingle();
  return (data as { client_id: string } | null)?.client_id ?? null;
}

// ─── Acciones del panel ──────────────────────────────────────────────────────

export async function addPortalLinks(
  clientId: string,
  links: PortalLinkInput[],
  options?: { assignedTo?: string | null },
): Promise<
  LinkActionResult<{ inserted: number; skipped: number; invalid: number }>
> {
  const g = await gate("create", clientId);
  if (!g.ok) return g;

  if (!Array.isArray(links) || links.length === 0) {
    return { ok: false, error: "No has pegado ningún enlace." };
  }
  if (links.length > 60) {
    return { ok: false, error: "Máximo 60 enlaces por envío." };
  }

  const res = await insertPortalLinks({
    clientId,
    userId: g.userId,
    assignedTo: options?.assignedTo ?? null,
    links,
  });
  if (res.error) return { ok: false, error: res.error };

  if (res.inserted === 0 && res.skipped === 0) {
    return {
      ok: false,
      error: "Ninguno de los enlaces es válido (solo http:// o https://).",
    };
  }

  revalidateClient(clientId);
  return {
    ok: true,
    inserted: res.inserted,
    skipped: res.skipped,
    invalid: res.invalid,
  };
}

/**
 * Cambia el estado y, si se acompaña de una nota, la deja en el hilo con el
 * estado en el que quedó. Van juntas a propósito: "no acepta más de 11 meses"
 * sin el estado, o el estado sin el motivo, obligan a la siguiente persona a
 * preguntar.
 */
export async function updatePortalLinkStatus(
  linkId: string,
  status: PortalLinkStatus,
  note?: string,
): Promise<LinkActionResult> {
  if (!isLinkStatus(status)) return { ok: false, error: "Ese estado no existe." };
  if (!(SELECTABLE_LINK_STATUSES as readonly string[]).includes(status)) {
    return {
      ok: false,
      error: "«Ficha creada» solo se pone al vincular la propiedad.",
    };
  }

  const clientId = await clientIdOfLink(linkId);
  if (!clientId) return { ok: false, error: "Ese enlace ya no existe." };
  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const patch: Record<string, unknown> = { status };
  // Cualquier estado distinto de "por llamar" implica que ya se ha llamado.
  if (status !== "pending") patch.last_called_at = new Date().toISOString();

  const { error } = await db()
    .from("client_portal_links")
    .update(patch)
    .eq("id", linkId);
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  const body = note?.trim()
    ? note.trim().slice(0, 2000)
    : `Estado: ${LINK_STATUS_LABEL[status]}`;

  const { error: noteError } = await db().from("client_portal_link_notes").insert({
    link_id: linkId,
    author_id: g.userId,
    kind: note?.trim() ? "call" : "status",
    body,
    status_after: status,
  });
  if (noteError) return { ok: false, error: translateLinkDbError(noteError.message) };

  revalidateClient(clientId);
  return { ok: true };
}

export async function addPortalLinkNote(
  linkId: string,
  body: string,
  kind: "call" | "note" = "call",
): Promise<LinkActionResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "La nota está vacía." };

  const clientId = await clientIdOfLink(linkId);
  if (!clientId) return { ok: false, error: "Ese enlace ya no existe." };
  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const { error } = await db().from("client_portal_link_notes").insert({
    link_id: linkId,
    author_id: g.userId,
    kind,
    body: trimmed.slice(0, 2000),
  });
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  if (kind === "call") {
    await db()
      .from("client_portal_links")
      .update({ last_called_at: new Date().toISOString() })
      .eq("id", linkId);
  }

  revalidateClient(clientId);
  return { ok: true };
}

/** "Se los mando a Fabricio": reasigna varios enlaces de una vez. */
export async function assignPortalLinks(
  linkIds: string[],
  assignedTo: string | null,
): Promise<LinkActionResult<{ assigned: number }>> {
  if (!Array.isArray(linkIds) || linkIds.length === 0) {
    return { ok: false, error: "No has marcado ningún enlace." };
  }

  const clientId = await clientIdOfLink(linkIds[0]);
  if (!clientId) return { ok: false, error: "Ese enlace ya no existe." };
  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  // Solo se tocan los enlaces de ESTE cliente, aunque lleguen ids de otro.
  const { data, error } = await db()
    .from("client_portal_links")
    .update({ assigned_to: assignedTo })
    .in("id", linkIds)
    .eq("client_id", clientId)
    .select("id");
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true, assigned: ((data ?? []) as unknown[]).length };
}

export type PortalLinkPatch = {
  title?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  /** ISO o null. "mañana a las 12" sale de aquí al crear el itinerario. */
  proposedVisitAt?: string | null;
  price?: number | null;
};

export async function updatePortalLink(
  linkId: string,
  patch: PortalLinkPatch,
): Promise<LinkActionResult> {
  const clientId = await clientIdOfLink(linkId);
  if (!clientId) return { ok: false, error: "Ese enlace ya no existe." };
  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const update: Record<string, unknown> = {};
  if ("title" in patch) update.title = linkText(patch.title, 300);
  if ("contactName" in patch) update.contact_name = linkText(patch.contactName, 200);
  if ("contactPhone" in patch) update.contact_phone = linkText(patch.contactPhone, 60);
  if ("notes" in patch) update.notes = linkText(patch.notes, 4000);
  if ("price" in patch) {
    update.price =
      typeof patch.price === "number" && patch.price > 0
        ? Math.round(patch.price)
        : null;
  }
  if ("proposedVisitAt" in patch) {
    const raw = patch.proposedVisitAt;
    if (!raw) update.proposed_visit_at = null;
    else {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: "La fecha propuesta no es válida." };
      }
      update.proposed_visit_at = d.toISOString();
    }
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await db()
    .from("client_portal_links")
    .update(update)
    .eq("id", linkId);
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true };
}

export async function deletePortalLink(
  linkId: string,
): Promise<LinkActionResult> {
  const clientId = await clientIdOfLink(linkId);
  if (!clientId) return { ok: true }; // ya no está: nada que borrar
  const g = await gate("delete", clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("client_portal_links")
    .delete()
    .eq("id", linkId);
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true };
}

/**
 * Cierra el círculo: el enlace pasa a ser una ficha nuestra y entra en la
 * selección del cliente, que es de donde se montan los itinerarios y la
 * colección privada.
 *
 * Es idempotente: repetirla no duplica la selección (la UNIQUE
 * `cps_unique_client_property` lo impide y aquí se ignora el conflicto).
 */
export async function linkPropertyToPortalLink(
  linkId: string,
  propertyId: string,
): Promise<LinkActionResult<{ addedToSelection: boolean }>> {
  const clientId = await clientIdOfLink(linkId);
  if (!clientId) return { ok: false, error: "Ese enlace ya no existe." };
  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const { data: prop } = await db()
    .from("properties")
    .select("id, country")
    .eq("id", propertyId)
    .maybeSingle();
  if (!prop) return { ok: false, error: "Esa propiedad no existe." };

  const { error } = await db()
    .from("client_portal_links")
    .update({ property_id: propertyId, status: "converted" })
    .eq("id", linkId);
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  const { error: selError } = await db()
    .from("client_property_selections")
    .upsert(
      {
        client_id: clientId,
        property_id: propertyId,
        source: "manual",
        added_by: g.userId,
        country: (prop as { country?: string }).country === "cl" ? "cl" : "es",
      },
      { onConflict: "client_id,property_id", ignoreDuplicates: true },
    );

  // Que falle la selección no debe deshacer el vínculo: la ficha ya existe y
  // añadirla a la selección se puede repetir desde el propio panel.
  const addedToSelection = !selError;
  if (selError) {
    console.error("[portal-links] no se pudo añadir a la selección:", selError.message);
  }

  await db().from("client_portal_link_notes").insert({
    link_id: linkId,
    author_id: g.userId,
    kind: "status",
    body: "Ficha creada en el CRM y añadida a la selección del cliente.",
    status_after: "converted",
  });

  revalidateClient(clientId);
  return { ok: true, addedToSelection };
}
