// ============================================================================
// Contacto público de un catálogo (BCP-01 ampliación, D19): formato. Puro y
// sin dependencias: lo usan el contrato público (servidor) y la interfaz.
// La validación con normalización del teléfono vive en contact.ts (servidor).
// ============================================================================

export type ContactRole = "asesor" | "asesora";

/** Valor por defecto al crear un catálogo (y relleno de 0194): el teléfono
 *  de la agencia. Solo se PRECARGA; lo que se publica es lo guardado. */
export const CONTACT_DEFAULT_PHONE = "+34641457123";
export const CONTACT_DEFAULT_ROLE: ContactRole = "asesor";
export const CONTACT_NAME_MAX = 80;

export function isContactRole(v: unknown): v is ContactRole {
  return v === "asesor" || v === "asesora";
}

/** «Tu asesor» / «Tu asesora». */
export function contactRoleLabel(role: ContactRole | null | undefined): string {
  return role === "asesora" ? "Tu asesora" : "Tu asesor";
}

/** E.164 → legible: «+34 641 457 123»; otros países, el prefijo aparte y el
 *  resto en grupos de tres desde el principio. */
export function formatContactPhone(e164: string | null | undefined): string | null {
  if (!e164 || !/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (/^\+34\d{9}$/.test(e164)) return `+34 ${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`;
  const m = /^\+(1|[2-9]\d)(\d+)$/.exec(e164);
  if (!m) return e164;
  const groups = m[2].match(/.{1,3}/g) ?? [m[2]];
  return `+${m[1]} ${groups.join(" ")}`;
}

/** Enlace tel: a partir del E.164 guardado. */
export function contactPhoneHref(e164: string | null | undefined): string | null {
  return e164 && /^\+[1-9]\d{7,14}$/.test(e164) ? `tel:${e164}` : null;
}
