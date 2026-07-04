import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireStaff } from "@/lib/db/auth-helpers";
import { deleteDocument } from "@/lib/db/queries/property-applications";
import { APPLICATION_DOCS_BUCKET, recalculateApplicationScore } from "@/lib/property-applications/analyze";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const admin = createAdminClient();
    const { data: docRaw } = await admin
      .from("property_application_documents")
      .select("id, property_application_id")
      .eq("id", id)
      .single();
    const doc = docRaw as { id: string; property_application_id: string } | null;
    if (!doc) {
      return Response.json({ error: "Documento no encontrado" }, { status: 404 });
    }

    const storagePath = await deleteDocument(id);
    if (storagePath) {
      await admin.storage.from(APPLICATION_DOCS_BUCKET).remove([storagePath]);
    }
    await recalculateApplicationScore(doc.property_application_id);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[doc-DELETE] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
