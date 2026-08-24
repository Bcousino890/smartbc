import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEmailConfig, createSesTransport } from "@/lib/email/send-email";
import { decryptSecret } from "@/lib/crypto/secret";
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
        { error: "AWS SES no configurado. Ve a Configuración → Email para añadir las credenciales." },
        { status: 400 }
      );
    }

    const secretAccessKey = config.awsSecretAccessKeyEncrypted
      ? decryptSecret(config.awsSecretAccessKeyEncrypted, config.awsSecretAccessKeyIv)
      : process.env.AWS_SES_SECRET_ACCESS_KEY || "";

    if (!secretAccessKey) {
      return Response.json({ error: "No se encontró la Secret Access Key de AWS." }, { status: 400 });
    }

    const transporter = createSesTransport(config.awsRegion, config.awsAccessKeyId, secretAccessKey);

    await transporter.sendMail({
      from: `${config.fromName || "Benjamín Cousiño Propiedades"} <${config.fromEmail}>`,
      to,
      subject: "✅ Prueba de email (AWS SES) — Benjamín Cousiño Propiedades",
      html: renderEmailLayout({
        eyebrow: "Panel de administración",
        title: "Correo de prueba",
        bodyHtml: `
          <p style="margin:0 0 14px 0;">Este es un correo de prueba enviado desde el panel de administración de <strong>Benjamín Cousiño Propiedades</strong>.</p>
          <p style="margin:0 0 6px 0;"><strong>Remitente:</strong> ${config.fromEmail}</p>
          <p style="margin:0 0 6px 0;"><strong>Región AWS SES:</strong> ${config.awsRegion}</p>
          <p style="margin:0;">Si recibes este correo, la configuración de AWS SES está funcionando correctamente.</p>
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
