import "server-only";
import { requireExtension } from "@/lib/extension/guard";
import { extensionCorsHeaders } from "@/lib/portal-links/extension-cors";

// ============================================================================
// ¿Con quién está conectada esta extensión? Lo pregunta el popup al abrirse
// para enseñar "Conectada como Ana" — y para darse cuenta enseguida si la
// sesión se revocó desde el CRM, en vez de descubrirlo al enviar.
// ============================================================================

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request) });
}

// POST: lo que usa la 2.0 (ver la nota de POST en ../clients/route.ts).
export async function POST(request: Request) {
  return GET(request);
}

export async function GET(request: Request) {
  const cors = extensionCorsHeaders(request);
  const gate = await requireExtension(request, cors);
  if (!gate.ok) return gate.response;

  if (gate.auth.kind === "legacy") {
    return Response.json({ kind: "legacy", user: null }, { headers: cors });
  }
  const u = gate.auth.user;
  return Response.json(
    {
      kind: "user",
      user: { id: u.id, name: u.fullName || u.email || "—", email: u.email, role: u.role, countries: u.countries },
    },
    { headers: cors },
  );
}
