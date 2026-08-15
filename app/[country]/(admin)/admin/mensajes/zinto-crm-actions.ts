"use server";

import { assertPermission } from "@/lib/auth/guard";
import {
  getCachedZintoContactByPhone,
  getCachedZintoNotes,
  type CachedZintoContact,
  type CachedZintoNote,
} from "@/lib/db/zinto-crm-cache";
import { normalizePhoneNumber } from "@/lib/services/zinto/client";

export type ZintoCrmPanelData = {
  contact: CachedZintoContact | null;
  notes: CachedZintoNote[];
};

/**
 * Read-only lookup of the cached Zinto CRM data (contact + notes) for a
 * WhatsApp conversation's phone number, for display alongside the chat.
 * The cache is populated by a separate sync backend (webhooks + backfill)
 * and may legitimately be empty for a given number.
 */
export async function getZintoCrmPanelData(phone: string): Promise<ZintoCrmPanelData> {
  await assertPermission("mensajes", "view");

  // El caché guarda los teléfonos en E.164 con "+" (así los devuelve Zinto),
  // pero normalizePhoneNumber() los deja solo en dígitos — probamos primero
  // con el "+" antepuesto, que es el formato real de zinto_crm_contacts.phone.
  const normalized = normalizePhoneNumber(phone);
  let contact = await getCachedZintoContactByPhone(`+${normalized}`);
  if (!contact) {
    contact = await getCachedZintoContactByPhone(normalized);
  }
  if (!contact && normalized !== phone) {
    contact = await getCachedZintoContactByPhone(phone);
  }

  if (!contact) {
    return { contact: null, notes: [] };
  }

  const notes = await getCachedZintoNotes(contact.zintoContactId);
  return { contact, notes };
}
