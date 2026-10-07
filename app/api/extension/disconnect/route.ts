import "server-only";
import { requireExtension } from "@/lib/extension/guard";
import { revokeExtensionSession } from "@/lib/extension/sessions";
import { extensionCorsHeaders } from "@/lib/portal-links/extension-cors";

// "Desconectar" en la extensión revoca la sesión EN EL SERVIDOR, no solo borra
// el token del navegador: si alguien lo hubiera copiado, deja de valer igual.

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request) });
}

export async function POST(request: Request) {
  const cors = extensionCorsHeaders(request);
  const gate = await requireExtension(request, cors);
  if (!gate.ok) return gate.response;
  if (gate.auth.kind !== "user") return Response.json({ ok: true }, { headers: cors });

  const res = await revokeExtensionSession(gate.auth.sessionId, gate.auth.user.id, gate.auth.user.id);
  return Response.json(res.ok ? { ok: true } : { ok: false, error: res.error }, { headers: cors });
}
