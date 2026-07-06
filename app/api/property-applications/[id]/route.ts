import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  getApplicationById,
  submitApplicationForReview,
  approveApplication,
  rejectApplication,
  reopenApplication,
  updateApplicationFields,
  getApplicationDocumentProgress,
} from "@/lib/db/queries/property-applications";
import type { ApplicationCountry, ApplicationOperation, PropertyApplicationWithDetails } from "@/lib/property-applications/types";
import { recalculateApplicationScore } from "@/lib/property-applications/scoring-engine";
import { sendEmail } from "@/lib/email/send-email";
import { renderEmailLayout, escapeHtml } from "@/lib/email/templates";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.bcousinoprop.com";

// Notifica al cliente por email cuando el equipo decide su solicitud.
// Se lanza en segundo plano (proceso Node persistente con PM2): un fallo
// de SMTP no debe bloquear ni revertir la decisión ya guardada.
function notifyClientOfDecision(
  application: PropertyApplicationWithDetails,
  decision: "approved" | "rejected",
  notes?: string
): void {
  const email = application.client?.email;
  if (!email || email.endsWith("@interno.smartbc.local")) return;

  const clientName = application.client?.full_name ?? "";
  const opLabel = application.operation === "rent" ? "alquiler" : "compra";
  const propertyLine = application.property?.title
    ? ` para <strong>${escapeHtml(application.property.title)}</strong>`
    : "";

  const approved = decision === "approved";
  const html = renderEmailLayout({
    title: approved ? "¡Tu solicitud fue aprobada!" : "Actualización de tu solicitud",
    bodyHtml: `
      <p style="margin: 0 0 14px 0;">${clientName ? `Hola ${escapeHtml(clientName)},` : "Hola,"}</p>
      <p style="margin: 0 0 14px 0;">
        Tu solicitud de ${opLabel}${propertyLine} ha sido
        <strong>${approved ? "aprobada" : "rechazada"}</strong>.
      </p>
      ${!approved && notes ? `<p style="margin: 0 0 14px 0;"><strong>Motivo:</strong> ${escapeHtml(notes)}</p>` : ""}
      <p style="margin: 0;">
        ${approved
          ? "Nuestro equipo se pondrá en contacto contigo para los siguientes pasos."
          : "Puedes revisar los detalles y volver a enviar tu documentación desde el portal."}
      </p>
    `,
    ctaLabel: "Ver mi solicitud",
    ctaUrl: `${PORTAL_URL}/documentacion`,
  });

  void sendEmail({
    to: email,
    subject: approved
      ? "Tu solicitud fue aprobada - Benjamín Cousiño Propiedades"
      : "Actualización de tu solicitud - Benjamín Cousiño Propiedades",
    html,
  }).then((result) => {
    if (!result.success) {
      console.error("[app-PATCH] No se pudo notificar al cliente:", result.error);
    }
  }).catch((err) => {
    console.error("[app-PATCH] Error notificando al cliente:", err);
  });
}

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
      action: "submit" | "approve" | "reject" | "reopen" | "update";
      notes?: string;
      rejected_document_ids?: string[];
      property_id?: string | null;
      operation?: ApplicationOperation;
      country?: ApplicationCountry;
      move_in_date?: string | null;
      purchase_date?: string | null;
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
      notifyClientOfDecision(application, "approved");
      return Response.json({ ok: true, status: "approved" });
    }

    if (body.action === "reopen") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });
      if (application.status !== "approved" && application.status !== "rejected") {
        return Response.json(
          { error: "Solo se pueden reabrir solicitudes aprobadas o rechazadas" },
          { status: 400 }
        );
      }
      await reopenApplication(id);
      return Response.json({ ok: true, status: "pending_review" });
    }

    if (body.action === "update") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });

      const changesCountryOrOp =
        (body.operation && body.operation !== application.operation) ||
        (body.country && body.country !== application.country);
      if (changesCountryOrOp && (application.documents?.length ?? 0) > 0) {
        return Response.json(
          { error: "No se puede cambiar país/operación: ya tiene documentos subidos para el tipo actual" },
          { status: 400 }
        );
      }

      await updateApplicationFields(id, {
        property_id: body.property_id,
        operation: body.operation,
        country: body.country,
        move_in_date: body.move_in_date,
        purchase_date: body.purchase_date,
      });
      return Response.json({ ok: true });
    }

    if (body.action === "reject") {
      if (!isStaff) return Response.json({ error: "Sin permiso" }, { status: 403 });
      if (!body.notes) {
        return Response.json({ error: "Se requiere un motivo de rechazo" }, { status: 400 });
      }
      await rejectApplication(id, auth.userId, body.notes);
      notifyClientOfDecision(application, "rejected", body.notes);
      return Response.json({ ok: true, status: "rejected" });
    }

    return Response.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    console.error("[app-PATCH] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
