import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  getApplicationById,
  getDocumentForDeleteCheck,
  deleteDocument,
} from "@/lib/db/queries/property-applications";
import { recalculateApplicationScore } from "@/lib/property-applications/scoring-engine";

const BUCKET = "property-application-documents";

// Borra un documento subido, tanto en nombre del equipo (cualquier estado)
// como del propio cliente/co-solicitante dueño (solo si aún no está
// verificado — una vez verificado, borrarlo es cosa del equipo, para que
// nadie pueda hacer desaparecer un documento ya validado).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const doc = await getDocumentForDeleteCheck(id);
    if (!doc) return Response.json({ error: "Documento no encontrado" }, { status: 404 });

    const isStaff = ["owner", "admin", "advisor", "agent_admin", "agent_senior"].includes(auth.role);
    const application = await getApplicationById(doc.property_application_id, isStaff);
    if (!application) return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });

    const isOwnerOfDoc = !doc.co_applicant_id && application.client_id === auth.userId;
    const isCoApplicantOfDoc = doc.co_applicant_id === auth.userId;

    if (!isStaff && !isOwnerOfDoc && !isCoApplicantOfDoc) {
      return Response.json({ error: "Sin permiso para este documento" }, { status: 403 });
    }
    if (!isStaff && doc.status === "verified") {
      return Response.json(
        { error: "Este documento ya está verificado — contacta al equipo si necesitas eliminarlo" },
        { status: 400 }
      );
    }

    const storagePath = await deleteDocument(id);
    if (storagePath) {
      const admin = createAdminClient();
      const { error: storageError } = await admin.storage.from(BUCKET).remove([storagePath]);
      if (storageError) {
        console.error("[delete-doc] No se pudo borrar el archivo del storage:", storageError);
      }
    }

    await recalculateApplicationScore(doc.property_application_id);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[delete-doc] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
