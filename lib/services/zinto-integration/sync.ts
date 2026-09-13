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

/**
 * Overlap subtracted from the checkpoint before asking for `updated_since`.
 * docs/PAGINATION.md asks for a small window so an update that landed exactly
 * on the boundary of the previous run isn't skipped; duplicates are harmless
 * because every write below is an upsert keyed by the Zinto id.
 */
const SYNC_OVERLAP_MS = 10 * 60 * 1000;

export interface ReconcileResult {
  synced: number;
  notesSynced: number;
  since: string | null;
  full: boolean;
}

/**
 * Nightly reconcile: the webhook is the fast path, this is the truth. Catches
 * whatever a dropped, duplicated or out-of-order event failed to apply.
 *
 * Differs from `backfillAllContacts()` in the two ways that matter for a job
 * that runs unattended every night:
 *
 *   · It asks for `updated_since` instead of walking the whole collection, so
 *     a quiet night costs one request rather than several hundred.
 *   · It only fetches notes for contacts that actually changed. The backfill
 *     paginates notes PER CONTACT — 713 extra requests against a 300/min
 *     limiter, i.e. the better part of an hour of quota burned to re-read
 *     notes that nobody touched.
 *
 * Falls back to a full walk when there's no checkpoint yet (first run).
 */
export async function reconcileContacts(
  client: ZintoIntegrationApiClient
): Promise<ReconcileResult> {
  const checkpoint = await getSyncCheckpoint("contacts");
  const startedAt = new Date().toISOString();

  const since = checkpoint?.lastSyncedAt
    ? new Date(Date.parse(checkpoint.lastSyncedAt) - SYNC_OVERLAP_MS).toISOString()
    : null;

  let synced = 0;
  let notesSynced = 0;

  for await (const page of client.paginate<Contact>("/api/v1/contacts", {
    updated_since: since ?? undefined,
  })) {
    for (const contact of page.data) {
      await upsertCachedZintoContact(contactToCacheInput(contact));
      await upsertZintoIdMapping("contact", contact.id, null, {});
      synced++;

      for await (const notePage of client.paginate<Note>(
        `/api/v1/contacts/${encodeURIComponent(contact.id)}/notes`
      )) {
        for (const note of notePage.data) {
          await upsertCachedZintoNote(noteToCacheInput(note));
          notesSynced++;
        }
      }
    }

    // Cursor is deliberately NOT persisted here: an incremental run is keyed
    // by time, and a stale cursor from a previous night would make the next
    // run resume mid-collection. Only the timestamp is a valid checkpoint.
    await saveSyncCheckpoint("contacts", null, startedAt);
  }

  // No pages at all (nothing changed) still advances the checkpoint, otherwise
  // the overlap window grows without bound.
  if (synced === 0) {
    await saveSyncCheckpoint("contacts", null, startedAt);
  }

  return { synced, notesSynced, since, full: since === null };
}
