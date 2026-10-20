import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { checkPermission } from "@/lib/auth/guard";
import { canActOnClient } from "@/lib/db/queries/view-scope";
import type { StaffApplicationAccess } from "./staff-access";

/**
 * Gate de STAFF para las rutas de solicitudes de documentación. Dos capas:
 *  1. permiso `documentacion.<acción>` (matriz efectiva: rol + excepciones,
 *     por el país de la solicitud);
 *  2. alcance: con «Solo lo suyo» solo si el cliente de la solicitud está
 *     asignado a quien llama (`canActOnClient`, que deriva el país del cliente).
 *
 * Devuelve `null` si pasa o la `Response` 403 lista para devolver. NO se llama
 * para el propio cliente (isOwner / co-solicitante): su acceso no cambia.
 */
export async function denyStaffApplicationAccess(
  application: { client_id: string; country?: string | null },
  access: StaffApplicationAccess,
): Promise<Response | null> {
  const perm = await checkPermission("documentacion", access.permission, {
    country: application.country ?? undefined,
  });
  if (!perm.ok) {
    return Response.json({ error: perm.error }, { status: perm.error === "No autenticado" ? 401 : 403 });
  }
  const allowed = await canActOnClient(application.client_id, "documentacion", access.scope);
  if (!allowed) {
    return Response.json({ error: "No tienes acceso a esta solicitud" }, { status: 403 });
  }
  return null;
}

/**
 * Para las rutas que solo reciben el id de un DOCUMENTO (verify / analyze):
 * resuelve su solicitud (client_id + country) y aplica el gate. Falla CERRADO:
 * si la lectura da error no se salta el gate (500), y si no existe, 404.
 */
export async function denyStaffDocumentAccess(
  documentId: string,
  access: StaffApplicationAccess,
): Promise<Response | null> {
  let application: { client_id: string; country: string | null } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createAdminClient() as any)
      .from("property_application_documents")
      .select("property_applications:property_application_id(client_id, country)")
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw error;
    const rel = data?.property_applications;
    application = (Array.isArray(rel) ? rel[0] : rel) ?? null;
  } catch (err) {
    console.error("[staff-gate] No se pudo resolver la solicitud del documento:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
  if (!application?.client_id) {
    return Response.json({ error: "Documento no encontrado" }, { status: 404 });
  }
  return denyStaffApplicationAccess(application, access);
}

