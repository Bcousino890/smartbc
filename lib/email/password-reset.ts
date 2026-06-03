import "server-only";
import { sendEmail } from "./send-email";
import { createAdminClient } from "@/lib/db/admin";
import { randomBytes } from "node:crypto";

/**
 * Generate a secure token for password reset
 */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Create a password reset token in the database
 */
export async function createPasswordResetToken(
  userId: string,
  expiresInHours: number = 24
): Promise<{ token: string; expiresAt: string } | null> {
  try {
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from("password_reset_tokens")
      .insert({
        user_id: userId,
        token,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating reset token:", error);
      return null;
    }

    return {
      token: data.token,
      expiresAt: data.expires_at,
    };
  } catch (error) {
    console.error("Error creating password reset token:", error);
    return null;
  }
}

/**
 * Verify and consume a password reset token
 */
export async function verifyResetToken(token: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    // Find the token
    const { data, error } = await db
      .from("password_reset_tokens")
      .select("user_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if already used
    if (data.used_at) {
      return null;
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return null;
    }

    return data.user_id;
  } catch (error) {
    console.error("Error verifying reset token:", error);
    return null;
  }
}

/**
 * Mark a reset token as used
 */
export async function markTokenAsUsed(token: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const { error } = await db
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    return !error;
  } catch (error) {
    console.error("Error marking token as used:", error);
    return false;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  resetUrl: string
): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmail({
    to: userEmail,
    subject: "Restablece tu contraseña - SmartBC",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2C1C0A; color: #F5E6D3; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background-color: #FDFBF8; padding: 30px; border: 1px solid #E8D9C8; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #2C1C0A; color: #F5E6D3; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { font-size: 12px; color: #999; margin-top: 20px; text-align: center; }
            .warning { color: #C41E3A; font-size: 12px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SmartBC</h1>
              <p>Restablecimiento de Contraseña</p>
            </div>
            <div class="content">
              <p>Hola <strong>${userName}</strong>,</p>

              <p>Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, puedes hacer clic en el botón de abajo para continuar:</p>

              <center>
                <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
              </center>

              <p>O copia y pega este enlace en tu navegador:</p>
              <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px;">
                ${resetUrl}
              </p>

              <p class="warning">Este enlace expirará en 24 horas por razones de seguridad.</p>

              <p>Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>

              <hr style="border: none; border-top: 1px solid #E8D9C8; margin: 20px 0;">

              <p style="font-size: 12px; color: #999;">
                No respondes a este correo. Si tienes problemas, contacta con nuestro equipo de soporte.
              </p>
            </div>
            <div class="footer">
              <p>&copy; 2026 SmartBC. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });

  return result;
}

/**
 * Send invitation email with password setup link
 */
export async function sendInvitationEmail(
  userEmail: string,
  userName: string,
  inviteUrl: string
): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmail({
    to: userEmail,
    subject: "Bienvenido a SmartBC - Configura tu cuenta",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2C1C0A; color: #F5E6D3; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background-color: #FDFBF8; padding: 30px; border: 1px solid #E8D9C8; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #2C1C0A; color: #F5E6D3; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { font-size: 12px; color: #999; margin-top: 20px; text-align: center; }
            .warning { color: #C41E3A; font-size: 12px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SmartBC</h1>
              <p>Te invitamos a unirte a nuestro equipo</p>
            </div>
            <div class="content">
              <p>Hola <strong>${userName}</strong>,</p>

              <p>Has sido invitado a unirte al equipo de SmartBC. Para comenzar, necesitas configurar tu cuenta y establecer una contraseña:</p>

              <center>
                <a href="${inviteUrl}" class="button">Configurar Mi Cuenta</a>
              </center>

              <p>O copia y pega este enlace en tu navegador:</p>
              <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px;">
                ${inviteUrl}
              </p>

              <p class="warning">Este enlace expirará en 7 días por razones de seguridad.</p>

              <p>Una vez que hayas configurado tu cuenta, podrás acceder a SmartBC y comenzar a colaborar con tu equipo.</p>

              <hr style="border: none; border-top: 1px solid #E8D9C8; margin: 20px 0;">

              <p style="font-size: 12px; color: #999;">
                Si tienes preguntas, contacta con tu administrador o nuestro equipo de soporte.
              </p>
            </div>
            <div class="footer">
              <p>&copy; 2026 SmartBC. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });

  return result;
}
