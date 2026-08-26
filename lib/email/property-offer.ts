import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendEmail } from "./send-email";
import { renderEmailLayout, escapeHtml } from "./templates";
import type { SuggestedProperty } from "@/lib/db/queries/suggested-properties";

const APP_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const INK = "#2a1f10";
const MUTED = "#8a7c66";
const BORDER = "#e8dfd0";
const GOLD_DEEP = "#a3824f";
const SANS_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type OfferableProperty = Omit<SuggestedProperty, "matchScore" | "matchReasons">;

function operationLabel(op: "rent" | "sale"): string {
  return op === "rent" ? "Alquiler" : "Venta";
}

function formatPrice(price: number, currency: string | null, operation: "rent" | "sale"): string {
  const formatted = new Intl.NumberFormat("es-ES").format(price);
  const unit = currency === "clp" ? "$" : currency === "usd" ? "US$" : "€";
  return operation === "rent" ? `${unit}${formatted}/mes` : `${unit}${formatted}`;
}

/**
 * Una tarjeta de propiedad (foto + datos + precio) para incrustar dentro de
 * bodyHtml de renderEmailLayout. Un solo bloque apilado (sin columnas) a
 * propósito: en email, layouts de dos columnas necesitan tablas anidadas y se
 * rompen fácil en Outlook; apilado funciona igual de bien y es más legible en
 * móvil de todas formas.
 */
