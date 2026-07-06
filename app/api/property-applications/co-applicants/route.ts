import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import { addCoApplicant, getApplicationById } from "@/lib/db/queries/property-applications";
import { sendEmail } from "@/lib/email/send-email";
import { renderEmailLayout, escapeHtml } from "@/lib/email/templates";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json() as {
      application_id: string;
      invite_email: string;
    };

    if (!body.application_id || !body.invite_email) {
      return Response.json(
        { error: "Se requieren application_id e invite_email" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.invite_email)) {
      return Response.json({ error: "Email no válido" }, { status: 400 });
    }

    await addCoApplicant({
      property_application_id: body.application_id,
      invite_email: body.invite_email,
    });

    // Enviamos la invitación por email en segundo plano — si el SMTP no
    // está configurado (Configuración → Email), no debe bloquear ni
    // romper la creación de la invitación en la base de datos.
    void sendCoApplicantInviteEmail(body.application_id, body.invite_email, auth.userId).catch((err) => {
      console.error("[co-applicants] Error enviando email de invitación:", err);
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[co-applicants] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

async function sendCoApplicantInviteEmail(
  applicationId: string,
  inviteEmail: string,
  inviterId: string
): Promise<void> {
  // Lectura admin: es un helper interno para componer el email de una
  // invitación que la ruta ya autorizó; la sesión del invitador (p.ej.
  // staff con rol 'owner') puede no pasar las RLS.
  const application = await getApplicationById(applicationId, true);
  if (!application) return;

  const inviterName = application.client?.full_name ?? application.client?.email ?? "Un cliente";
  const opLabel = application.operation === "rent" ? "alquiler" : "compra";
  const propertyLine = application.property
    ? ` para <strong>${escapeHtml(application.property.title)}</strong>`
    : "";
  const origin =
    process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, "") || "https://portal.bcousinoprop.com";

  // Si el que invita es el propio solicitante principal, usamos su nombre;
  // si invita el equipo (raro, pero posible desde el admin), lo indicamos.
  const invitedBy = inviterId === application.client_id ? inviterName : "el equipo de Benjamín Cousiño Propiedades";

  const html = renderEmailLayout({
    title: "Te han invitado como co-solicitante",
    bodyHtml: `
      <p style="margin: 0 0 14px 0;">Hola,</p>
      <p style="margin: 0 0 14px 0;">
        ${escapeHtml(invitedBy)} te ha invitado a unirte como co-solicitante en una solicitud de ${opLabel}${propertyLine}.
      </p>
      <p style="margin: 0 0 14px 0;">
        Inicia sesión en el portal con este email (<strong>${escapeHtml(inviteEmail)}</strong>) para subir tus propios
        documentos. Cada solicitante sube y gestiona su documentación de forma privada — nadie más puede ver tus archivos.
      </p>
      <p style="margin: 0;">
        Si todavía no tienes acceso al portal, contacta con tu asesor para que te lo active.
      </p>
    `,
    ctaLabel: "Ir al portal",
    ctaUrl: `${origin}/login`,
  });

  await sendEmail({
    to: inviteEmail,
    subject: "Te han invitado como co-solicitante — Benjamín Cousiño Propiedades",
    html,
  });
}
