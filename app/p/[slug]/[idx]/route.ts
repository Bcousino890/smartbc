import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { isMobiliaImageUrl, toMobiliaOriginal } from "@/lib/sync/scrapers/mobilia";

// Proxy de fotos de propiedad. Sirve la foto en posición `idx` para la
// propiedad con `slug`, leyéndola desde Supabase Storage en streaming. El
// objetivo es que las URLs que ve el cliente sean neutras
// (`/p/titulo-3291/0.webp`) en lugar de exponer detalles internos como
// `…/properties-photos/synced/level/3415/0.webp` que delatan el portal de
// origen.
//
// Solo devuelve fotos de propiedades NO archivadas. Cache 24h en CDN.
//
// ── Variantes por ancho (`?w=`) ──
// Históricamente esto servía SIEMPRE el fichero original tal cual: ni
// redimensionaba ni recomprimía. Eso está bien para no perder calidad, pero
// dejaba al hero sin `srcset`, así que en una pantalla retina el navegador
// recibía 1600px para un hueco que pide 2880 y la fotografía se veía blanda.
//
// Con `?w=N` se sirve una variante reducida. Reglas:
//   · NUNCA se amplía: si el original es más pequeño que N, se manda el
//     original intacto (no hay milagros artificiales);
//   · el ancho pedido se ajusta a una escala fija, para no abrir un abanico
//     infinito de variantes que no cachearía nadie;
//   · calidad 86 en WebP: el hero es la imagen más importante de la página y
//     ahorrar 150KB destrozando una fotografía premium es mal negocio.
// Sin `?w=` el comportamiento es exactamente el de antes.

export const runtime = "nodejs";

/** Anchos servibles. Cubre móvil (dpr 2-3), portátil, 1440@2x y 2560. */
const WIDTHS = [640, 828, 1080, 1200, 1280, 1600, 1920, 2560, 3200] as const;
/** Calidad del reencode. Alta a propósito: es la foto principal. */
const QUALITY = 86;

function snapWidth(raw: string | null): number | null {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return WIDTHS.find((w) => w >= n) ?? WIDTHS[WIDTHS.length - 1];
}
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type PhotoRow = {
  url: string;
  position: number;
  is_cover: boolean;
};

type PropertyRow = {
  id: string;
  archived_at: string | null;
  status: string;
  property_photos: PhotoRow[] | null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; idx: string }> },
) {
  const { slug, idx } = await params;
  const width = snapWidth(new URL(req.url).searchParams.get("w"));
  const position = Number.parseInt(idx, 10);
  if (!Number.isFinite(position) || position < 0) {
    return new NextResponse("bad_idx", { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("properties")
    .select("id, archived_at, status, property_photos(url, position, is_cover)")
    .eq("slug", slug)
    .maybeSingle();

  const row = data as unknown as PropertyRow | null;
  if (!row || row.archived_at || row.status === "archived") {
    return new NextResponse("not_found", { status: 404 });
  }

  // Ordenamos por posición y elegimos la foto del índice solicitado. Si la
  // posición concreta no existe (porque se borró una foto), devolvemos 404
  // para que el cliente no caiga en un loop esperando una imagen rota.
  // Deduplicamos por url (igual que el adapter de la galería): si hay filas
  // duplicadas en property_photos, los índices del proxy deben casar con los que
  // ve el cliente, no contar la foto repetida.
  const seenUrls = new Set<string>();
  const photos = (row.property_photos ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((p) => {
      if (seenUrls.has(p.url)) return false;
      seenUrls.add(p.url);
      return true;
    });
  const photo = photos[position];
  if (!photo) {
    return new NextResponse("not_found", { status: 404 });
  }

  // Si la foto todavía se sirve desde el CDN de Mobilia (aún no se re-alojó en
  // nuestro storage, o la descarga en segundo plano falló), pedimos primero la
  // variante `-original.jpg` (misma foto SIN marca) y caemos a la original si
  // el origen no la tuviera. Para fotos ya re-alojadas esto es un no-op.
  const candidates = isMobiliaImageUrl(photo.url)
    ? [toMobiliaOriginal(photo.url), photo.url]
    : [photo.url];

  for (let i = 0; i < candidates.length; i++) {
    const isLast = i === candidates.length - 1;
    try {
      const upstream = await fetch(candidates[i], {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok || !upstream.body) {
        if (!isLast) continue;
        return new NextResponse("upstream_error", { status: 502 });
      }
      const contentType = upstream.headers.get("content-type") ?? "image/webp";
      const cache = "public, max-age=86400, s-maxage=86400";
      if (!width) {
        // Sin `?w=`: se sirve el original en streaming, sin tocar un byte.
        return new NextResponse(upstream.body, {
          headers: { "Content-Type": contentType, "Cache-Control": cache },
        });
      }
      const source = Buffer.from(await upstream.arrayBuffer());
      try {
        const sharp = (await import("sharp")).default;
        const image = sharp(source, { failOn: "none" });
        const meta = await image.metadata();
        // Más pequeña que lo pedido → se devuelve tal cual. Ampliar aquí solo
        // añadiría peso y no un solo detalle real.
        if (!meta.width || meta.width <= width) {
          return new NextResponse(new Uint8Array(source), {
            headers: { "Content-Type": contentType, "Cache-Control": cache, "X-Bcp-Variant": "original" },
          });
        }
        const out = await image
          .resize({ width, withoutEnlargement: true, fit: "inside" })
          .webp({ quality: QUALITY })
          .toBuffer();
        return new NextResponse(new Uint8Array(out), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": cache,
            "X-Bcp-Variant": `w${width}`,
          },
        });
      } catch {
        // Si el reencode falla por lo que sea, manda el original: una foto
        // grande de más es infinitamente mejor que un hueco roto.
        return new NextResponse(new Uint8Array(source), {
          headers: { "Content-Type": contentType, "Cache-Control": cache, "X-Bcp-Variant": "fallback" },
        });
      }
    } catch {
      if (!isLast) continue;
      return new NextResponse("upstream_error", { status: 502 });
    }
  }
  return new NextResponse("upstream_error", { status: 502 });
}
