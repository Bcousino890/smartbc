import "server-only";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { denyStaffDocumentAccess } from "@/lib/property-applications/staff-gate";
import { STAFF_WRITE } from "@/lib/property-applications/staff-access";
import { analyzeApplicationDocument } from "@/lib/property-applications/ai-analysis";

// Reintento manual del análisis IA de un documento (botón "Reanalizar con
// IA" en el panel de admin) — útil si el análisis automático tras la
// subida falló (p.ej. IA no configurada todavía en Configuración → IA) o
// si se quiere volver a analizar tras cambios en la configuración.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    // Permiso documentacion.edit + alcance de edición sobre el cliente.
    const denied = await denyStaffDocumentAccess(id, STAFF_WRITE);
    if (denied) return denied;

    await analyzeApplicationDocument(id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[analyze-doc] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
