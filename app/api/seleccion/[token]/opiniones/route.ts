import { NextResponse, type NextRequest } from "next/server";
import { feedbackGet, feedbackPost } from "@/lib/catalogs/feedback-route";

// Opiniones de un enlace PERSONAL de catálogo (0218, DC11–DC14). Sin sesión:
// el token identifica la asignación y la base de datos decide cliente,
// catálogo y vivienda. El navegador solo manda la clave pública de la
// vivienda, la valoración y el comentario; cualquier otro campo se ignora.
//
// GET  → 200 {personal, items}  (un enlace general: {personal:false, items:{}})
// POST → 200 {ok:true, status:'saved'|'unchanged', updatedAt}
//        400 invalid_body | invalid_rating | comment_too_long
//        404 not_in_catalog · 410 link_invalid (inexistente, general, revocado,
//        caducado o archivado: no se dice cuál) · 429 · 503 si falla la BD.
// La lógica vive en lib/catalogs/feedback-route.ts (probada sin Next).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await feedbackGet(token);
  return NextResponse.json(r.body, { status: r.status, headers: HEADERS });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await feedbackPost(token, await req.text().catch(() => ""));
  return NextResponse.json(r.body, { status: r.status, headers: HEADERS });
}
