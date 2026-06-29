import "server-only";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require("nodemailer");
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEmailConfig, decryptPassword } from "@/lib/email/send-email";
import { renderEmailLayout } from "@/lib/email/templates";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner", "advisor"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { to } = await req.json();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return Response.json({ error: "Email de destino inválido" }, { status: 400 });
    }

    const config = await getEmailConfig();
    if (!config) {
      return Response.json(
        { error: "SMTP no configurado. Ve a Configuración → SMTP para añadir las credenciales." },
        { status: 400 }
      );
    }

    const password = config.smtpPasswordEncrypted
      ? decryptPassword(config.smtpPasswordEncrypted, config.smtpPasswordIv)
      : process.env.SMTP_PASSWORD || "";

    if (!password) {
      return Response.json({ error: "No se encontró contraseña SMTP." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpServer,
      port: config.smtpPort,
      secure: config.useSsl,
      auth: { user: config.smtpUser, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      from: `${config.fromName || "Benjamín Cousiño Propiedades"} <${config.fromEmail}>`,
      to,
      subject: "✅ Prueba de SMTP — Benjamín Cousiño Propiedades",
      html: renderEmailLayout({
        title: "Correo de prueba",
        bodyHtml: `
          <p style="margin:0 0 14px 0;">Este es un correo de prueba enviado desde el panel de administración de <strong>Benjamín Cousiño Propiedades</strong>.</p>
          <p style="margin:0 0 6px 0;"><strong>Remitente:</strong> ${config.fromEmail}</p>
          <p style="margin:0 0 6px 0;"><strong>Servidor SMTP:</strong> ${config.smtpServer}:${config.smtpPort}</p>
          <p style="margin:0 0 14px 0;"><strong>SSL/TLS:</strong> ${config.useSsl ? "Habilitado" : "Deshabilitado"}</p>
          <p style="margin:0;">Si recibes este correo, la configuración SMTP está funcionando correctamente.</p>
        `,
      }),
    });

    return Response.json({ ok: true, message: `Correo enviado a ${to}` });
  } catch (err) {
    console.error("[send-test-email]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
