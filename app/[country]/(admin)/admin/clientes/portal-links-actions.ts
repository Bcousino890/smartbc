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
  MAX_RATING,
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

/**
 * Cuánto le gusta al cliente, de 0 (sin valorar) a 5.
 *
 * No deja rastro en el hilo de llamadas a propósito: valorar es un gesto que se
 * repite mientras se enseñan los pisos, y llenaría el registro de ruido. Lo que
 * hay que poder leer después es qué dijeron por teléfono.
 */
export async function setPortalLinkRating(
  linkId: string,
  rating: number,
): Promise<LinkActionResult> {
  if (!Number.isInteger(rating) || rating < 0 || rating > MAX_RATING) {
    return { ok: false, error: `La valoración va de 0 a ${MAX_RATING}.` };
  }

  const clientId = await clientIdOfLink(linkId);
  if (!clientId) return { ok: false, error: "Ese enlace ya no existe." };
  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("client_portal_links")
    .update({ rating })
    .eq("id", linkId);
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true };
}

/**
 * Reescribe el orden de prioridad. Llega la lista COMPLETA de ids ya ordenada
 * (la calcula el panel al soltar), no un "mueve este de A a B": así no existe
 * el caso borde de "no queda hueco entre dos vecinos".
 *
 * La función de base de datos filtra además por client_id, así que una lista
 * manipulada no puede tocar los enlaces de otra ficha.
 */
export async function reorderPortalLinks(
  clientId: string,
  orderedIds: string[],
): Promise<LinkActionResult<{ moved: number }>> {
  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "No hay nada que ordenar." };
  }
  if (orderedIds.length > 500) {
    return { ok: false, error: "Demasiados enlaces para reordenar de una vez." };
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, error: "La lista de orden trae ids repetidos." };
  }

  const { data, error } = await db().rpc("reorder_client_portal_links", {
    p_client_id: clientId,
    p_ids: orderedIds,
  });
  if (error) return { ok: false, error: translateLinkDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true, moved: typeof data === "number" ? data : orderedIds.length };
}

// ============================================================================
// Crear fichas en bloque
// ============================================================================
// El botón "una sola pulsada" para no repetir 15 veces el mismo camino:
// enlace → previsualizar → confirmar → vincular. Va enlace por enlace en el
// SERVIDOR, con la misma extracción y la misma inserción que usa el
// importador normal — no es un atajo con menos garantías, es el mismo camino
// sin que nadie tenga que estar delante clicando.
//
// Secuencial, no en paralelo: son fetches reales contra Idealista (o el
// portal que sea) y machacarlo con 15 peticiones a la vez es justo lo que
// dispara los bloqueos anti-bot que el resto del pipeline ya se esfuerza en
// esquivar. Uno detrás de otro tarda más, pero termina.
//
// Un fallo en un enlace NO tumba el lote: se anota el motivo y se sigue con
// el siguiente. Al final se devuelve un resultado por enlace, para que el
// panel pueda decir exactamente cuáles quedaron pendientes y por qué.
// ============================================================================

const BULK_IMPORT_AGENCY_SLUG = "portales-externos";

export type BulkImportOutcome = {
  linkId: string;
  ok: boolean;
  /** Motivo legible cuando ok=false; título de la ficha creada cuando ok=true. */
  detail: string;
};

export async function bulkCreatePropertiesFromLinks(
  clientId: string,
  linkIds: string[],
): Promise<LinkActionResult<{ results: BulkImportOutcome[] }>> {
  const g = await gate("create", clientId);
  if (!g.ok) return g;

  const ids = [...new Set(linkIds)].slice(0, 30);
  if (ids.length === 0) return { ok: false, error: "No has marcado ningún anuncio." };

  // Solo enlaces de ESTE cliente y que todavía no sean ficha: repetir la
  // acción sobre uno ya convertido no debe crear una segunda propiedad.
  const { data: links } = await db()
    .from("client_portal_links")
    .select("id, url, country, status")
    .eq("client_id", clientId)
    .in("id", ids)
    .neq("status", "converted");
  const rows = (links ?? []) as Array<{
    id: string;
    url: string;
    country: string;
    status: string;
  }>;

  if (rows.length === 0) {
    return { ok: false, error: "Los marcados ya tienen ficha o no son de este cliente." };
  }

  const { data: agency } = await db()
    .from("agencies")
    .select("id")
    .eq("slug", BULK_IMPORT_AGENCY_SLUG)
    .maybeSingle();
  if (!agency) {
    return { ok: false, error: `No existe la agencia "${BULK_IMPORT_AGENCY_SLUG}".` };
  }

  // Import dinámico: este módulo trae scrapers pesados (Playwright, etc.) que
  // no hace falta cargar en el resto de acciones de este fichero.
  const { extractFromUrl } = await import("@/lib/sync/import-by-link");
  const { insertImportedProperty } = await import("@/lib/sync/import-by-link/insert");

  const results: BulkImportOutcome[] = [];

  for (const link of rows) {
    const extracted = await extractFromUrl(link.url);
    if (!extracted.ok) {
      const REASONS: Record<string, string> = {
        fetch_failed: "no se pudo descargar la página",
        blocked: "el portal bloqueó la petición",
        unsupported_url: "portal no soportado",
        parse_failed: "no se pudo leer el HTML",
      };
      results.push({
        linkId: link.id,
        ok: false,
        detail: REASONS[extracted.error.kind] ?? "fallo desconocido",
      });
      continue;
    }

    const preview = extracted.preview;
    const title = preview.title?.trim();
    const zone = preview.zone?.trim();
    // Mismas validaciones mínimas que confirmByLink: si el scraping no trajo
    // lo imprescindible, mejor dejarlo pendiente que crear una ficha coja.
    if (!title || !zone || !preview.price || preview.price <= 0) {
      results.push({
        linkId: link.id,
        ok: false,
        detail: "faltan datos básicos (título, zona o precio) en el anuncio",
      });
      continue;
    }

    const inserted = await insertImportedProperty({
      preview,
      agencyId: (agency as { id: string }).id,
      agencySlug: BULK_IMPORT_AGENCY_SLUG,
      country: link.country === "cl" ? "cl" : "es",
      overrides: {
        title,
        description: preview.description?.trim() || null,
        operation: preview.operation === "rent" ? "rent" : "sale",
        stay: preview.stay ?? null,
        price: preview.price,
        bedrooms: preview.bedrooms ?? 0,
        bathrooms: preview.bathrooms ?? 0,
        squareMeters: preview.squareMeters ?? null,
        zone,
        address: preview.address?.trim() || null,
        features: preview.features,
        externalReference: preview.externalReference,
      },
    });

    if (!inserted.ok) {
      results.push({ linkId: link.id, ok: false, detail: inserted.error });
      continue;
    }

    const linked = await linkPropertyToPortalLink(link.id, inserted.propertyId);
    results.push({
      linkId: link.id,
      ok: true,
      // La ficha YA existe aunque el vínculo falle: se avisa en vez de
      // deshacer una importación buena, igual que en el camino de uno en uno.
      detail: linked.ok ? title : `${title} (ficha creada, pero sin vincular)`,
    });
  }

  revalidateClient(clientId);
  return { ok: true, results };
}
