import { NextResponse } from "next/server";

// MercadoLibre notifies this endpoint when:
// - A VIS Lead arrives (contact from buyer)
// - An item status changes (published, paused, closed)
export async function POST(request: Request) {
  try {
    const body = await request.json();

    console.log(`[ml-webhook] Notification: ${JSON.stringify(body).slice(0, 200)}`);

    const { topic, resource, user_id } = body;

    // VIS Lead notification (buyer contacted via portal)
    if (topic === "vis_leads") {
      console.log(`[ml-webhook] VIS Lead received for resource: ${resource}`);
      // TODO: Fetch lead details and store in DB
      // GET https://api.mercadolibre.com/VIS/items/{leadId}
    }

    // Item status change
    if (topic === "items") {
      console.log(`[ml-webhook] Item change: ${resource}`);
      // TODO: Sync status back to properties table
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error(`[ml-webhook] Error: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
