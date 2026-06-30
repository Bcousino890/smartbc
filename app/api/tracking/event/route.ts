import { NextRequest, NextResponse } from "next/server";
import { insertPageEvent } from "@/lib/db/queries/analytics";

// POST /api/tracking/event
// Registra un evento granular dentro de una visita.
// Sin autenticación — visitantes públicos lo llaman.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pageViewId: string;
      eventType: string;
      data?: Record<string, unknown>;
    };

    if (!body.pageViewId || !body.eventType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    await insertPageEvent({
      pageViewId: body.pageViewId,
      eventType: body.eventType,
      data: body.data,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tracking/event] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
