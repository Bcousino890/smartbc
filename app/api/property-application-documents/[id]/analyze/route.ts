import "server-only";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { analyzeDocument } from "@/lib/property-applications/analyze";

export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const result = await analyzeDocument(id);
    if (!result.ok) {
      return Response.json({ error: result.error ?? "Error analizando el documento" }, { status: 500 });
    }
    return Response.json({ ok: true, analysis: result.analysis });
  } catch (err) {
    console.error("[doc-analyze] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
