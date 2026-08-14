import { NextRequest, NextResponse } from "next/server";
import { getZintoIntegrationConfig } from "@/lib/services/zinto-integration/config";
import { verifyZintoSignature, parseZintoWebhookEvent } from "@/lib/services/zinto-integration/webhook";
import { recordZintoIntegrationEvent, markZintoIntegrationEventProcessed } from "@/lib/db/zinto-integration";
import type { WebhookEvent } from "@/lib/services/zinto-integration/types";
import { ZintoIntegrationApiClient } from "@/lib/services/zinto-integration/client";
import { syncContactFromApi } from "@/lib/services/zinto-integration/sync";
import {
  deleteCachedZintoContact,
  deleteCachedZintoNote,
  upsertCachedZintoNote,
} from "@/lib/db/zinto-crm-cache";

/**
 * Receiver for the NEW Zinto Integration API contract
 * (docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md, docs/WEBHOOKS.md).
 *
 * Deliberately a separate route from app/api/webhooks/zinto/route.ts (legacy
 * lead.* / sync.* / WhatsApp-delivery receiver) — different signature format,
 * different event envelope, different dedupe key. Do not merge the two
 * protocols; the legacy route's behavior is untouched.
 *
 * Disabled unless ZINTO_INTEGRATION_API_ENABLED=true (feature flag), so
 * turning this on never silently changes legacy webhook behavior.
 */
export async function POST(req: NextRequest) {
  const config = getZintoIntegrationConfig();
  if (!config?.enabled) {
    return NextResponse.json({ error: { code: "not_found", message: "Not enabled" } }, { status: 404 });
  }

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-zinto-timestamp") || "";
  const signature = req.headers.get("x-zinto-signature") || "";
  const headerEventId = req.headers.get("x-zinto-event-id") || "";

  const verification = verifyZintoSignature(rawBody, timestamp, signature, config.webhookSecret);
  if (!verification.ok) {
    return NextResponse.json(
      { error: { code: "invalid_signature", message: verification.reason ?? "Invalid signature" } },
      { status: 401 }
    );
  }

  const event = parseZintoWebhookEvent(rawBody);
  if (!event) {
    return NextResponse.json({ error: { code: "validation_error", message: "Invalid JSON body" } }, {
      status: 400,
    });
  }

  // Dedupe by event.id per the contract; X-Zinto-Event-Id is kept only as a
  // fallback cross-check when the header and body disagree.
  const eventId = event.id || headerEventId;
  if (!eventId) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Missing event id" } },
      { status: 400 }
    );
  }

  const isNew = await recordZintoIntegrationEvent(eventId, event.type, event.occurred_at, event);
  if (!isNew) {
    // Already applied once — respond 2xx so Zinto stops retrying, but do not reprocess.
    return NextResponse.json({ status: "duplicate_ignored" }, { status: 200 });
  }

  // Save-then-2xx-then-process-later, per docs/WEBHOOKS.md. Processing is
  // deliberately deferred out of the request/response cycle below.
  queueMicrotask(() => {
    processZintoIntegrationEvent(event).catch(async (err) => {
      await markZintoIntegrationEventProcessed(eventId, err instanceof Error ? err.message : String(err));
    });
  });

  return NextResponse.json({ status: "received" }, { status: 200 });
}

/**
 * Placeholder dispatch table. Handlers for contact.* / deal.* / task.* etc. get
 * filled in as SmartBC builds local read models for each entity — until then
 * we persist+dedupe every event (see POST above) without dropping any of
 * them, which is what matters for not losing data during the pilot.
 */
async function processZintoIntegrationEvent(event: WebhookEvent): Promise<void> {
  // Two known multi-event cases are NOT bugs (docs/WEBHOOKS.md "Comportamientos
  // multi-evento"): a single inbound message can emit message.created AND
  // conversation.updated; a multi-tag update can emit contact.updated plus one
  // tag.attached/detached per tag. Handlers must stay idempotent per event.id,
  // never assume 1 CRM operation == 1 event — every handler below is a
  // re-sync/upsert-by-id or a delete-by-id, so being called twice for what
  // was logically one CRM operation is a harmless no-op.
  switch (event.type) {
    case "contact.created":
    case "contact.updated":
    case "tag.attached":
    case "tag.detached": {
      const contactId = extractContactId(event.data);
      if (contactId) {
        const client = ZintoIntegrationApiClient.fromEnv();
        await syncContactFromApi(client, contactId);
      }
      break;
    }
    case "contact.deleted": {
      const contactId = extractContactId(event.data);
      if (contactId) await deleteCachedZintoContact(contactId);
      break;
    }
    case "note.created":
    case "note.updated": {
      const note = extractNote(event.data);
      if (note) {
        await upsertCachedZintoNote({
          zintoNoteId: note.id,
          zintoContactId: note.contact_id,
          content: note.content,
          createdById: note.created_by_id ?? null,
          zintoCreatedAt: note.created_at ?? null,
          zintoUpdatedAt: note.updated_at ?? null,
        });
      } else {
        // Not enough in the payload to build a full Note — re-fetch this
        // contact's notes so the cache stays authoritative.
        const contactId = extractContactId(event.data);
        if (contactId) {
          const client = ZintoIntegrationApiClient.fromEnv();
          await syncContactFromApi(client, contactId);
        }
      }
      break;
    }
    case "note.deleted": {
      const noteId = extractNoteId(event.data);
      if (noteId) await deleteCachedZintoNote(noteId);
      break;
    }
    default:
      // message.created / conversation.updated / deal.* / task.* / pipeline.* /
      // channel.* — out of scope for this task, deliberate no-op.
      break;
  }

  await markZintoIntegrationEventProcessed(event.id);
}

/** Defensive extraction — never assume a shape we haven't verified against the Contact schema. */
function extractContactId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id === "string") return d.id;
  if (typeof d.contact_id === "string") return d.contact_id;
  if (d.contact && typeof d.contact === "object") {
    const contactId = (d.contact as Record<string, unknown>).id;
    if (typeof contactId === "string") return contactId;
  }
  return null;
}

function extractNoteId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id === "string") return d.id;
  if (typeof d.note_id === "string") return d.note_id;
  if (d.note && typeof d.note === "object") {
    const noteId = (d.note as Record<string, unknown>).id;
    if (typeof noteId === "string") return noteId;
  }
  return null;
}

/** Only used when the event payload carries a full Note object matching lib/services/zinto-integration/types.ts. */
function extractNote(data: unknown): {
  id: string;
  contact_id: string;
  content: string;
  created_by_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
} | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id = typeof d.id === "string" ? d.id : null;
  const contactId = typeof d.contact_id === "string" ? d.contact_id : null;
  const content = typeof d.content === "string" ? d.content : null;
  if (!id || !contactId || content === null) return null;
  return {
    id,
    contact_id: contactId,
    content,
    created_by_id: typeof d.created_by_id === "string" ? d.created_by_id : null,
    created_at: typeof d.created_at === "string" ? d.created_at : null,
    updated_at: typeof d.updated_at === "string" ? d.updated_at : null,
  };
}
