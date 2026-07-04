import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  getApplicationById,
  submitApplicationForReview,
  approveApplication,
  rejectApplication,
  getApplicationDocumentProgress,
} from "@/lib/db/queries/property-applications";
import { recalculateApplicationScore } from "@/lib/property-applications/scoring-engine";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    let application = await getApplicationById(id);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const isStaff = ["admin", "advisor", "agent_admin", "agent_senior", "agent_junior"].includes(auth.role);
    const isOwner = application.client_id === auth.userId;
    if (!isStaff && !isOwner) {
      return Response.json({ error: "Sin permiso" }, { status: 403 });
    }

    // Auto-sana solicitudes que se quedaron sin score calcular (p.ej. las
    // creadas antes de que el pipeline de scoring se conectara).
    if (!application.score && (application.documents?.length ?? 0) > 0) {
      await recalculateApplicationScore(id);
      application = await getApplicationById(id);
      if (!application) {
        return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
      }
    }

    const progress = await getApplicationDocumentProgress(id);
    return Response.json({ ...application, progress });
  } catch (err) {
    console.error("[app-GET] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json() as {
      action: "submit" | "approve" | "reject";
      notes?: string;
      rejected_document_ids?: string[];
    };

    const application = await getApplicationById(id);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const isStaff = ["admin", "advisor", "agent_admin", "agent_senior"].includes(auth.role);
    const isOwner = application.client_id === auth.userId;

    if (body.action === "submit") {
      if (!isOwner) {
        return Response.json({ error: "Solo el solicitante puede enviar" }, { status: 403 });
      }
      if (application.status !== "draft" && application.status !== "rejected") {
        return Response.json({ error: "La solicitud ya fue enviada" }, { status: 400 });
      }
      const progress = await getApplicationDocumentProgress(id);
      if (progress.required_uploaded < progress.required) {
        return Response.json(
          { error: `Faltan ${progress.required - progress.required_uploaded} documentos requeridos` },
          { status: 400 }
        );
      }
      await submitApplicationForReview(id);
      return Response.json({ ok: true, status: "pending_review" });
    }

    if (body.action === "approve") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });
      await approveApplication(id, auth.userId, body.notes);
      return Response.json({ ok: true, status: "approved" });
    }

    if (body.action === "reject") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });
      if (!body.notes) {
        return Response.json({ error: "Se requiere un motivo de rechazo" }, { status: 400 });
      }
      await rejectApplication(id, auth.userId, body.notes);
      return Response.json({ ok: true, status: "rejected" });
    }

    return Response.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    console.error("[app-PATCH] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
