import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * Read/write access to the local Zinto CRM cache (migration 0120). This is
 * the CONTRACT between the sync backend (lib/services/zinto-integration/sync.ts,
 * populated from webhooks + backfill) and the UI (app/[country]/(admin)/admin/mensajes/**).
 * Both sides depend only on these shapes — neither depends on the other's
 * internals.
 */

export interface CachedZintoContact {
  zintoContactId: string;
  phone: string | null;
  name: string;
  email: string | null;
  tags: string[];
  archived: boolean;
  customFields: Record<string, unknown>;
  syncedAt: string;
}

export interface CachedZintoNote {
  zintoNoteId: string;
  zintoContactId: string;
  content: string;
  createdById: string | null;
  zintoCreatedAt: string | null;
}

function mapContactRow(row: any): CachedZintoContact {
  return {
    zintoContactId: row.zinto_contact_id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    tags: row.tags ?? [],
    archived: row.archived,
    customFields: row.custom_fields ?? {},
    syncedAt: row.synced_at,
  };
}

function mapNoteRow(row: any): CachedZintoNote {
  return {
    zintoNoteId: row.zinto_note_id,
    zintoContactId: row.zinto_contact_id,
    content: row.content,
    createdById: row.created_by_id,
    zintoCreatedAt: row.zinto_created_at,
  };
}

/** Used by the UI: look up the cached CRM contact for a WhatsApp phone number. */
export async function getCachedZintoContactByPhone(phone: string): Promise<CachedZintoContact | null> {
  const db = createAdminClient() as any;
  const { data } = await db.from("zinto_crm_contacts").select("*").eq("phone", phone).maybeSingle();
  return data ? mapContactRow(data) : null;
}

export async function getCachedZintoContactById(zintoContactId: string): Promise<CachedZintoContact | null> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("zinto_crm_contacts")
    .select("*")
    .eq("zinto_contact_id", zintoContactId)
    .maybeSingle();
  return data ? mapContactRow(data) : null;
}

export async function getCachedZintoNotes(zintoContactId: string): Promise<CachedZintoNote[]> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("zinto_crm_notes")
    .select("*")
    .eq("zinto_contact_id", zintoContactId)
    .order("zinto_created_at", { ascending: false });
  return (data ?? []).map(mapNoteRow);
}

/** Used by the sync backend (webhook handlers + backfill) to upsert one contact. */
export async function upsertCachedZintoContact(contact: {
  zintoContactId: string;
  phone: string | null;
  name: string;
  email: string | null;
  tags: string[];
  archived: boolean;
  customFields: Record<string, unknown>;
  zintoCreatedAt: string | null;
  zintoUpdatedAt: string | null;
}): Promise<void> {
  const db = createAdminClient() as any;
  await db.from("zinto_crm_contacts").upsert(
    {
      zinto_contact_id: contact.zintoContactId,
      phone: contact.phone,
      name: contact.name,
      email: contact.email,
      tags: contact.tags,
      archived: contact.archived,
      custom_fields: contact.customFields,
      zinto_created_at: contact.zintoCreatedAt,
      zinto_updated_at: contact.zintoUpdatedAt,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "zinto_contact_id" }
  );
}

export async function deleteCachedZintoContact(zintoContactId: string): Promise<void> {
  const db = createAdminClient() as any;
  await db.from("zinto_crm_contacts").delete().eq("zinto_contact_id", zintoContactId);
}

export async function upsertCachedZintoNote(note: {
  zintoNoteId: string;
  zintoContactId: string;
  content: string;
  createdById: string | null;
  zintoCreatedAt: string | null;
  zintoUpdatedAt: string | null;
}): Promise<void> {
  const db = createAdminClient() as any;
  await db.from("zinto_crm_notes").upsert(
    {
      zinto_note_id: note.zintoNoteId,
      zinto_contact_id: note.zintoContactId,
      content: note.content,
      created_by_id: note.createdById,
      zinto_created_at: note.zintoCreatedAt,
      zinto_updated_at: note.zintoUpdatedAt,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "zinto_note_id" }
  );
}

export async function deleteCachedZintoNote(zintoNoteId: string): Promise<void> {
  const db = createAdminClient() as any;
  await db.from("zinto_crm_notes").delete().eq("zinto_note_id", zintoNoteId);
}
