import "server-only";
import { sendEmail } from "./send-email";
import { renderEmailLayout, escapeHtml } from "./templates";

const APP_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const INK = "#2a1f10";
const MUTED = "#8a7c66";
const BORDER = "#e8dfd0";
const SANS_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface NewLeadSummary {
  name: string | null;
  propertyTitle: string | null;
  propertyPrice: string | null;
  phone: string | null;
}

function solicitudesUrl(country: string): string {
  return `${APP_URL}/${country}/admin/solicitudes`;
}

function renderLeadRow(lead: NewLeadSummary): string {
  const name = lead.name && lead.name.trim() ? lead.name.trim() : "Sin nombre";
  const details = [lead.propertyTitle, lead.propertyPrice].filter(Boolean).join(" · ");
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid ${BORDER}; border-radius: 8px; margin: 0 0 10px 0;">
      <tr>
        <td style="padding: 12px 16px;">
          <p style="margin: 0 0 2px 0; font-family: ${SANS_FONT}; font-size: 15px; font-weight: 600; color: ${INK};">${escapeHtml(name)}</p>
          ${details ? `<p style="margin: 0; font-family: ${SANS_FONT}; font-size: 13px; color: ${MUTED};">${escapeHtml(details)}</p>` : ""}
          ${lead.phone ? `<p style="margin: 4px 0 0 0; font-family: ${SANS_FONT}; font-size: 13px; color: ${MUTED};">${escapeHtml(lead.phone)}</p>` : ""}
        </td>
      </tr>
    </table>`;
}

/**
 * Digest a los admins cuando llegan clientes nuevos a la bandeja comercial
 * (Solicitudes). Se manda una vez por tanda de la extensión de Idealista, no
 * un correo por lead individual — "Capturar todas" puede traer decenas de
 * golpe. Best-effort: quien lo llama decide qué hacer si falla, esta función
 * solo intenta el envío.
 */
export async function sendNewLeadsAdminEmail(params: {
  to: string;
  leads: NewLeadSummary[];
  country: string;
}): Promise<{ success: boolean; error?: string }> {
  const count = params.leads.length;
  const url = solicitudesUrl(params.country);
  const amounts = params.leads.map((l) => l.propertyPrice).filter((p): p is string => !!p);
  const amountsLine =
    amounts.length > 0
      ? `<p style="margin: 0 0 18px 0;">Por los montos de ${amounts.map((a) => `<strong>${escapeHtml(a)}</strong>`).join(", ")}.</p>`
      : "";

  return sendEmail({
    to: params.to,
    subject:
      count === 1
        ? "1 cliente nuevo en Solicitudes — Benjamín Cousiño Propiedades"
        : `${count} clientes nuevos en Solicitudes — Benjamín Cousiño Propiedades`,
    html: renderEmailLayout({
      eyebrow: "Bandeja comercial",
      title: count === 1 ? "Llegó 1 cliente nuevo" : `Llegaron ${count} clientes nuevos`,
      bodyHtml: `
        <p style="margin: 0 0 14px 0;">Hola,</p>
        <p style="margin: 0 0 8px 0;">${count === 1 ? "Ha llegado 1 solicitud nueva" : `Han llegado ${count} solicitudes nuevas`} a la bandeja comercial.</p>
        ${amountsLine}
        ${params.leads.map(renderLeadRow).join("")}
      `,
      ctaLabel: "Ver en Solicitudes",
      ctaUrl: url,
    }),
  });
}
