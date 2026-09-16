import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { prepareForIdealista } from "@/lib/services/idealista/brand-watermark";

// Proxy público que sirve una foto/plano de una ficha de Idealista lista para
// el Partner API: con nuestra marca de agua (fotos Y planos) y siempre en
// JPEG (ver la nota en brand-watermark.ts sobre por qué .webp se queda
// "pending_to_process" para siempre). Público a propósito: lo pide el propio
// backend de Idealista al descargar la imagen de la URL que le mandamos en
// `PUT /v1/properties/{id}/images`; no hay sesión de por medio.
//
// Solo sirve URLs que YA están guardadas en la ficha (photo_ids/plan_ids) —
// nunca una URL arbitraria pasada por query string, para no abrir un proxy de
// descarga genérico.

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 20_000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ listingId: string; kind: string; index: string }> }
) {
  const { listingId, kind, index } = await params;
  if (kind !== "photo" && kind !== "plan") {
    return new Response("Not found", { status: 404 });
  }
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return new Response("Not found", { status: 404 });
  }

  const db = createAdminClient() as any;
  const { data: listing } = await db
    .from("idealista_listings")
    .select("photo_ids, plan_ids")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return new Response("Not found", { status: 404 });

  const sourceUrl: string | undefined =
    kind === "photo" ? listing.photo_ids?.[idx] : listing.plan_ids?.[idx];
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(sourceUrl, { cache: "no-store", signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return new Response("Source fetch failed", { status: 502 });

    const rawBuf = Buffer.from(await res.arrayBuffer());
    const jpeg = await prepareForIdealista(rawBuf, { watermark: kind === "photo" });

    return new Response(jpeg, {
      headers: {
        "Content-Type": "image/jpeg",
        // Idealista la pide una vez al publicar; cachear evita reprocesar si
        // reintenta o si "Actualizar estado"/reconciliar vuelve a mandarla.
        "Cache-Control": "public, max-age=3600",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("[idealista-photos] Error procesando imagen:", err);
    return new Response("Processing failed", { status: 502 });
  }
}
