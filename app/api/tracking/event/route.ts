import { NextRequest, NextResponse } from "next/server";
import { insertPageEvent } from "@/lib/db/queries/analytics";

// POST /api/tracking/event
// Registra eventos granulares dentro de una visita.
// Acepta tanto un único evento como un array (batch) enviado por sendBeacon.
// Sin autenticación — visitantes públicos lo llaman.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as
      | {
          // Batch (desde analytics.ts sendEvents)
          pageViewId: string;
          events: Array<{ eventType: string; data?: unknown }>;
        }
      | {
          // Individual
          pageViewId: string;
          eventType: string;
          data?: Record<string, unknown>;
        };

    if (!body.pageViewId) {
      return NextResponse.json(
        { error: "Missing required field: pageViewId" },
        { status: 400 },
      );
    }

    // Batch
    if ("events" in body && Array.isArray(body.events)) {
      await Promise.all(
        body.events.map((evt) =>
          insertPageEvent({
            pageViewId: body.pageViewId,
            eventType: evt.eventType,
            data: evt.data as Record<string, unknown> | undefined,
          }).catch(() => {
            /* fire-and-forget individual events */
          }),
        ),
      );
      return NextResponse.json({ ok: true });
    }

    // Individual
    if (!("eventType" in body) || !body.eventType) {
      return NextResponse.json(
        { error: "Missing required field: eventType" },
        { status: 400 },
      );
    }

    await insertPageEvent({
      pageViewId: body.pageViewId,
      eventType: body.eventType,
      data: (body as { data?: Record<string, unknown> }).data,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tracking/event] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
