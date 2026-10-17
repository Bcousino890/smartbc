import { cronAuthorized } from "@/lib/auth/cron-secret";
import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { autoReplaceWebPhotos } from "@/lib/particulares/web-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill de fotos limpias: propiedades del CRM ya enlazadas con una web de agencia (Mobilia) leída y verificada
 * cuyas fotos llevan la marca de agua del portal. El job link-twins ya las va cambiando de 3 en 3; esto sirve para
 * ver el alcance y acelerar en lotes pequeños.
 *
 *   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/particulares/web-photos?dry=1"
 *     → cuántas se reemplazarían (y las primeras 50) sin tocar nada
 *   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/particulares/web-photos?limit=20"
 *     → aplica a un lote (≤ 20 por defecto; presupuesto de 4 min)
 *
 * Todo o nada por propiedad, copia en property_photos_backup, ficheros viejos intactos, idempotente por huella.
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("Authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = await autoReplaceWebPhotos(createAdminClient() as any, { dryRun, limit, budgetMs: 240_000 });
  if (!summary) return Response.json({ ok: false, error: "Faltan las migraciones 0199/0203/0205/0206 o la caché de webs" }, { status: 503 });
  return Response.json({ ok: true, dryRun, ...summary });
}
