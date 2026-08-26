import "server-only";
import { verifyExtensionToken } from "@/lib/services/idealista/extension-token";
import { createAdminClient } from "@/lib/db/admin";
import { extensionCorsHeaders } from "@/lib/portal-links/extension-cors";

// ============================================================================
// Buscador de clientes para la extensión de Chrome.
//
// Sirve al selector "¿a qué ficha van estos pisos?" del panel flotante que la
// extensión pinta sobre el portal. Devuelve lo mínimo para elegir (nombre,
// email, teléfono) — nunca preferencias, notas internas ni actividad.
// ============================================================================

const LIMIT = 20;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request) });
}

/**
 * PostgREST parsea `or=(...)` separando por comas y paréntesis, así que un
 * término con esos caracteres rompería el filtro (o lo cambiaría de sentido).
 * Se limpian junto a los comodines de LIKE.
 */
function sanitizeQuery(raw: string): string {
  return raw.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
}

export async function GET(request: Request) {
  const cors = extensionCorsHeaders(request);
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers: cors });

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !verifyExtensionToken(token)) {
    return json({ error: "Token inválido o caducado" }, 401);
  }

  const q = sanitizeQuery(new URL(request.url).searchParams.get("q") ?? "");

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const admin = createAdminClient() as any;

  let query = admin
    .from("profiles")
    .select("id, full_name, email, phone, country")
    .eq("role", "client")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }

  const [clientsRes, staffRes] = await Promise.all([
    query,
    admin
      .from("profiles")
      .select("id, full_name, email")
      .in("role", [
        "owner",
        "admin",
        "advisor",
        "agent_junior",
        "agent_senior",
        "agent_admin",
      ])
      .order("full_name")
      .limit(50),
  ]);

  if (clientsRes.error) {
    return json({ error: "No se pudo buscar" }, 500);
  }

  type Row = {
    id: string;
    full_name: string | null;
    email: string | null;
    phone?: string | null;
    country?: string | null;
  };

  return json(
    {
      clients: ((clientsRes.data ?? []) as Row[]).map((c) => ({
        id: c.id,
        name: c.full_name || c.email || "Sin nombre",
        email: c.email,
        phone: c.phone ?? null,
        country: c.country ?? "es",
      })),
      staff: ((staffRes.data ?? []) as Row[]).map((s) => ({
        id: s.id,
        name: s.full_name || s.email || "—",
      })),
    },
    200,
  );
}
