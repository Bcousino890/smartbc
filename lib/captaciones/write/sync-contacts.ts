import "server-only";
import { normalizePhone } from "@/lib/phone-utils";
import { parseExtraPhones } from "../extra-phones";

/**
 * Sincroniza la pestaña «Info» de la ficha: los contactos de la captación
 * (dueño, cónyuge, familiares, otros) con sus teléfonos adicionales y RUT.
 *
 * Identidad de un contacto, en este orden:
 *   1. `external_id` del proveedor (índice único por captación).
 *   2. teléfono normalizado, si el proveedor no manda id propio.
 *   3. si no hay ninguno de los dos, se crea uno nuevo.
 *
 * Así una segunda sincronización actualiza el contacto existente en vez de
 * duplicarlo, que es justo lo que tiene que pasar cuando el proveedor corrige
 * un número.
 */

export type ContactInput = {
  external_id?: string | null;
  contact_type: "owner" | "spouse" | "family" | "other";
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  has_whatsapp?: boolean | null;
  relationship?: string | null;
  rut?: string | null;
  extra_phones?: { phone: string; has_whatsapp?: boolean | null; label?: string | null }[] | null;
};

export type ContactSyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  errors: { external_id?: string | null; message: string }[];
};

type ExistingContact = {
  id: string;
  external_id: string | null;
  contact_type: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  has_whatsapp: boolean | null;
  relationship: string | null;
  rut: string | null;
  extra_phones: unknown;
};

function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function syncCaptacionContacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  contacts: ContactInput[],
  opts: { dryRun?: boolean } = {}
): Promise<ContactSyncResult> {
  const result: ContactSyncResult = { created: 0, updated: 0, unchanged: 0, errors: [] };
  if (contacts.length === 0) return result;

  const { data: existingRows } = await db
    .from("captacion_contacts")
    .select("id, external_id, contact_type, contact_name, phone, email, has_whatsapp, relationship, rut, extra_phones")
    .eq("captacion_id", captacionId);

  const existing: ExistingContact[] = existingRows ?? [];
  const byExternalId = new Map<string, ExistingContact>();
  const byPhone = new Map<string, ExistingContact>();
  for (const row of existing) {
    if (row.external_id) byExternalId.set(row.external_id, row);
    if (row.phone) byPhone.set(row.phone, row);
  }

  for (const contact of contacts) {
    const externalId = normalizeOptional(contact.external_id);
    const rawPhone = normalizeOptional(contact.phone);
    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    const extra = parseExtraPhones(contact.extra_phones ?? []);
    if (extra.error) {
      result.errors.push({ external_id: externalId, message: extra.error });
      continue;
    }

    const payload = {
      captacion_id: captacionId,
      external_id: externalId,
      contact_type: contact.contact_type,
      contact_name: normalizeOptional(contact.contact_name),
      phone,
      email: normalizeOptional(contact.email),
      has_whatsapp: Boolean(contact.has_whatsapp),
      relationship: normalizeOptional(contact.relationship),
      rut: normalizeOptional(contact.rut),
      extra_phones: extra.phones,
    };

    const match =
      (externalId ? byExternalId.get(externalId) : undefined) ??
      (phone ? byPhone.get(phone) : undefined);

    if (!match) {
      if (!opts.dryRun) {
        const { error } = await db.from("captacion_contacts").insert(payload);
        if (error) {
          result.errors.push({ external_id: externalId, message: error.message });
          continue;
        }
      }
      result.created += 1;
      continue;
    }

    const changed =
      match.contact_type !== payload.contact_type ||
      match.contact_name !== payload.contact_name ||
      match.phone !== payload.phone ||
      match.email !== payload.email ||
      Boolean(match.has_whatsapp) !== payload.has_whatsapp ||
      match.relationship !== payload.relationship ||
      match.rut !== payload.rut ||
      JSON.stringify(match.extra_phones ?? []) !== JSON.stringify(payload.extra_phones) ||
      (externalId !== null && match.external_id !== externalId);

    if (!changed) {
      result.unchanged += 1;
      continue;
    }

    if (!opts.dryRun) {
      const { error } = await db
        .from("captacion_contacts")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", match.id);
      if (error) {
        result.errors.push({ external_id: externalId, message: error.message });
        continue;
      }
    }
    result.updated += 1;
  }

  return result;
}

/**
 * Contacto principal (dueño) de una captación, para reflejarlo también en los
 * campos planos `owner_name` / `owner_phone` de la ficha.
 */
export function pickOwnerContact(contacts: ContactInput[]): ContactInput | null {
  return contacts.find((c) => c.contact_type === "owner") ?? contacts[0] ?? null;
}
