import "server-only";
import type { ZintoIntegrationApiClient } from "./client";
import type { Contact, Note } from "./types";
import {
  upsertCachedZintoContact,
  upsertCachedZintoNote,
} from "@/lib/db/zinto-crm-cache";
import { upsertZintoIdMapping, getSyncCheckpoint, saveSyncCheckpoint } from "@/lib/db/zinto-integration";

/**
 * Sync backend for the local CRM cache (lib/db/zinto-crm-cache.ts). Populated
 * from webhooks (app/api/webhooks/zinto-integration/route.ts) and from the
 * manual backfill (scripts/zinto-crm-backfill.mts). CRM-only cache — there's
 * no local contact model yet, so `smartbc_id` in the id-mapping table stays
 * null here on purpose.
 */

function contactToCacheInput(contact: Contact) {
  return {
    zintoContactId: contact.id,
    phone: contact.phone ?? null,
    name: contact.name,
    email: contact.email ?? null,
    tags: contact.tags ?? [],
    archived: contact.archived,
    customFields: contact.custom_fields ?? {},
    zintoCreatedAt: contact.created_at ?? null,
    zintoUpdatedAt: contact.updated_at ?? null,
  };
}

function noteToCacheInput(note: Note) {
  return {
    zintoNoteId: note.id,
    zintoContactId: note.contact_id,
    content: note.content,
    createdById: note.created_by_id ?? null,
    zintoCreatedAt: note.created_at ?? null,
    zintoUpdatedAt: note.updated_at ?? null,
  };
}

/** Fetches one contact + all of its notes from the API and upserts both into the cache. */
export async function syncContactFromApi(
  client: ZintoIntegrationApiClient,
  zintoContactId: string
): Promise<void> {
  const { data: contact } = await client.getContact(zintoContactId);
  await upsertCachedZintoContact(contactToCacheInput(contact));
  await upsertZintoIdMapping("contact", zintoContactId, null, {});

  for await (const page of client.paginate<Note>(
    `/api/v1/contacts/${encodeURIComponent(zintoContactId)}/notes`
  )) {
    for (const note of page.data) {
      await upsertCachedZintoNote(noteToCacheInput(note));
    }
  }
}

/**
 * Full backfill of every contact (and their notes) from the Integration API
 * into the local cache. Checkpoint persisted only after a full page has been
 * upserted end-to-end (contacts + their notes), never mid-page, per
 * docs/PAGINATION.md.
 */
export async function backfillAllContacts(
  client: ZintoIntegrationApiClient
): Promise<{ synced: number }> {
  const checkpoint = await getSyncCheckpoint("contacts");
  let synced = 0;

  for await (const page of client.paginate<Contact>("/api/v1/contacts", {
    cursor: checkpoint?.lastCursor ?? undefined,
  })) {
    for (const contact of page.data) {
      await upsertCachedZintoContact(contactToCacheInput(contact));
      await upsertZintoIdMapping("contact", contact.id, null, {});

      for await (const notePage of client.paginate<Note>(
        `/api/v1/contacts/${encodeURIComponent(contact.id)}/notes`
      )) {
        for (const note of notePage.data) {
          await upsertCachedZintoNote(noteToCacheInput(note));
        }
      }

      synced++;
    }

    // Full page (contacts + their notes) upserted — safe to persist checkpoint now.
    await saveSyncCheckpoint(
      "contacts",
      page.meta.has_more ? page.meta.next_cursor : null,
      new Date().toISOString()
    );
  }

  return { synced };
}
