import "server-only";
import { createAdminClient } from "../admin";
import { resolveViewScope, getAssignedClientIds } from "./view-scope";
import type {
  ClientPortalLinkRow,
  LinkedProperty,
  PortalLinkNote,
  PortalLinkWithNotes,
  StaffRef,
} from "@/lib/portal-links/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
function db() {
  return createAdminClient() as any;
}

/**
 * Mismo gate de cliente que Viewing Collections: el panel de enlaces vive en la
 * misma ficha y se rige por el mismo permiso (`viewing_collections`), porque es
 * la fase previa de exactamente el mismo trabajo — curar pisos para un cliente.
 * Duplicar el recurso de permisos habría obligado a mantener dos matrices que
 * en la práctica siempre valdrían lo mismo.
 */
export async function canAccessClientLinks(clientId: string): Promise<boolean> {
  const { restriction, userId } = await resolveViewScope("viewing_collections");
  if (restriction === "none") return false;
  if (restriction === "all" || !userId) return true;
  const ids = await getAssignedClientIds(userId);
  return ids.includes(clientId);
}

const LINK_COLUMNS = `
  id, client_id, url, url_key, portal, external_ref, title, price, price_label,
  operation, zone, bedrooms, bathrooms, square_meters, image_url, contact_name,
  contact_phone, status, notes, proposed_visit_at, assigned_to, added_by,
  last_called_at, property_id, country, created_at, updated_at
`;

/**
 * Los enlaces de un cliente con su hilo de llamadas, quién los tiene asignados
 * y la ficha creada a partir de cada uno (si ya existe).
 *
 * Se resuelve en consultas separadas en vez de con `embeds` de PostgREST: la
 * tabla tiene TRES claves ajenas a `profiles` (client_id, assigned_to,
 * added_by) y los embeds ambiguos son la fuente clásica de PGRST201 en este
 * repo (ver el comentario de getClientById en clients.ts).
 */
export async function getClientPortalLinks(
  clientId: string,
): Promise<PortalLinkWithNotes[]> {
  const admin = db();

  const { data: linkRows, error } = await admin
    .from("client_portal_links")
    .select(LINK_COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    // Tabla todavía sin migrar en este entorno: el panel se muestra vacío en
    // vez de tumbar la ficha entera.
    console.error("[portal-links] no se pudieron leer los enlaces:", error.message);
    return [];
  }

  const links = (linkRows ?? []) as ClientPortalLinkRow[];
  if (links.length === 0) return [];

  const linkIds = links.map((l) => l.id);
  const staffIds = [
    ...new Set(
      links.flatMap((l) => [l.assigned_to, l.added_by]).filter(Boolean) as string[],
    ),
  ];
  const propertyIds = [
    ...new Set(links.map((l) => l.property_id).filter(Boolean) as string[]),
  ];

  const [notesRes, staffRes, propsRes, selectionRes] = await Promise.all([
    admin
      .from("client_portal_link_notes")
      .select("id, link_id, author_id, kind, body, status_after, created_at")
      .in("link_id", linkIds)
      .order("created_at", { ascending: false }),
    staffIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", staffIds)
      : Promise.resolve({ data: [] }),
    propertyIds.length
      ? admin.from("properties").select("id, slug, title").in("id", propertyIds)
      : Promise.resolve({ data: [] }),
    propertyIds.length
      ? admin
          .from("client_property_selections")
          .select("property_id")
          .eq("client_id", clientId)
          .in("property_id", propertyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const staffById = new Map<string, StaffRef>(
    ((staffRes.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>).map((p) => [p.id, { id: p.id, name: p.full_name || p.email || "—" }]),
  );

  // Los autores de las notas pueden no estar entre assigned_to/added_by.
  const noteRows = (notesRes.data ?? []) as Array<{
    id: string;
    link_id: string;
    author_id: string | null;
    kind: PortalLinkNote["kind"];
    body: string;
    status_after: PortalLinkNote["status_after"];
    created_at: string;
  }>;
  const missingAuthors = [
    ...new Set(
      noteRows
        .map((n) => n.author_id)
        .filter((id): id is string => Boolean(id) && !staffById.has(id as string)),
    ),
  ];
  if (missingAuthors.length) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", missingAuthors);
    for (const p of (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>) {
      staffById.set(p.id, { id: p.id, name: p.full_name || p.email || "—" });
    }
  }

  const notesByLink = new Map<string, PortalLinkNote[]>();
  for (const n of noteRows) {
    const list = notesByLink.get(n.link_id) ?? [];
    list.push({
      id: n.id,
      kind: n.kind,
      body: n.body,
      status_after: n.status_after,
      created_at: n.created_at,
      authorName: n.author_id ? (staffById.get(n.author_id)?.name ?? null) : null,
    });
    notesByLink.set(n.link_id, list);
  }

  const selectedPropertyIds = new Set(
    ((selectionRes.data ?? []) as Array<{ property_id: string }>).map(
      (s) => s.property_id,
    ),
  );
  const propertyById = new Map<string, LinkedProperty>(
    ((propsRes.data ?? []) as Array<{
      id: string;
      slug: string;
      title: string;
    }>).map((p) => [
      p.id,
      {
        id: p.id,
        slug: p.slug,
        title: p.title,
        inSelection: selectedPropertyIds.has(p.id),
      },
    ]),
  );

  return links.map((link) => ({
    ...link,
    notes_thread: notesByLink.get(link.id) ?? [],
    assignedTo: link.assigned_to ? (staffById.get(link.assigned_to) ?? null) : null,
    addedBy: link.added_by ? (staffById.get(link.added_by) ?? null) : null,
    property: link.property_id ? (propertyById.get(link.property_id) ?? null) : null,
  }));
}

const STAFF_ROLES = [
  "owner",
  "admin",
  "advisor",
  "agent_junior",
  "agent_senior",
  "agent_admin",
];

/** Compañeros a los que se puede pasar un enlace para que llame. */
export async function getAssignableStaff(): Promise<StaffRef[]> {
  try {
    const { data } = await db()
      .from("profiles")
      .select("id, full_name, email")
      .in("role", STAFF_ROLES)
      .order("full_name");
    return ((data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>).map((p) => ({ id: p.id, name: p.full_name || p.email || "—" }));
  } catch {
    return [];
  }
}
