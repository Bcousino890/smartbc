/**
 * Plantillas de correo de marca para SmartBC — Benjamín Cousiño Propiedades.
 *
 * Genera HTML seguro para clientes de correo:
 * - Layout basado en tablas (sin flexbox) con ancho máximo de 600px.
 * - Solo estilos inline (sin CSS externo ni <style>).
 * - El logo es el mismo /public/logo.png que usa el resto de la app (barra
 *   lateral, portal del cliente), servido por URL absoluta — un correo no
 *   puede cargar un asset relativo. Es el navy nativo del archivo, sin el
 *   filtro brightness/invert que lo pone blanco en la barra lateral oscura:
 *   aquí el fondo es claro, así que no hace falta.
 * - El botón es el mismo que "Guardar Configuración" en el panel (fondo ink,
 *   texto crema) — para que el correo se sienta parte del mismo producto, no
 *   una plantilla genérica aparte.
 * - Fuentes solo del sistema (sin @font-face / Google Fonts): Outlook de
 *   escritorio no carga fuentes web y cae en Times New Roman sin avisar, así
 *   que se listan pilas de fuentes reales en vez de apostar a una externa.
 * - Un único tema (claro), a propósito: el dark-mode de correo es
 *   inconsistente entre clientes — Outlook/Gmail pueden re-invertir colores
 *   por su cuenta y pelearse con CSS de dark-mode escrito a mano, así que se
 *   elige un solo diseño de alto contraste en vez de arriesgar una inversión
 *   rota en la bandeja de un cliente.
 */

// Paleta de marca — la misma que el resto de la app (barra lateral, botones).
const INK = "#2a1f10"; // tinta oscura — wordmark, títulos, botón primario
const CREAM = "#fbf8f3"; // crema de fondo
const PAPER = "#ffffff"; // superficie de la tarjeta
const GOLD = "#c9a96e"; // acento dorado — regla, flecha del botón
const GOLD_DEEP = "#a3824f"; // dorado oscurecido — texto pequeño sobre crema (el dorado claro no da contraste suficiente para texto)
const MUTED = "#8a7c66"; // texto secundario
const BORDER = "#e8dfd0"; // bordes suaves

// Pilas de fuentes seguras para correo (sin fuentes web).
const SERIF_FONT = "Georgia, 'Iowan Old Style', 'Times New Roman', Times, serif";
const SANS_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Mismo dominio público que usan los enlaces de reset/invitación
// (lib/email/password-reset.ts) — el logo necesita una URL absoluta, un
// correo no puede resolver "/logo.png" como haría el navegador.
const APP_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const LOGO_WIDTH = 220;
const LOGO_HEIGHT = Math.round(LOGO_WIDTH * (519 / 3282)); // aspect ratio real de /public/logo.png

export interface RenderEmailLayoutOptions {
  /** Etiqueta corta sobre el título (p.ej. "RESTABLECER CONTRASEÑA"). */
  eyebrow?: string;
  /** Título principal del correo (se muestra como encabezado del contenido). */
  title: string;
  /** Cuerpo del correo en HTML (párrafos, etc.). Debe ser HTML de confianza. */
  bodyHtml: string;
  /** Texto del botón CTA (opcional; requiere ctaUrl). */
  ctaLabel?: string;
  /** URL del botón CTA (opcional; requiere ctaLabel). */
  ctaUrl?: string;
}

/**
 * Escapa caracteres especiales de HTML en texto plano.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renderiza el layout de correo de marca completo (documento HTML).
 */
export function renderEmailLayout({
  eyebrow,
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
}: RenderEmailLayoutOptions): string {
  const eyebrowBlock = eyebrow
    ? `<p style="margin: 0 0 10px 0; font-family: ${SANS_FONT}; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${GOLD_DEEP};">${escapeHtml(eyebrow)}</p>`
    : "";

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `
              <!-- CTA: mismo estilo que el botón primario del panel (fondo ink, texto crema) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 30px auto 0;">
                <tr>
                  <td align="center" bgcolor="${INK}" style="border-radius: 6px;">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 15px 34px; font-family: ${SANS_FONT}; font-size: 15px; font-weight: 600; color: ${CREAM}; text-decoration: none; border-radius: 6px; background-color: ${INK}; letter-spacing: 0.01em;">${escapeHtml(ctaLabel)}&nbsp;&nbsp;<span style="color: ${GOLD};">&rarr;</span></a>
                  </td>
                </tr>
              </table>
              <!-- Enlace alternativo en texto plano -->
              ${renderFallbackUrl(ctaUrl)}`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${CREAM};">
    <!-- Contenedor exterior -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="background-color: ${CREAM};">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <!-- Contenedor principal 600px -->
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">
            <!-- Logo: el mismo /public/logo.png que la barra lateral de la app -->
            <tr>
              <td align="center" style="padding: 0 24px 28px 24px;">
                <img
                  src="${APP_URL}/logo.png"
                  width="${LOGO_WIDTH}"
                  height="${LOGO_HEIGHT}"
                  alt="Benjam&iacute;n Cousi&ntilde;o Propiedades"
                  style="display: block; border: 0; outline: none; text-decoration: none; width: ${LOGO_WIDTH}px; max-width: 70%; height: auto; font-family: ${SERIF_FONT}; font-size: 18px; font-weight: bold; color: ${INK};"
                >
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top: 18px;">
                  <tr>
                    <td width="40" height="2" bgcolor="${GOLD}" style="font-size: 0; line-height: 0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Tarjeta de contenido -->
            <tr>
              <td bgcolor="${PAPER}" style="background-color: ${PAPER}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 40px 40px 36px 40px;">
                ${eyebrowBlock}
                <h1 style="margin: 0 0 16px 0; font-family: ${SERIF_FONT}; font-size: 25px; line-height: 1.3; font-weight: 400; color: ${INK};">${escapeHtml(title)}</h1>
                <div style="font-family: ${SANS_FONT}; font-size: 15px; line-height: 1.65; color: ${INK};">
                  ${bodyHtml}
                </div>${ctaBlock}
              </td>
            </tr>
            <!-- Pie de página -->
            <tr>
              <td align="center" style="padding: 28px 24px 8px 24px;">
                <p style="margin: 0 0 6px 0; font-family: ${SANS_FONT}; font-size: 12px; color: ${MUTED};">Benjam&iacute;n Cousi&ntilde;o Propiedades &middot; Madrid</p>
                <p style="margin: 0; font-family: ${SANS_FONT}; font-size: 12px; color: ${MUTED};">Si no solicitaste este correo, puedes ignorarlo con tranquilidad.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Bloque auxiliar para mostrar una URL en texto plano como alternativa al CTA.
 */
export function renderFallbackUrl(url: string): string {
  return `
    <p style="margin: 18px 0 6px 0; font-family: ${SANS_FONT}; font-size: 12.5px; color: ${MUTED};">Si el bot&oacute;n no funciona, copia y pega este enlace en tu navegador:</p>
    <p style="margin: 0; padding: 11px 13px; background-color: ${CREAM}; border: 1px solid ${BORDER}; border-radius: 5px; font-family: ${SANS_FONT}; font-size: 12px; color: ${INK}; word-break: break-all;"><a href="${url}" target="_blank" style="color: ${INK}; text-decoration: underline;">${escapeHtml(url)}</a></p>`;
}
