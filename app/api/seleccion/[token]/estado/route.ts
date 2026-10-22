import { NextResponse, type NextRequest } from "next/server";
import { getPublicCatalogState } from "@/lib/catalogs/public-data";
import { stateLimiter } from "@/lib/catalogs/rate-limit";
import { isShareToken } from "@/lib/catalogs/share";

// Estado de un catálogo compartido (BCP-01 T9): lo usa el lector al arrancar
// (a la vez que abre el SSE) y como respaldo cada 500 ms si el SSE calla.
// Valida el acceso en cada llamada. Con ?huella=<la que ya tiene el lector>,
// si no ha cambiado no repite el contenido.
//
// Respuestas: 200 {valid:true, fingerprint, expiresAt, catalog?} ·
// 200 {valid:false} (inexistente, revocado, caducado o archivado: no se dice
// cuál) · 429 por exceso · 503 si la base de datos falla (el lector lo trata
// como «sin verificar», no como «no disponible»).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return NextResponse.json({ valid: false }, { headers: HEADERS });
  if (!stateLimiter.allow(token)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: HEADERS });
  let state;
  try {
    state = await getPublicCatalogState(token, { visit: true });
  } catch (err) {
    console.error("[catalogos] estado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable_backend" }, { status: 503, headers: HEADERS });
  }
  if (!state) return NextResponse.json({ valid: false }, { headers: HEADERS });
  const known = req.nextUrl.searchParams.get("huella");
  return NextResponse.json(
    known && known === state.fingerprint
      ? { valid: true, fingerprint: state.fingerprint, expiresAt: state.expiresAt }
      : { valid: true, fingerprint: state.fingerprint, expiresAt: state.expiresAt, catalog: state.catalog },
    { headers: HEADERS },
  );
}
