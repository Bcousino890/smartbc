import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  getApplicationById,
  getApplicationByIdAdmin,
  getDocumentTypes,
  submitApplicationForReview,
  approveApplication,
  rejectApplication,
  completeApplication,
  reopenApplication,
  getApplicationDocumentProgress,
} from "@/lib/db/queries/property-applications";
import { recalculateApplicationScore } from "@/lib/property-applications/analyze";

const STAFF_ROLES = ["admin", "owner", "advisor", "agent_admin", "agent_senior"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const isStaff = [...STAFF_ROLES, "agent_junior"].includes(auth.role);
    // Staff usa cliente admin (el rol "owner" no está cubierto por las RLS);
    // los clientes usan el cliente de sesión para respetar la privacidad
    const application = isStaff
      ? await getApplicationByIdAdmin(id)
      : await getApplicationById(id);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const isOwner = application.client_id === auth.userId;
    if (!isStaff && !isOwner) {
      return Response.json({ error: "Sin permiso" }, { status: 403 });
    }

    const [progress, documentTypes] = await Promise.all([
      getApplicationDocumentProgress(id),
      getDocumentTypes(application.country, application.operation),
    ]);
    return Response.json({ ...application, progress, document_types: documentTypes });
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
      action: "submit" | "approve" | "reject" | "complete" | "reopen" | "recalculate_score";
      notes?: string;
      rejected_document_ids?: string[];
    };

    const isStaff = STAFF_ROLES.includes(auth.role);
    const application = isStaff
      ? await getApplicationByIdAdmin(id)
      : await getApplicationById(id);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const isOwner = application.client_id === auth.userId;

    if (body.action === "submit") {
      if (!isOwner && !isStaff) {
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
      await recalculateApplicationScore(id);
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

    if (body.action === "complete") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });
      if (application.status !== "approved") {
        return Response.json({ error: "Solo se puede completar una solicitud aprobada" }, { status: 400 });
      }
      await completeApplication(id);
      return Response.json({ ok: true, status: "completed" });
    }

    if (body.action === "reopen") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });
      if (application.status !== "rejected" && application.status !== "approved") {
        return Response.json({ error: "Solo se puede reabrir una solicitud aprobada o rechazada" }, { status: 400 });
      }
      await reopenApplication(id);
      return Response.json({ ok: true, status: "pending_review" });
    }

    if (body.action === "recalculate_score") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });
      await recalculateApplicationScore(id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    console.error("[app-PATCH] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
