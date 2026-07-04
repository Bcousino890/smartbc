import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireStaff } from "@/lib/db/auth-helpers";
import { getApplicationById } from "@/lib/db/queries/property-applications";
import {
  buildCandidateSummaryPdfData,
  renderCandidateSummaryPdfBuffer,
} from "@/lib/property-applications/candidate-summary";
import { sendEmail } from "@/lib/email/send-email";
import { renderEmailLayout, escapeHtml } from "@/lib/email/templates";

export const runtime = "nodejs";

// Envía el resumen del candidato directamente al propietario de la
// propiedad por email (PDF adjunto), en vez de depender de que el equipo
// descargue el PDF y lo reenvíe manualmente.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const application = await getApplicationById(id);
    if (!application) return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    if (!application.property_id) {
      return Response.json(
        { error: "Esta solicitud no está vinculada a ninguna propiedad" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: property } = await admin
      .from("properties")
      .select("title, owner_name, owner_email")
      .eq("id", application.property_id)
      .maybeSingle();

    const ownerEmail = property?.owner_email as string | undefined;
    if (!ownerEmail) {
      return Response.json(
        { error: "La propiedad no tiene un email de propietario configurado" },
        { status: 400 }
      );
    }

    const data = buildCandidateSummaryPdfData(application);
    const buffer = await renderCandidateSummaryPdfBuffer(data);

    const ownerName = (property?.owner_name as string | undefined) ?? "";
    const scoreLine = data.score
      ? `<strong>${data.score.total}/100</strong> — ${escapeHtml(data.score.recommendationLabel)}`
      : "en revisión";

    const html = renderEmailLayout({
      title: "Nuevo candidato para tu propiedad",
      bodyHtml: `
        <p style="margin: 0 0 14px 0;">${ownerName ? `Hola ${escapeHtml(ownerName)},` : "Hola,"}</p>
        <p style="margin: 0 0 14px 0;">
          Te compartimos el resumen de un candidato para <strong>${escapeHtml(data.propertyTitle ?? property?.title ?? "tu propiedad")}</strong>
          (${escapeHtml(data.operationLabel.toLowerCase())}).
        </p>
        <p style="margin: 0 0 14px 0;">
          Puntuación del candidato: ${scoreLine}.
        </p>
        <p style="margin: 0;">
          Encontrarás el análisis completo en el PDF adjunto. Los documentos originales quedan en
          custodia de nuestro equipo por privacidad.
        </p>
      `,
    });

    const result = await sendEmail({
      to: ownerEmail,
      subject: `Nuevo candidato para ${data.propertyTitle ?? property?.title ?? "tu propiedad"}`,
      html,
      attachments: [
        {
          filename: `candidato-${data.clientName.replace(/\s+/g, "-").toLowerCase()}.pdf`,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (!result.success) {
      return Response.json({ error: result.error ?? "No se pudo enviar el email" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[export-summary/send] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
