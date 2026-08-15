import { NextRequest, NextResponse } from "next/server";
import { insertPageView } from "@/lib/db/queries/analytics";

// POST /api/tracking/page-view
// Registra una nueva visita de página desde el cliente.
// Sin autenticación — visitantes públicos lo llaman.
// El body puede venir en camelCase (del tracker del cliente) o snake_case.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      // camelCase (tracker cliente)
      pageType?: string;
      propertyId?: string | null;
      shareId?: string | null;
      collectionShareId?: string | null;
      sessionId?: string;
      pagePath?: string;
      referrer?: string | null;
      // snake_case (legacy / admin)
      page_type?: string;
      property_id?: string | null;
      share_id?: string | null;
      collection_share_id?: string | null;
      session_id?: string;
      page_path?: string;
      device_type?: string | null;
      browser?: string | null;
      os?: string | null;
      country_code?: string | null;
      country_name?: string | null;
      city?: string | null;
    };

    const pageType = body.pageType ?? body.page_type;
    const pagePath = body.pagePath ?? body.page_path;
    const sessionId = body.sessionId ?? body.session_id;

    if (!pageType || !pagePath || !sessionId) {
      return NextResponse.json(
        { error: "Missing required fields: pageType, pagePath, sessionId" },
        { status: 400 },
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const result = await insertPageView({
      collection_share_id:
        body.collectionShareId ?? body.collection_share_id ?? null,
      property_id: body.propertyId ?? body.property_id ?? null,
      share_id: body.shareId ?? body.share_id ?? null,
      page_type: pageType,
      page_path: pagePath,
      session_id: sessionId,
      ip,
      user_agent: userAgent,
      device_type: body.device_type ?? null,
      browser: body.browser ?? null,
      country_code: body.country_code ?? null,
      country_name: body.country_name ?? null,
      city: body.city ?? null,
    } as Parameters<typeof insertPageView>[0]);

    // Devolvemos tanto `id` como `pageViewId` para compatibilidad
    return NextResponse.json({ id: result.id, pageViewId: result.id });
  } catch (err) {
    console.error("[tracking/page-view] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
