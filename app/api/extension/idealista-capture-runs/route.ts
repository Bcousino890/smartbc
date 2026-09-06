import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { verifyExtensionToken } from "@/lib/services/idealista/extension-token";

// El parte de cada recorrido de "Capturar todas" de la extensión.
//
// Va aparte de la ingesta de leads a propósito: si el envío de leads está
// fallando, este parte tiene que poder llegar igual — es precisamente el que
// cuenta que algo falló. Mismo token Bearer (HMAC) y mismo origen que el resto
// de rutas de la extensión.
const ALLOWED_ORIGIN = "https://www.idealista.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

const asCount = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 100_000) : 0;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!verifyExtensionToken(token)) {
    return Response.json({ error: "No autorizado" }, { status: 401, headers: corsHeaders() });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400, headers: corsHeaders() });
  }

  // Los ids vienen del propio DOM de Idealista; se filtran con la misma forma
  // que valida la ingesta ("12345678" o "call_12345678") para no guardar texto
  // arbitrario en una tabla que después se pinta en el panel.
  const failedIds = Array.isArray(body.failedIds)
    ? body.failedIds
        .filter((x): x is string => typeof x === "string" && /^(call_)?\d+$/.test(x))
        .slice(0, 500)
    : [];

  const stopReason =
    typeof body.stopReason === "string" ? body.stopReason.trim().slice(0, 300) || null : null;
  const startedAt =
    typeof body.startedAt === "string" && !Number.isNaN(Date.parse(body.startedAt))
      ? body.startedAt
      : null;

  const db = createAdminClient();
  const { error } = await (db as never as {
    from: (t: string) => { insert: (r: unknown) => Promise<{ error: { message: string } | null }> };
  })
    .from("idealista_capture_runs")
    .insert({
      sent: asCount(body.sent),
      failed: asCount(body.failed),
      failed_ids: failedIds,
      stop_reason: stopReason,
      started_at: startedAt,
    });

  if (error) {
    console.error("idealista-capture-runs insert error:", error.message);
    return Response.json({ error: "No se pudo guardar" }, { status: 500, headers: corsHeaders() });
  }

  return Response.json({ ok: true }, { headers: corsHeaders() });
}
