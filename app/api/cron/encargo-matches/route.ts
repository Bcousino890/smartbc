import { cronAuthorized } from "@/lib/auth/cron-secret";
import "server-only";
import { runEncargoMatching } from "@/lib/encargos/runner";

// Detección de encargos (España): evalúa lo nuevo de propiedades y particulares contra cada encargo
// activo y avisa al asesor y a los administradores con UN aviso por encargo y pasada.
// `?dry=1` calcula el informe sin escribir nada (ni filas, ni avisos, ni la marca).
//
// Añadir al crontab del VPS, cada 5 minutos:
//   */5 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3000/api/cron/encargo-matches

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("Authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const report = await runEncargoMatching({ dryRun: dry });
    return Response.json(report, { status: report.ok ? 200 : 500 });
  } catch (e) {
    console.error("[encargo-matches]", e);
    return Response.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
