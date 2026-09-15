"use server";

import { randomUUID } from "node:crypto";
import { assertPermission } from "@/lib/auth/guard";
import {
  getCachedZintoContactByPhone,
  getCachedZintoNotes,
  upsertCachedZintoNote,
  type CachedZintoContact,
  type CachedZintoNote,
} from "@/lib/db/zinto-crm-cache";
import { normalizePhoneNumber } from "@/lib/phone";
import { getZintoIntegrationConfig, isZintoWriteAllowlisted } from "@/lib/services/zinto-integration/config";
import { ZintoIntegrationApiClient } from "@/lib/services/zinto-integration/client";
import { syncContactFromApi } from "@/lib/services/zinto-integration/sync";
import { ZintoIntegrationApiError } from "@/lib/services/zinto-integration/errors";

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

export type ZintoCrmWriteResult = { ok: true } | { ok: false; error: string };

/**
 * Writes go straight to Zinto via the Integration API — the local cache is
 * refreshed from the response (notes) or via a fresh GET (tags), same as a
 * webhook-driven sync would do. No optimistic-only writes: if the Zinto call
 * fails, nothing changes locally either.
 */
async function getWritableClient(): Promise<
  { client: ZintoIntegrationApiClient } | { error: string }
> {
  await assertPermission("mensajes", "edit");
  const config = getZintoIntegrationConfig();
  if (!config) return { error: "La integración con Zinto no está configurada." };
  if (!isZintoWriteAllowlisted()) {
    return { error: "La escritura hacia Zinto no está habilitada (ZINTO_WRITE_ALLOWLISTED)." };
  }
  return { client: new ZintoIntegrationApiClient(config) };
}

export async function addZintoCrmNote(
  zintoContactId: string,
  content: string
): Promise<ZintoCrmWriteResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "La nota no puede estar vacía." };

  const ready = await getWritableClient();
  if ("error" in ready) return { ok: false, error: ready.error };

  try {
    const { data: note } = await ready.client.createNote(
      zintoContactId,
      { content: trimmed },
      randomUUID()
    );
    await upsertCachedZintoNote({
      zintoNoteId: note.id,
      zintoContactId: note.contact_id,
      content: note.content,
      createdById: note.created_by_id ?? null,
      zintoCreatedAt: note.created_at ?? null,
      zintoUpdatedAt: note.updated_at ?? null,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeZintoError(err) };
  }
}

export async function addZintoCrmTag(zintoContactId: string, tag: string): Promise<ZintoCrmWriteResult> {
  const trimmed = tag.trim();
  if (!trimmed) return { ok: false, error: "El tag no puede estar vacío." };

  const ready = await getWritableClient();
  if ("error" in ready) return { ok: false, error: ready.error };

  try {
    await ready.client.tagContact(zintoContactId, trimmed);
    // tagContact no devuelve el contacto actualizado — resincronizamos desde Zinto.
    await syncContactFromApi(ready.client, zintoContactId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeZintoError(err) };
  }
}

function describeZintoError(err: unknown): string {
  if (err instanceof ZintoIntegrationApiError) return err.message;
  return err instanceof Error ? err.message : "Error inesperado al escribir en Zinto.";
}
