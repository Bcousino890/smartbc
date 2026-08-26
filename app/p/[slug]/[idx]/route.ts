import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { isMobiliaImageUrl, toMobiliaOriginal } from "@/lib/sync/scrapers/mobilia";
import { contentRange, parseRangeHeader, unsatisfiedContentRange } from "@/lib/http/range";

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
//
// ── `Range` ──
// El storage de origen lo maneja mal y lo pagábamos nosotros: con un fichero
// de 60.720 bytes, `bytes=0-60719` responde 206 en 270ms, pero `bytes=0-60720`
// —un byte más allá del final— deja la conexión colgada hasta el timeout, y un
// `start` posterior al final o un rango sufijo devuelven 500. Pedir de más es
// legal y normal en un cliente; la respuesta correcta es recortar.
//
// Así que aquí se resuelve el rango contra el TAMAÑO REAL (una petición HEAD
// barata) y aguas arriba solo se pide lo que ya se sabe satisfacible. Nunca se
// reenvía el rango del cliente tal cual.

export const runtime = "nodejs";

/** Anchos servibles. Cubre móvil (dpr 2-3), portátil, 1440@2x y 2560. */
const WIDTHS = [640, 828, 1080, 1200, 1280, 1600, 1920, 2560, 3200] as const;
/**
 * Calidad del reencode. Alta a propósito en los tamaños que se miran de
 * cerca; algo menor en los enormes, donde el ojo no distingue y el peso se
 * dispara: la misma foto pasa de 314KB a 834KB entre 1920 y 3200 px, y un
 * hero de 800KB estropea el LCP mucho más de lo que aporta el detalle.
 */
function qualityFor(width: number): number {
  return width > 2048 ? 78 : 86;
}

/**
 * Respuesta para un cuerpo que hemos generado nosotros (las variantes `?w=`).
 * Como el buffer ya está en memoria, el rango se sirve exacto sin volver al
 * origen. Mismo contrato HTTP que el camino de la foto original.
 */
function respondBuffer(
  buf: Buffer,
  contentType: string,
  cache: string,
  rangeHeader: string | null,
  extra: Record<string, string> = {},
): NextResponse {
  const base = {
    "Content-Type": contentType,
    "Cache-Control": cache,
    "Accept-Ranges": "bytes",
    ...extra,
  };
  const parsed = parseRangeHeader(rangeHeader, buf.length);
  if (parsed.kind === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": unsatisfiedContentRange(buf.length), "Accept-Ranges": "bytes" },
    });
  }
  if (parsed.kind === "satisfiable") {
    const slice = buf.subarray(parsed.start, parsed.end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...base,
        "Content-Length": String(slice.length),
        "Content-Range": contentRange(parsed.start, parsed.end, buf.length),
      },
    });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: { ...base, "Content-Length": String(buf.length) },
  });
}

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

  const rangeHeader = req.headers.get("range");

  for (let i = 0; i < candidates.length; i++) {
    const isLast = i === candidates.length - 1;
    try {
      // Con `Range` hay que conocer el tamaño ANTES de pedir nada: es lo que
      // permite recortar y, de paso, no disparar el fallo del origen.
      if (rangeHeader && !width) {
        const head = await fetch(candidates[i], {
          method: "HEAD",
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        const size = Number(head.headers.get("content-length") ?? 0);
        const type = head.headers.get("content-type") ?? "image/webp";
        if (head.ok && Number.isFinite(size) && size > 0) {
          const parsed = parseRangeHeader(rangeHeader, size);
          if (parsed.kind === "unsatisfiable") {
            return new NextResponse(null, {
              status: 416,
              headers: {
                "Content-Range": unsatisfiedContentRange(size),
                "Accept-Ranges": "bytes",
              },
            });
          }
          if (parsed.kind === "satisfiable") {
            // El rango ya está recortado: esta petición SÍ la sirve el origen.
            const partial = await fetch(candidates[i], {
              headers: { Range: `bytes=${parsed.start}-${parsed.end}` },
              cache: "no-store",
              signal: AbortSignal.timeout(10_000),
            });
            if (!partial.ok || !partial.body) {
              if (!isLast) continue;
              return new NextResponse("upstream_error", { status: 502 });
            }
            return new NextResponse(partial.body, {
              status: 206,
              headers: {
                "Content-Type": type,
                "Content-Length": String(parsed.end - parsed.start + 1),
                "Content-Range": contentRange(parsed.start, parsed.end, size),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=86400, s-maxage=86400",
              },
            });
          }
          // "none" o "ignored": sigue el camino normal y se responde entera.
        }
      }

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
        const length = upstream.headers.get("content-length");
        return new NextResponse(upstream.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": cache,
            "Accept-Ranges": "bytes",
            ...(length ? { "Content-Length": length } : {}),
          },
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
          return respondBuffer(source, contentType, cache, rangeHeader, { "X-Bcp-Variant": "original" });
        }
        const out = await image
          .resize({ width, withoutEnlargement: true, fit: "inside" })
          .webp({ quality: qualityFor(width) })
          .toBuffer();
        return respondBuffer(out, "image/webp", cache, rangeHeader, { "X-Bcp-Variant": `w${width}` });
      } catch {
        // Si el reencode falla por lo que sea, manda el original: una foto
        // grande de más es infinitamente mejor que un hueco roto.
        return respondBuffer(source, contentType, cache, rangeHeader, { "X-Bcp-Variant": "fallback" });
      }
    } catch {
      if (!isLast) continue;
      return new NextResponse("upstream_error", { status: 502 });
    }
  }
  return new NextResponse("upstream_error", { status: 502 });
}
