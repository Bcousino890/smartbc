import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { testIdealistaApiConnection } from "@/lib/services/idealista/api-publisher";
import { recordApiTestResult } from "@/lib/services/idealista/api-config";

export const runtime = "nodejs";
export const maxDuration = 30;

// Prueba real: pide un token OAuth2 y llama a GET /v1/customer/publishinfo.
export async function POST() {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const result = await testIdealistaApiConnection();
  await recordApiTestResult(result.ok);

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, info: result.info });
}
