import "server-only";
import { normalizePhone } from "@/lib/phone-utils";
import { parseExtraPhones } from "../extra-phones";
import { persistContactPhoto, removeContactPhoto } from "./persist-contact-photo";

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
  /** URL de origen de la foto de perfil. Se descarga y se guarda copia propia. */
  photo_url?: string | null;
  extra_phones?: { phone: string; has_whatsapp?: boolean | null; label?: string | null }[] | null;
};

export type ContactSyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  /** Fotos de perfil encoladas para descargar y re-alojar. */
  photosQueued: number;
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
  photo_url: string | null;
  photo_storage_path: string | null;
  photo_source_url: string | null;
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
  const result: ContactSyncResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    photosQueued: 0,
    errors: [],
  };
  if (contacts.length === 0) return result;

  const { data: existingRows } = await db
    .from("captacion_contacts")
    .select("id, external_id, contact_type, contact_name, phone, email, has_whatsapp, relationship, rut, extra_phones, photo_url, photo_storage_path, photo_source_url")
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

    const incomingPhoto = normalizeOptional(contact.photo_url);

    if (!match) {
      if (!opts.dryRun) {
        const { data: inserted, error } = await db
          .from("captacion_contacts")
          .insert(payload)
          .select("id")
          .single();
        if (error) {
          result.errors.push({ external_id: externalId, message: error.message });
          continue;
        }
        if (incomingPhoto) {
          queuePhoto(db, captacionId, inserted.id, incomingPhoto, null);
          result.photosQueued += 1;
        }
      } else if (incomingPhoto) {
        result.photosQueued += 1;
      }
      result.created += 1;
      continue;
    }

    // La foto solo se toca si el proveedor manda una distinta de la que ya
    // descargamos de él. Si photo_url tiene valor pero photo_source_url es NULL,
    // la subió una persona desde el panel y gana sobre la sincronización.
    const photoIsManual = Boolean(match.photo_url) && !match.photo_source_url;
    const photoChanged =
      contact.photo_url !== undefined &&
      !photoIsManual &&
      incomingPhoto !== match.photo_source_url;

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

    if (!changed && !photoChanged) {
      result.unchanged += 1;
      continue;
    }

    if (!opts.dryRun) {
      if (changed) {
        const { error } = await db
          .from("captacion_contacts")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", match.id);
        if (error) {
          result.errors.push({ external_id: externalId, message: error.message });
          continue;
        }
      }

      if (photoChanged) {
        if (incomingPhoto) {
          queuePhoto(db, captacionId, match.id, incomingPhoto, match.photo_storage_path);
          result.photosQueued += 1;
        } else {
          // El proveedor manda null: borra la foto que él mismo había puesto.
          void clearPhoto(db, match.id, match.photo_storage_path);
        }
      }
    } else if (photoChanged && incomingPhoto) {
      result.photosQueued += 1;
    }

    result.updated += 1;
  }

  return result;
}

/**
 * Descarga y re-aloja la foto en SEGUNDO PLANO: la respuesta al proveedor no
 * debe esperar a bajar una imagen por contacto. Es seguro porque SmartBC corre
 * como proceso PM2 persistente, el mismo patrón que la galería de la captación.
 *
 * Si la descarga falla o el número no tiene foto (404), no se escribe nada y el
 * panel sigue pintando el avatar genérico.
 */
function queuePhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  contactId: string,
  sourceUrl: string,
  previousStoragePath: string | null
): void {
  void (async () => {
    const persisted = await persistContactPhoto(db, captacionId, contactId, sourceUrl);
    if (!persisted) return;

    const { error } = await db
      .from("captacion_contacts")
      .update({
        photo_url: persisted.url,
        photo_storage_path: persisted.storagePath,
        photo_source_url: sourceUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId);

    if (error) {
      console.error("[syncCaptacionContacts photo]", error);
      return;
    }
    await removeContactPhoto(db, previousStoragePath);
  })().catch((err) => console.error("[syncCaptacionContacts photo bg]", err));
}

/** Quita la foto sincronizada y su copia del bucket. */
async function clearPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  contactId: string,
  storagePath: string | null
): Promise<void> {
  await db
    .from("captacion_contacts")
    .update({
      photo_url: null,
      photo_storage_path: null,
      photo_source_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);
  await removeContactPhoto(db, storagePath);
}

/**
 * Contacto principal (dueño) de una captación, para reflejarlo también en los
 * campos planos `owner_name` / `owner_phone` de la ficha.
 */
export function pickOwnerContact(contacts: ContactInput[]): ContactInput | null {
  return contacts.find((c) => c.contact_type === "owner") ?? contacts[0] ?? null;
}
