import "server-only";
import { sendEmail } from "./send-email";
import { renderEmailLayout, escapeHtml } from "./templates";
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
    subject: "Recupera tu contraseña - Benjamín Cousiño Propiedades",
    html: renderEmailLayout({
      eyebrow: "Restablecer contraseña",
      title: "Recupera tu contraseña",
      bodyHtml: `
        <p style="margin: 0 0 14px 0;">Hola <strong>${escapeHtml(userName)}</strong>,</p>
        <p style="margin: 0 0 14px 0;">Recibimos una solicitud para restablecer tu contrase&ntilde;a. Pulsa el bot&oacute;n de abajo para crear una nueva. Este enlace expirar&aacute; en 24 horas por razones de seguridad.</p>
      `,
      ctaLabel: "Restablecer contraseña",
      ctaUrl: resetUrl,
    }),
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
    subject: "Bienvenido a Benjamín Cousiño Propiedades - Configura tu cuenta",
    html: renderEmailLayout({
      eyebrow: "Nueva cuenta",
      title: "Configura tu cuenta",
      bodyHtml: `
        <p style="margin: 0 0 14px 0;">Hola <strong>${escapeHtml(userName)}</strong>,</p>
        <p style="margin: 0 0 14px 0;">Has sido invitado a unirte al equipo de Benjam&iacute;n Cousi&ntilde;o Propiedades. Para comenzar, configura tu cuenta y establece una contrase&ntilde;a pulsando el bot&oacute;n de abajo. Este enlace expirar&aacute; en 7 d&iacute;as por razones de seguridad.</p>
        <p style="margin: 0 0 14px 0;">Una vez configurada tu cuenta, podr&aacute;s acceder a la plataforma y comenzar a colaborar con tu equipo.</p>
      `,
      ctaLabel: "Configurar mi cuenta",
      ctaUrl: inviteUrl,
    }),
  });

  return result;
}

/**
 * Avisa al correo ANTERIOR de una cuenta de que su correo de acceso ha cambiado.
 * Cambiar el correo de otra cuenta y pedir el enlace de contraseña permitiría
 * entrar como esa persona: con este aviso, si no esperaba el cambio, se entera.
 * Best-effort: si el correo anterior no existe o el envío falla, no se bloquea nada.
 */
export async function sendEmailChangedNotice(params: {
  oldEmail: string;
  newEmail: string;
  userName: string;
}): Promise<{ success: boolean }> {
  const { oldEmail, newEmail, userName } = params;
  const result = await sendEmail({
    to: oldEmail,
    subject: "Se ha cambiado el correo de acceso a tu cuenta - Benjamín Cousiño Propiedades",
    html: renderEmailLayout({
      eyebrow: "Aviso de seguridad",
      title: "Cambió el correo de tu cuenta",
      bodyHtml: `
        <p style="margin: 0 0 14px 0;">Hola <strong>${escapeHtml(userName)}</strong>,</p>
        <p style="margin: 0 0 14px 0;">El correo de acceso a tu cuenta ha pasado de <strong>${escapeHtml(oldEmail)}</strong> a <strong>${escapeHtml(newEmail)}</strong>.</p>
        <p style="margin: 0 0 14px 0;">Si lo esperabas, no tienes que hacer nada. Si no, avisa cuanto antes al Propietario de la cuenta de la agencia.</p>
      `,
    }),
  });
  return { success: result.success };
}

/**
 * Envía a una cuenta YA creada el enlace para que ELLA elija su contraseña
 * (token de un solo uso, 7 días por defecto). Nadie —ni quien crea la cuenta—
 * conoce la contraseña: el enlace llega solo al correo de esa persona y no se
 * devuelve a quien lo pide. `emailSent` dice si el correo salió.
 */
export async function sendAccountSetupLink(params: {
  userId: string;
  email: string;
  firstName: string;
  expiresInHours?: number;
}): Promise<{ emailSent: boolean }> {
  const { userId, email, firstName, expiresInHours = 24 * 7 } = params;
  const tokenData = await createPasswordResetToken(userId, expiresInHours);
  if (!tokenData) return { emailSent: false };
  const appUrl =
    process.env.NEXT_PUBLIC_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/auth/reset-password?token=${tokenData.token}`;
  const sendResult = await sendInvitationEmail(email, firstName || email, inviteUrl);
  return { emailSent: sendResult.success };
}

/**
 * Create a user that's confirmed immediately (account access never depends
 * on any invitation email arriving — same pattern as the staff/no-email
 * client creation routes) and best-effort send a "set your password" link
 * through the app's own AWS SES config (lib/email/send-email.ts).
 *
 * Replaces `supabase.auth.admin.inviteUserByEmail()`, which sends through
 * Supabase Auth/GoTrue's own separate mailer instead of the AWS SES region
 * configured in /admin/configuracion — so invites and password resets used
 * to go out through two different, independently-configured mail paths.
 */
export async function createInvitedUser(params: {
  email: string;
  firstName: string;
  lastName?: string;
  userMetadata?: Record<string, unknown>;
  expiresInHours?: number;
}): Promise<
  | { ok: true; userId: string; emailSent: boolean; tempPassword: string }
  | { ok: false; error: string }
> {
  const { email, firstName, lastName = "", userMetadata = {}, expiresInHours = 24 * 7 } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const tempPassword = randomBytes(12)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);

  const { data, error } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: `${firstName} ${lastName}`.trim(),
      first_name: firstName,
      last_name: lastName,
      ...userMetadata,
    },
  });

  if (error || !data?.user) {
    return { ok: false, error: error?.message || "Error creando usuario" };
  }

  const userId = data.user.id as string;

  const { emailSent } = await sendAccountSetupLink({ userId, email, firstName, expiresInHours });

  return { ok: true, userId, emailSent, tempPassword };
}
