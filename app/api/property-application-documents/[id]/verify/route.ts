import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireStaff } from "@/lib/db/auth-helpers";
import { verifyDocument, addAnnotation, resolveAnnotationsForDocument } from "@/lib/db/queries/property-applications";
import { recalculateApplicationScore } from "@/lib/property-applications/analyze";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json() as {
      status: "verified" | "rejected" | "needs_correction";
      notes?: string;
      annotation?: {
        text: string;
        type: "info" | "warning" | "error";
      };
    };

    if (!body.status) {
      return Response.json({ error: "Se requiere el campo status" }, { status: 400 });
    }

    await verifyDocument(id, auth.userId, {
      status: body.status,
      notes: body.notes,
    });

    // Si viene anotación adjunta, guardarla también
    if (body.annotation?.text) {
      await addAnnotation({
        document_id: id,
        annotation_text: body.annotation.text,
        annotation_type: body.annotation.type ?? "info",
        created_by: auth.userId,
      });
    }

    // Al verificar, las anotaciones pendientes quedan resueltas
    if (body.status === "verified") {
      await resolveAnnotationsForDocument(id);
    }

    // Recalcular el score de la solicitud con el nuevo estado del documento
    const admin = createAdminClient();
    const { data: docRaw } = await admin
      .from("property_application_documents")
      .select("property_application_id")
      .eq("id", id)
      .single();
    const applicationId = (docRaw as { property_application_id: string } | null)?.property_application_id;
    if (applicationId) {
      await recalculateApplicationScore(applicationId);
    }

    return Response.json({ ok: true, status: body.status });
  } catch (err) {
    console.error("[verify-doc] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
