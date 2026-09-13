import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { ZintoMappedEntity } from "@/lib/services/zinto-integration/types";
import type { RequestLogger } from "@/lib/services/zinto-integration/client";

/** Upsert the SmartBC ↔ Zinto id mapping for one entity, keyed by (entity_type, zinto_id). */
export async function upsertZintoIdMapping(
  entityType: ZintoMappedEntity,
  zintoId: string,
  smartbcId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const db = createAdminClient() as any;
  await db.from("zinto_integration_id_map").upsert(
    {
      entity_type: entityType,
      zinto_id: zintoId,
      smartbc_id: smartbcId,
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity_type,zinto_id" }
  );
}

export async function getSmartbcIdForZintoId(
  entityType: ZintoMappedEntity,
  zintoId: string
): Promise<string | null> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("zinto_integration_id_map")
    .select("smartbc_id")
    .eq("entity_type", entityType)
    .eq("zinto_id", zintoId)
    .maybeSingle();
  return data?.smartbc_id ?? null;
}

export async function getZintoIdForSmartbcId(
  entityType: ZintoMappedEntity,
  smartbcId: string
): Promise<string | null> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("zinto_integration_id_map")
    .select("zinto_id")
    .eq("entity_type", entityType)
    .eq("smartbc_id", smartbcId)
    .maybeSingle();
  return data?.zinto_id ?? null;
}

// ---- Sync checkpoints ----
export interface SyncCheckpoint {
  resource: string;
  lastCursor: string | null;
  lastSyncedAt: string | null;
}

export async function getSyncCheckpoint(resource: string): Promise<SyncCheckpoint | null> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("zinto_integration_sync_checkpoints")
    .select("resource, last_cursor, last_synced_at")
    .eq("resource", resource)
    .maybeSingle();
  if (!data) return null;
  return { resource: data.resource, lastCursor: data.last_cursor, lastSyncedAt: data.last_synced_at };
}

/** Persist the checkpoint only after a full page has been upserted — never mid-page. */
export async function saveSyncCheckpoint(
  resource: string,
  cursor: string | null,
  syncedAt: string
): Promise<void> {
  const db = createAdminClient() as any;
  await db.from("zinto_integration_sync_checkpoints").upsert(
    {
      resource,
      last_cursor: cursor,
      last_synced_at: syncedAt,
      last_page_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "resource" }
  );
}

// ---- Webhook event dedupe (by event.id, not delivery id) ----

/** Returns true if this is the first time we've seen this event.id (INSERT succeeded). */
export async function recordZintoIntegrationEvent(
  eventId: string,
  eventType: string,
  occurredAt: string | undefined,
  payload: unknown
): Promise<boolean> {
  const db = createAdminClient() as any;
  const { error } = await db.from("zinto_integration_webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt ?? null,
    payload,
  });
  if (error) {
    // 23505 = unique_violation → already recorded, treat as duplicate.
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

export async function markZintoIntegrationEventProcessed(
  eventId: string,
  processingError?: string
): Promise<void> {
  const db = createAdminClient() as any;
  await db
    .from("zinto_integration_webhook_events")
    .update({ processed_at: new Date().toISOString(), processing_error: processingError ?? null })
    .eq("event_id", eventId);
}

// ---- Health-check stats ----
// Read-only counters for app/api/admin/zinto/health. Kept here rather than in
// the service layer so health.ts stays about *interpreting* the numbers.

export interface ZintoIntegrationStats {
  lastEventAt: string | null;
  eventsLast24h: number;
  lastApiCallAt: string | null;
  lastApiCallStatus: number | null;
  cachedContacts: number;
  cacheSyncedAt: string | null;
}

export async function getZintoIntegrationStats(): Promise<ZintoIntegrationStats> {
  const db = createAdminClient() as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [lastEvent, recentEvents, lastCall, contacts] = await Promise.all([
    db
      .from("zinto_integration_webhook_events")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("zinto_integration_webhook_events")
      .select("event_id", { count: "exact", head: true })
      .gte("received_at", since),
    db
      .from("zinto_integration_api_log")
      .select("created_at, status_code")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("zinto_crm_contacts")
      .select("synced_at", { count: "exact" })
      .order("synced_at", { ascending: false })
      .limit(1),
  ]);

  return {
    lastEventAt: lastEvent?.data?.received_at ?? null,
    eventsLast24h: recentEvents?.count ?? 0,
    lastApiCallAt: lastCall?.data?.created_at ?? null,
    lastApiCallStatus: lastCall?.data?.status_code ?? null,
    cachedContacts: contacts?.count ?? 0,
    cacheSyncedAt: contacts?.data?.[0]?.synced_at ?? null,
  };
}

// ---- API call audit log ----
export const logZintoIntegrationRequest: RequestLogger = async (entry) => {
  try {
    const db = createAdminClient() as any;
    await db.from("zinto_integration_api_log").insert({
      method: entry.method,
      path: entry.path,
      status_code: entry.status,
      request_id: entry.requestId ?? null,
      zinto_ids: entry.zintoIds ?? [],
    });
  } catch {
    // Audit logging must never break the calling request.
  }
};
