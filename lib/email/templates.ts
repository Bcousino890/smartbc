/**
 * Email template utilities for SmartBC
 */

export interface EmailTemplate {
  subject: string;
  html: string;
}

const BRAND_COLOR_INK = "#2C1C0A";
const BRAND_COLOR_GOLD = "#D4A573";
const BRAND_COLOR_CREAM = "#F5E6D3";

function baseTemplate(content: string, title?: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${BRAND_COLOR_INK}; color: ${BRAND_COLOR_CREAM}; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .header p { margin: 5px 0 0 0; font-size: 14px; opacity: 0.9; }
          .content { background-color: #FDFBF8; padding: 30px; border: 1px solid #E8D9C8; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: ${BRAND_COLOR_INK}; color: ${BRAND_COLOR_CREAM}; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
          .button-center { text-align: center; }
          .footer { font-size: 12px; color: #999; margin-top: 20px; text-align: center; }
          .warning { color: #C41E3A; font-size: 12px; margin-top: 10px; }
          .divider { border: none; border-top: 1px solid #E8D9C8; margin: 20px 0; }
          .inline-button { color: ${BRAND_COLOR_INK}; text-decoration: none; font-weight: bold; }
          code { background-color: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          .highlight { background-color: #f5f5f5; padding: 10px; border-radius: 4px; border-left: 4px solid ${BRAND_COLOR_GOLD}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>SmartBC</h1>
            ${title ? `<p>${title}</p>` : ""}
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>&copy; 2026 SmartBC - Benjamín Cousiño Propiedades. Todos los derechos reservados.</p>
            <p>Este es un correo automático, por favor no respondas a esta dirección.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Welcome/Invitation email
 */
export function getInvitationTemplate(
  userName: string,
  inviteUrl: string
): EmailTemplate {
  const content = `
    <p>Hola <strong>${userName}</strong>,</p>

    <p>¡Bienvenido a SmartBC! Has sido invitado a unirte a nuestro equipo de gestión de propiedades.</p>

    <p>Para comenzar, necesitas configurar tu cuenta. Haz clic en el botón de abajo:</p>

    <div class="button-center">
      <a href="${inviteUrl}" class="button">Configurar Mi Cuenta</a>
    </div>

    <p>O copia y pega este enlace en tu navegador:</p>
    <div class="highlight">
      <code style="word-break: break-all;">${inviteUrl}</code>
    </div>

    <p class="warning">⏱️ Este enlace expirará en 7 días por razones de seguridad.</p>

    <p>Una vez que hayas configurado tu cuenta, podrás:</p>
    <ul>
      <li>Acceder al portal de administración</li>
      <li>Gestionar propiedades y agencias</li>
      <li>Ver reportes y estadísticas</li>
      <li>Colaborar con tu equipo</li>
    </ul>

    <hr class="divider">

    <p style="font-size: 12px; color: #999;">
      Si tienes preguntas o no solicitaste esta invitación, contacta con tu administrador.
    </p>
  `;

  return {
    subject: "Bienvenido a SmartBC - Configura tu cuenta",
    html: baseTemplate(content, "Invitación para Unirse al Equipo"),
  };
}

/**
 * Password reset email
 */
export function getPasswordResetTemplate(
  userName: string,
  resetUrl: string
): EmailTemplate {
  const content = `
    <p>Hola <strong>${userName}</strong>,</p>

    <p>Recibimos una solicitud para restablecer tu contraseña en SmartBC. Si fuiste tú, puedes hacer clic en el botón de abajo:</p>

    <div class="button-center">
      <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
    </div>

    <p>O copia y pega este enlace en tu navegador:</p>
    <div class="highlight">
      <code style="word-break: break-all;">${resetUrl}</code>
    </div>

    <p class="warning">⏱️ Este enlace expirará en 24 horas por razones de seguridad.</p>

    <p>Si <strong>no solicitaste</strong> este cambio de contraseña:</p>
    <ul>
      <li>Puedes ignorar este correo de forma segura</li>
      <li>Tu contraseña permanecerá sin cambios</li>
      <li>Si crees que tu cuenta está comprometida, contacta con el administrador inmediatamente</li>
    </ul>

    <hr class="divider">

    <p style="font-size: 12px; color: #999;">
      Por seguridad, nunca compartiremos tu contraseña por correo. No respondas a este correo con tu contraseña.
    </p>
  `;

  return {
    subject: "Restablecer tu contraseña - SmartBC",
    html: baseTemplate(content, "Solicitud de Restablecimiento de Contraseña"),
  };
}

/**
 * Account verification email
 */
export function getVerificationTemplate(
  userName: string,
  verificationUrl: string
): EmailTemplate {
  const content = `
    <p>Hola <strong>${userName}</strong>,</p>

    <p>Gracias por registrarte en SmartBC. Para completar tu registro, necesitas verificar tu dirección de correo.</p>

    <div class="button-center">
      <a href="${verificationUrl}" class="button">Verificar Mi Correo</a>
    </div>

    <p>O copia y pega este enlace:</p>
    <div class="highlight">
      <code style="word-break: break-all;">${verificationUrl}</code>
    </div>

    <p class="warning">⏱️ Este enlace expirará en 24 horas.</p>

    <p>Una vez verificado, podrás acceder completamente a tu cuenta de SmartBC.</p>

    <hr class="divider">

    <p style="font-size: 12px; color: #999;">
      Si no creaste esta cuenta, por favor ignora este correo.
    </p>
  `;

  return {
    subject: "Verifica tu correo electrónico - SmartBC",
    html: baseTemplate(content, "Verificación de Correo Electrónico"),
  };
}

/**
 * Generic notification email
 */
export function getNotificationTemplate(
  subject: string,
  title: string,
  content: string,
  ctaUrl?: string,
  ctaText?: string
): EmailTemplate {
  const body = `
    ${content}

    ${ctaUrl && ctaText ? `
      <div class="button-center">
        <a href="${ctaUrl}" class="button">${ctaText}</a>
      </div>
    ` : ""}

    <hr class="divider">

    <p style="font-size: 12px; color: #999;">
      Este es un correo de notificación de SmartBC. Para cambiar tus preferencias de notificación, accede a tu perfil.
    </p>
  `;

  return {
    subject: subject,
    html: baseTemplate(body, title),
  };
}

/**
 * Test connection email
 */
export function getTestEmailTemplate(serverDetails: {
  server: string;
  port: number;
  ssl: boolean;
  fromEmail: string;
}): EmailTemplate {
  const content = `
    <p>¡Conexión SMTP Verificada!</p>

    <p>Su configuración de correo SMTP está funcionando correctamente.</p>

    <div class="highlight">
      <strong>Detalles de Conexión:</strong><br>
      Servidor: ${serverDetails.server}<br>
      Puerto: ${serverDetails.port}<br>
      SSL/TLS: ${serverDetails.ssl ? "Habilitado" : "Deshabilitado"}<br>
      Remitente: ${serverDetails.fromEmail}
    </div>

    <p style="margin-top: 20px; color: #666; font-size: 12px;">
      Este es un correo de prueba automático. Si lo ha recibido, su configuración de SMTP está correctamente configurada y lista para usar.
    </p>
  `;

  return {
    subject: "SmartBC - Prueba de Conexión SMTP",
    html: baseTemplate(content, "Prueba de Conexión Exitosa"),
  };
}
