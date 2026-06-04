import "server-only";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer');

export async function POST(req: Request) {
  try {
    const { smtpServer, smtpPort, smtpUser, smtpPassword, useSsl, fromEmail, fromName } =
      await req.json();

    // Validation
    if (!smtpServer || !smtpPort || !smtpUser || !smtpPassword || !fromEmail) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate a temporary IV for the test (IV is just for testing, not stored)
    const tempIv = "test-encryption-key";

    // For testing, we pass the plaintext password directly
    try {
      const transporter = nodemailer.createTransport({
        host: smtpServer,
        port: smtpPort,
        secure: useSsl ?? true,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      await transporter.verify();

      // If connection successful, send a test email
      const testEmailResult = await transporter.sendMail({
        from: `${fromName || "SmartBC"} <${fromEmail}>`,
        to: fromEmail, // Send test email to the configured from_email
        subject: "SmartBC - Test Email Connection",
        html: `
          <h2>Conexión SMTP Verificada</h2>
          <p>Su configuración de correo SMTP está funcionando correctamente.</p>
          <p><strong>Remitente:</strong> ${fromEmail}</p>
          <p><strong>Servidor:</strong> ${smtpServer}:${smtpPort}</p>
          <p><strong>SSL/TLS:</strong> ${useSsl ? "Habilitado" : "Deshabilitado"}</p>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">Este es un correo de prueba. Si lo recibe, su configuración está correcta.</p>
        `,
      });

      return Response.json({
        ok: true,
        message: "SMTP connection successful and test email sent",
        messageId: testEmailResult.messageId,
      });
    } catch (connectionError) {
      console.error("SMTP connection test error:", connectionError);
      return Response.json(
        {
          ok: false,
          error: `SMTP connection failed: ${
            connectionError instanceof Error ? connectionError.message : "Unknown error"
          }`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Test email error:", error);
    return Response.json(
      { error: "Error testing email connection" },
      { status: 500 }
    );
  }
}
