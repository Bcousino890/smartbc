import { NextRequest, NextResponse } from "next/server";
import { getZintoIntegrationConfig } from "@/lib/services/zinto-integration/config";
import { verifyZintoSignature, parseZintoWebhookEvent } from "@/lib/services/zinto-integration/webhook";
import { recordZintoIntegrationEvent, markZintoIntegrationEventProcessed } from "@/lib/db/zinto-integration";
import type { WebhookEvent } from "@/lib/services/zinto-integration/types";

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
  // never assume 1 CRM operation == 1 event.
  await markZintoIntegrationEventProcessed(event.id);
}
