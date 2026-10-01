// ============================================================================
// Cómo se ENSEÑA un cliente en el panel (lista, panel lateral, ficha).
//
// Puro y sin dependencias: se usa desde Client Components y desde el adapter.
// ============================================================================

import type { ClientProfileType } from "@/lib/types";

/**
 * Dominios de los emails de relleno. `auth.users` exige un email, así que los
 * clientes creados sin él reciben uno inventado:
 *  · `sin-email-<ts>@interno.smartbc.local` — /api/admin/usuarios/create-with-password
 *  · `lead-<hex>@sin-email.bcousinoprop.com` — Solicitudes → preparar visita
 * Enseñarlos como si fueran de verdad (la lista de clientes lo hacía) invita
 * a escribir a una dirección que no existe. Si se añade otro generador, su
 * dominio va aquí.
 */
const PLACEHOLDER_EMAIL_DOMAINS = ["interno.smartbc.local", "sin-email.bcousinoprop.com"];

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PLACEHOLDER_EMAIL_DOMAINS.includes(domain);
}

/** El email si es real; null si es de relleno o no hay. */
export function realEmail(email: string | null | undefined): string | null {
  return isPlaceholderEmail(email) ? null : (email as string);
}

/**
 * El perfil del cliente (estudiante, trabajador…) no tiene columna: sale de
 * una etiqueta con ese nombre. Por eso la ficha pintaba "ESTUDIANTE" dos veces
 * — una como perfil y otra como la etiqueta de la que salía.
 */
export const PROFILE_TYPE_BY_TAG: Record<string, ClientProfileType> = {
  Estudiante: "student",
  Trabajador: "worker",
  Empresa: "company",
  Familia: "family",
  Inversor: "investor",
};
