import { NextResponse } from "next/server";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { renderPhotoVariant } from "@/lib/catalogs/photo-variant";
import { snapPhotoWidth } from "@/lib/catalogs/photo-widths";
import { parseFinishParam } from "@/lib/catalogs/photo-selection";

// SOLO DESARROLLO LOCAL (BCP-01 T11, E7): foto sintética (SVG) del almacén de
// prueba, en lugar del proxy real /p/. 404 fuera de ese modo.
// Con `?w=` (PR7a) sirve la variante por ancho con LA MISMA regla que el proxy
// real (lib/catalogs/photo-variant.ts): WebP reducido y cabecera
// `X-Bcp-Variant`, o el SVG original si no es más ancho que lo pedido. Así la
// QA en Chromium comprueba qué variante carga el lector de verdad.
// Con `t` (PR7b) sirve la variante TRATADA con la misma regla que el proxy
// real (tono adaptativo, `X-Bcp-Tone`), sola o combinada con `w`.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; idx: string }> }) {
  if (!isCatalogFixtureMode()) return new NextResponse("not_found", { status: 404 });
  const { slug, idx } = await params;
  // E3: la misma elección que el proxy real (por clave ?f= si viene).
  const search = new URL(req.url).searchParams;
  const f = search.get("f");
  const width = snapPhotoWidth(search.get("w"));
  const tone = parseFinishParam(search.get("t"));
  const { fixturePhotoSvg } = await import("@/lib/catalogs/fixture-store");
  const svg = await fixturePhotoSvg(decodeURIComponent(slug), Number.parseInt(idx, 10), f);
  if (!svg) return new NextResponse("not_found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const svgType = "image/svg+xml; charset=utf-8";
  if (!width && !tone) return new NextResponse(svg, { headers: { "Content-Type": svgType, "Cache-Control": "no-store" } });
  const v = await renderPhotoVariant(Buffer.from(svg), width, svgType, { tone });
  return new NextResponse(new Uint8Array(v.data), {
    headers: { "Content-Type": v.contentType, "Cache-Control": "no-store", "X-Bcp-Variant": v.variant, ...(v.tone ? { "X-Bcp-Tone": v.tone } : {}) },
  });
}
