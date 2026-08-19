import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { linkStateOf } from "@/lib/client-shortlist/types";

// ============================================================================
// Proxy de la fotografía de un anuncio de portal dentro de un Shortlist.
//
// ⚠️ Por qué existe: esos anuncios todavía no tienen ficha, así que su foto
// vive en el CDN del portal. Servirla tal cual ponía
// `https://img4.idealista.com/...` en el navegador del cliente — es decir,
// le contaba de dónde sale la propiedad. El contrato público prohíbe exponer
// el origen, y una URL de imagen es tan pública como cualquier otro campo.
//
// Hermano de /p/[slug]/[idx], que hace lo mismo con las fotos ya alojadas.
//
// Se resuelve por el ID DEL ITEM, que es lo único que el cliente conoce, y
// solo responde si su selección sigue viva: revocarla o dejarla caducar corta
// también las imágenes.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  if (!itemId || itemId.length > 64) {
    return new NextResponse("bad_id", { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data } = await db
    .from("client_shortlist_items")
    .select(
      `id,
       client_portal_links ( image_url ),
       client_shortlists!inner ( expires_at, revoked_at )`,
    )
    .eq("id", itemId)
    .maybeSingle();

  if (!data) return new NextResponse("not_found", { status: 404 });

  const shortlist = Array.isArray(data.client_shortlists)
    ? data.client_shortlists[0]
    : data.client_shortlists;
  if (!shortlist || linkStateOf(shortlist) !== "active") {
    return new NextResponse("not_found", { status: 404 });
  }

  const link = Array.isArray(data.client_portal_links)
    ? data.client_portal_links[0]
    : data.client_portal_links;
  const url: string | null = link?.image_url ?? null;
  if (!url || !/^https?:\/\//i.test(url)) {
    return new NextResponse("not_found", { status: 404 });
  }

  try {
    const upstream = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      // Sin referrer: el portal no tiene por qué saber quién mira su foto.
      referrerPolicy: "no-referrer",
    });
    if (!upstream.ok || !upstream.body) {
      return new NextResponse("upstream_error", { status: 502 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return new NextResponse("upstream_error", { status: 502 });
  }
}
