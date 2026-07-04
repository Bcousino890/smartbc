import "server-only";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
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

    await analyzeApplicationDocument(id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[analyze-doc] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
