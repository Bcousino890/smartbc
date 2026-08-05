import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { saveIdealistaApiConfig } from "@/lib/services/idealista/api-config";

export const runtime = "nodejs";

// Config del Partner API oficial de Idealista (distinto del login por
// Playwright/cookies de /api/admin/idealista/update-login, que sigue igual).
export async function GET() {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("idealista_config")
    .select("client_id, feed_key, sandbox_mode, api_last_test_at, api_last_test_ok")
    .limit(1)
    .single();

  return Response.json({
    clientId: data?.client_id ?? "",
    hasClientSecret: !!data?.client_id, // si hay client_id asumimos que ya se guardó el secret junto con él
    feedKey: data?.feed_key ?? "",
    sandbox: data?.sandbox_mode !== false,
    lastTestAt: data?.api_last_test_at ?? null,
    lastTestOk: data?.api_last_test_ok ?? null,
  });
}

export async function POST(req: Request) {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  let body: { clientId?: string; clientSecret?: string; feedKey?: string; sandbox?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  if (!body.clientId?.trim() || !body.feedKey?.trim()) {
    return Response.json({ error: "clientId y feedKey son requeridos" }, { status: 400 });
  }

  try {
    await saveIdealistaApiConfig({
      clientId: body.clientId.trim(),
      clientSecret: body.clientSecret?.trim() || undefined,
      feedKey: body.feedKey.trim(),
      sandbox: body.sandbox !== false,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[idealista/api/config] save error:", err);
    return Response.json({ error: "Error al guardar la configuración" }, { status: 500 });
  }
}
