import { NextResponse } from "next/server";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

// SOLO DESARROLLO LOCAL (BCP-01 T11, E7): foto sintética (SVG) del almacén de
// prueba, en lugar del proxy real /p/. 404 fuera de ese modo.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; idx: string }> }) {
  if (!isCatalogFixtureMode()) return new NextResponse("not_found", { status: 404 });
  const { slug, idx } = await params;
  const { fixturePhotoSvg } = await import("@/lib/catalogs/fixture-store");
  const svg = await fixturePhotoSvg(decodeURIComponent(slug), Number.parseInt(idx, 10));
  if (!svg) return new NextResponse("not_found", { status: 404 });
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" } });
}