function renderPropertyCard(property: OfferableProperty, propertyUrl: string): string {
  const photo = property.photos[0] ? `${APP_URL}${property.photos[0]}` : null;
  const facts = [
    `${property.bedrooms} hab.`,
    `${property.bathrooms} baño${property.bathrooms === 1 ? "" : "s"}`,
    property.squareMeters > 0 ? `${property.squareMeters} m²` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const location = property.subzone ? `${property.zone} · ${property.subzone}` : property.zone;

  const photoBlock = photo
    ? `<img src="${photo}" alt="${escapeHtml(property.title)}" width="520" style="display:block; border:0; outline:none; width:100%; max-width:520px; height:auto; border-radius:6px; margin-bottom:14px;">`
    : "";

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid ${BORDER}; border-radius: 8px; margin: 0 0 18px 0;">
      <tr>
        <td style="padding: 16px;">
          ${photoBlock}
          <p style="margin: 0 0 4px 0; font-family: ${SANS_FONT}; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${GOLD_DEEP};">${operationLabel(property.operation)}</p>
          <p style="margin: 0 0 4px 0; font-family: ${SANS_FONT}; font-size: 16px; font-weight: 600; color: ${INK};">${escapeHtml(property.title)}</p>
          <p style="margin: 0 0 8px 0; font-family: ${SANS_FONT}; font-size: 13px; color: ${MUTED};">${escapeHtml(location)}${facts ? ` · ${escapeHtml(facts)}` : ""}</p>
          <p style="margin: 0 0 12px 0; font-family: ${SANS_FONT}; font-size: 16px; font-weight: 700; color: ${INK};">${escapeHtml(formatPrice(property.price, property.currency, property.operation))}</p>
          <a href="${propertyUrl}" target="_blank" style="display: inline-block; font-family: ${SANS_FONT}; font-size: 13px; font-weight: 600; color: ${INK}; text-decoration: underline;">Ver propiedad &rarr;</a>
        </td>
      </tr>
    </table>`;
}

function propertyUrl(slug: string): string {
  return `${APP_URL}/compartir/${slug}`;
}

/**
 * Correo manual: un asesor pulsa "Enviar por correo" sobre una propiedad
 * concreta en la ficha del cliente (offerPropertyToClient). No es una alerta
 * automática — es la agencia diciendo "pensamos en ti para esta".
 */
export async function sendPropertyOfferEmail(params: {
  to: string;
  clientName: string;
  property: OfferableProperty;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  const url = propertyUrl(params.property.slug);
  const noteBlock = params.note
    ? `<p style="margin: 0 0 16px 0; padding: 12px 14px; background-color: #fbf8f3; border-left: 3px solid ${GOLD_DEEP}; font-style: italic;">${escapeHtml(params.note)}</p>`
    : "";

  return sendEmail({
    to: params.to,
    subject: `Una propiedad para ti: ${params.property.title} — Benjamín Cousiño Propiedades`,
    html: renderEmailLayout({
      eyebrow: "Propiedad recomendada",
      title: "Pensamos en ti para esta propiedad",
      bodyHtml: `
        <p style="margin: 0 0 14px 0;">Hola <strong>${escapeHtml(params.clientName)}</strong>,</p>
        <p style="margin: 0 0 18px 0;">Tu asesor en Benjam&iacute;n Cousi&ntilde;o Propiedades ha pensado que esta propiedad puede interesarte.</p>
        ${noteBlock}
        ${renderPropertyCard(params.property, url)}
      `,
      ctaLabel: "Ver la propiedad completa",
      ctaUrl: url,
    }),
  });
}

/**
 * Resumen agrupado de propiedades nuevas que coinciden con las preferencias
 * de un cliente (property-alerts cron). Solo se manda a clientes con
 * `client_preferences.new_listing_alerts_enabled = true` — un asesor tiene
 * que activarlo explícitamente por cliente.
 */
export async function sendNewListingsDigestEmail(params: {
  to: string;
  clientName: string;
  properties: OfferableProperty[];
  unsubscribeUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const cards = params.properties.map((p) => renderPropertyCard(p, propertyUrl(p.slug))).join("");
  const count = params.properties.length;

  return sendEmail({
    to: params.to,
    subject:
      count === 1
        ? "Una propiedad nueva que puede interesarte — Benjamín Cousiño Propiedades"
        : `${count} propiedades nuevas que pueden interesarte — Benjamín Cousiño Propiedades`,
    html: renderEmailLayout({
      eyebrow: "Novedades para ti",
      title:
        count === 1
          ? "Una propiedad nueva que coincide contigo"
          : `${count} propiedades nuevas que coinciden contigo`,
      bodyHtml: `
        <p style="margin: 0 0 14px 0;">Hola <strong>${escapeHtml(params.clientName)}</strong>,</p>
        <p style="margin: 0 0 18px 0;">Desde la &uacute;ltima vez que te escribimos, ha entrado ${count === 1 ? "esta propiedad" : "lo siguiente"} que coincide con lo que buscas.</p>
        ${cards}
        <p style="margin: 18px 0 0 0; font-family: ${SANS_FONT}; font-size: 12px; color: ${MUTED};"><a href="${params.unsubscribeUrl}" target="_blank" style="color: ${MUTED}; text-decoration: underline;">Dejar de recibir estas alertas</a></p>
      `,
    }),
  });
}

// ─── Token de baja (unsubscribe) ────────────────────────────────────────────
// Sin login: el cliente puede recibir este correo sin tener sesión abierta, y
// exigirle iniciar sesión solo para darse de baja es exactamente el tipo de
// fricción que hace que la gente marque el correo como spam en su lugar.
// HMAC determinista en vez de un token en una tabla: la baja es idempotente y
// no expira, así que no hace falta guardar ni limpiar nada — a diferencia del
// token de un solo uso de password_reset_tokens.
const UNSUBSCRIBE_SECRET =
  process.env.EMAIL_ENCRYPTION_KEY || "default-insecure-key-change-this";

export function signUnsubscribeToken(clientId: string): string {
  return createHmac("sha256", UNSUBSCRIBE_SECRET).update(clientId).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(clientId: string, token: string): boolean {
  const expected = signUnsubscribeToken(clientId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildUnsubscribeUrl(clientId: string): string {
  const token = signUnsubscribeToken(clientId);
  return `${APP_URL}/api/public/property-alerts/unsubscribe?client=${clientId}&token=${token}`;
}
