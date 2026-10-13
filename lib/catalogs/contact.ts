import { normalizeContactPhone } from "@/lib/sync/particulares/phone-international";
import { CONTACT_NAME_MAX, isContactRole, type ContactRole } from "./contact-format";

// ============================================================================
// Validación del contacto público de un catálogo (BCP-01 ampliación, D19).
// SOLO SERVIDOR (normalizeContactPhone arrastra el detector de Idealista).
// Mismas reglas que catalog_contact_name_ok y el CHECK de 0194: lo que pasa
// aquí también pasa en SQL. Probado en scripts/test-catalogs-public.mts.
// ============================================================================

export type ContactError = "invalid_contact_name" | "invalid_contact_phone" | "invalid_contact_role";

export interface CatalogContact {
  name: string;
  phone: string; // E.164
  role: ContactRole;
}

/** Nombre visible: 2–80 caracteres, sin correos, URLs ni secuencias de
 *  teléfono (para no colar un contacto en el nombre). */
export function isValidContactName(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const name = raw.trim();
  if (name.length < 2 || name.length > CONTACT_NAME_MAX) return false;
  if (name.includes("@")) return false;
  if (/(https?:\/\/|www\.)/i.test(name)) return false;
  if (/\d([\s.-]?\d){5,}/.test(name)) return false;
  return true;
}

export function validateCatalogContact(input: {
  name?: unknown;
  phone?: unknown;
  role?: unknown;
}): { ok: true; contact: CatalogContact } | { ok: false; error: ContactError } {
  if (!isValidContactName(input.name)) return { ok: false, error: "invalid_contact_name" };
  const phone = typeof input.phone === "string" ? normalizeContactPhone(input.phone) : null;
  if (!phone) return { ok: false, error: "invalid_contact_phone" };
  if (!isContactRole(input.role)) return { ok: false, error: "invalid_contact_role" };
  return { ok: true, contact: { name: (input.name as string).trim(), phone, role: input.role } };
}
