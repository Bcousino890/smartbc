import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { requirePermission } from "@/lib/auth/guard";

/**
 * DELETE /api/admin/integraciones/keys/{keyId}
 *
 * Revoca una clave. No se borra la fila: se sella `revoked_at` para conservar
 * la trazabilidad del log de peticiones, que apunta a ella.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const gate = await requirePermission("configuracion", "delete");
  if (!gate.ok) return gate.response;

  const { keyId } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  try {
    const { data, error } = await db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .is("revoked_at", null)
      .select("id, revoked_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ error: "La clave no existe o ya estaba revocada" }, { status: 404 });
    }

    return Response.json({ ok: true, key: data });
  } catch (err) {
    console.error("[admin integraciones keys revoke]", err);
    return Response.json({ error: "Error al revocar la clave" }, { status: 500 });
  }
}
