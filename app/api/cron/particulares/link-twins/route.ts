import { cronAuthorized } from "@/lib/auth/cron-secret";
import "server-only";
import { runParticularesLinking } from "@/lib/particulares/linking-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Enlaza los anuncios de particulares que son el MISMO inmueble (otro portal,
 * otra operación, otro contacto) — migración 0176, lib/particulares/linking-*.
 *
 *   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "http://localhost:3000/api/cron/particulares/link-twins"          # aplica
 *     "…/link-twins?dry=1"                                              # solo calcula
 *
 * ⚠️ Como el resto de crons, el código no basta: hay que añadir la línea al
 * crontab del VPS (cada 10 min). Ver CLAUDE.md → "Enlace de anuncios…".
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("Authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const summary = await runParticularesLinking({ dryRun });
  return Response.json(summary, { status: summary.ok ? 200 : 500 });
}
