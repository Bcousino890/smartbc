import { NextRequest, NextResponse } from "next/server";
import {
  insertPageView,
  resolveCollectionShareId,
} from "@/lib/db/queries/analytics";
import {
  classifyPropertyRef,
  resolvePageViewProperty,
  normalizeExperienceState,
} from "@/lib/tracking/page-view-contract";
import { createAdminClient } from "@/lib/db/admin";

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
      /** Slug público de la propiedad. Las superficies públicas NUNCA conocen
       *  el UUID (el DTO pone id=slug a propósito): la traducción a
       *  property_id ocurre aquí, con service role — igual que los tokens. */
      propertySlug?: string | null;
      shareId?: string | null;
      /** Estado de experiencia del SmartLink; lista blanca en servidor. */
      experienceState?: string | null;
      collectionToken?: string | null;
      shortlistToken?: string | null;
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

    // El navegador manda el TOKEN público de la colección, nunca el UUID del
    // share: así no hace falta serializar un identificador interno en el HTML.
    // La traducción a share_id ocurre aquí, con service role.
    let collectionShareId: string | null = body.collection_share_id ?? null;
    const collectionToken = body.collectionToken;
    if (!collectionShareId && collectionToken) {
      collectionShareId = await resolveCollectionShareId(collectionToken);
    }

    // Igual que con la colección: llega el TOKEN y aquí se cambia por el id.
    // El token no entra nunca en la tabla de métricas.
    let shortlistId: string | null = null;
    if (body.shortlistToken) {
      const { resolveShortlistByToken } = await import(
        "@/lib/db/queries/client-shortlists"
      );
      shortlistId = (await resolveShortlistByToken(body.shortlistToken))?.id ?? null;
    }

    // Referencia de propiedad: UUID interno (admin/legacy) o slug público.
    // El slug se resuelve aquí; era la CAUSA del 500 que perdía los page
    // views de /compartir y /c: el cliente mandaba el slug en propertyId y
    // Postgres lo rechazaba contra la columna uuid.
    const ref = classifyPropertyRef(body);
    let resolvedFromSlug: string | null = null;
    if (ref.kind === "slug") {
      const db = createAdminClient() as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{ data: { id: string } | null }>;
            };
          };
        };
      };
      const { data } = await db
        .from("properties")
        .select("id")
        .eq("slug", ref.slug)
        .maybeSingle();
      resolvedFromSlug = data?.id ?? null;
    }
    const target = resolvePageViewProperty(ref, resolvedFromSlug);
    if (target.skip) {
      // Slug inexistente: respuesta controlada y SIN fila basura. 200 porque
      // el tracking no debe romper ni hacer reintentar a la página.
      return NextResponse.json({ id: null, pageViewId: null });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const result = await insertPageView({
      collection_share_id: collectionShareId,
      shortlist_id: shortlistId,
      property_id: target.propertyId,
      experience_state: normalizeExperienceState(body.experienceState),
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
