import { cronAuthorized } from "@/lib/auth/cron-secret";
import "server-only";
import { runParticularesEnrich } from "@/lib/particulares/enrich-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hasta ~12 peticiones a Nominatim (≤1/s) + el cálculo: sobra con 2 minutos.
export const maxDuration = 120;

/**
 * Enriquece los anuncios de particulares con lo que dice la descripción (teléfono, dirección exacta,
 * responsable) — migración 0187, lib/particulares/enrich-*.
 *
 *   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "http://localhost:3000/api/cron/particulares/enrich"                  # aplica (solo confianza alta)
 *     "…/enrich?dry=1"                                                      # solo calcula y cuenta
 *     "…/enrich?limit=300&geo=20&index=8000"                                # anuncios por pasada, peticiones a Nominatim, descripciones a indexar
 *
 * La PRIMERA vez indexa las descripciones de toda la tabla (varias pasadas) antes de evaluar nada; el campo
 * `note` del resultado lo dice. Es idempotente: un anuncio no se vuelve a procesar si su descripción no cambia.
 *
 * ⚠️ Como el resto de crons, el código no basta: hay que añadir la línea al crontab del VPS (cada 10 min).
 * Ver CLAUDE.md → "Enriquecer particulares desde la descripción".
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("Authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const num = (k: string): number | undefined => {
    const v = sp.get(k);
    return v !== null && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  const summary = await runParticularesEnrich({
    dryRun: sp.get("dry") === "1",
    limit: num("limit"),
    indexLimit: num("index"),
    maxGeocode: num("geo"),
  });
  return Response.json(summary, { status: summary.ok ? 200 : 500 });
}
