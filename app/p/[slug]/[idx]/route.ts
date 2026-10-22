import { NextResponse } from "next/server";
import { contentRange, parseRangeHeader, unsatisfiedContentRange } from "@/lib/http/range";
import { isPhotoKey, parseFinishParam } from "@/lib/catalogs/photo-selection";
import { renderPhotoVariant } from "@/lib/catalogs/photo-variant";
import { snapPhotoWidth } from "@/lib/catalogs/photo-widths";
import { findPropertyPhoto, photoCandidates } from "@/lib/catalogs/photo-resolve";

// Proxy de fotos de propiedad. Sirve la foto en posición `idx` para la
// propiedad con `slug`, leyéndola desde Supabase Storage en streaming. El
// objetivo es que las URLs que ve el cliente sean neutras
// (`/p/titulo-3291/0.webp`) en lugar de exponer detalles internos como
// `…/properties-photos/synced/level/3415/0.webp` que delatan el portal de
// origen.
//
// Solo devuelve fotos de propiedades NO archivadas. Cache 24h en CDN.
//
// ── Identidad de la foto (`?f=`, BCP-01 E3, N1) ──
// Los catálogos piden cada foto por su clave opaca y estable
// (catalog_photo_key: md5('catalog-photo:' || id), 16 hex), con `?v=` (versión
// del archivo, derivada de su URL) solo para la caché. Con `f` se sirve LA foto
// de esa clave, sin mirar el índice ni el orden; si no existe (borrada o
// reimportada), 404 sin caché: nunca otra foto. Sin `f`, todo es como antes.
// `v` detecta un cambio de URL (realojar), no un archivo sustituido en la misma
// URL: ahí la caché de 24 h puede servir el anterior (límite documentado).
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
// ── Acabado fotográfico (`&t=<versión>`, PR7b) ──
// Con `t` se sirve la variante TRATADA (tono adaptativo por foto,
// lib/catalogs/photo-tone.ts), combinable con `w`. Es una copia: el original
// del almacén nunca se reescribe. La versión de la receta va en la URL (clave
// de la caché del CDN, misma cabecera de 24 h); `X-Bcp-Tone` dice la receta
// aplicada («v1/luminosa») o `fallback` (falló el tratamiento: va la variante
// sin tratar). Solo lo piden los catálogos con el acabado activo y en las
// fotos no excluidas del acabado. Sin `t`, todo es exactamente como antes.
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

// La escala de anchos y la calidad viven en lib/catalogs/photo-widths.ts y el
// reencode en lib/catalogs/photo-variant.ts (PR7a): los comparte la ruta de
// fotos sintéticas de las fixtures, así que la QA y las pruebas ejercitan la
// misma regla que esta ruta.

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

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; idx: string }> },
) {
  const { slug, idx } = await params;
  const search = new URL(req.url).searchParams;
  const width = snapPhotoWidth(search.get("w"));
  const tone = parseFinishParam(search.get("t"));
  const fRaw = search.get("f");
  if (fRaw !== null && !isPhotoKey(fRaw)) {
    return new NextResponse("bad_photo", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const position = Number.parseInt(idx, 10);
  if (!Number.isFinite(position) || position < 0) {
    return new NextResponse("bad_idx", { status: 400 });
  }

  // Qué foto (y si la propiedad está disponible): lo decide photo-resolve.ts,
  // el mismo código que usa el PDF del catálogo. Sin `f`: por posición,
  // deduplicada por URL. Con `f` (catálogos, E3): la foto de esa clave o
  // ninguna. Si no hay foto, 404 (sin caché con `f`) para que el cliente no
  // caiga en un bucle esperando una imagen rota.
  const photo = await findPropertyPhoto(slug, position, fRaw);
  if (photo === "unavailable") {
    return new NextResponse("not_found", { status: 404 });
  }
  if (!photo) {
    return new NextResponse("not_found", { status: 404, headers: fRaw ? { "Cache-Control": "no-store" } : undefined });
  }

  // Si la foto todavía se sirve desde el CDN de Mobilia (aún no se re-alojó en
  // nuestro storage, o la descarga en segundo plano falló), pedimos primero la
  // variante `-original.jpg` (misma foto SIN marca) y caemos a la original si
  // el origen no la tuviera. Para fotos ya re-alojadas esto es un no-op.
  const candidates = photoCandidates(photo.url);

  const rangeHeader = req.headers.get("range");

  for (let i = 0; i < candidates.length; i++) {
    const isLast = i === candidates.length - 1;
    try {
      // Con `Range` hay que conocer el tamaño ANTES de pedir nada: es lo que
      // permite recortar y, de paso, no disparar el fallo del origen.
      if (rangeHeader && !width && !tone) {
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
      if (!width && !tone) {
        // Sin `?w=` ni `t`: se sirve el original en streaming, sin tocar un byte.
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
      // Más pequeña que lo pedido → se devuelve tal cual («original»); si el
      // reencode falla, también («fallback»): una foto grande de más es
      // infinitamente mejor que un hueco roto.
      const v = await renderPhotoVariant(source, width, contentType, { tone });
      return respondBuffer(v.data, v.contentType, cache, rangeHeader, {
        "X-Bcp-Variant": v.variant,
        ...(v.tone ? { "X-Bcp-Tone": v.tone } : {}),
      });
    } catch {
      if (!isLast) continue;
      return new NextResponse("upstream_error", { status: 502 });
    }
  }
  return new NextResponse("upstream_error", { status: 502 });
}
