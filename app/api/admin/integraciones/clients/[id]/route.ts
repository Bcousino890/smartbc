import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { requirePermission } from "@/lib/auth/guard";

/**
 * PATCH/DELETE /api/admin/integraciones/clients/{id}
 *
 * Editar la configuración de una integración o eliminarla. Eliminar borra en
 * cascada sus claves, su log y su idempotencia, pero NO las captaciones que
 * hubiera creado (api_client_id queda a NULL): los datos de negocio se quedan.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE = [
  "name",
  "description",
  "contact_email",
  "active",
  "default_created_by",
  "default_pipeline_id",
  "default_assigned_to",
  "auto_distribute",
  "overwrite_manual_fields",
  "match_by_source_url",
] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("configuracion", "edit");
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    if (field in body) patch[field] = body[field];
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No hay nada que actualizar" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  try {
    const { data, error } = await db
      .from("api_clients")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return Response.json({ client: data });
  } catch (err) {
    console.error("[admin integraciones update]", err);
    return Response.json({ error: "Error al actualizar la integración" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("configuracion", "delete");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  try {
    // Las captaciones importadas se conservan; solo se desligan.
    await db.from("captaciones").update({ api_client_id: null }).eq("api_client_id", id);
    const { error } = await db.from("api_clients").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin integraciones delete]", err);
    return Response.json({ error: "Error al eliminar la integración" }, { status: 500 });
  }
}
