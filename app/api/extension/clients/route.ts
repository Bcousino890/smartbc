import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { clientRestriction, hasCollectionsPermission, requireExtension } from "@/lib/extension/guard";
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

/**
 * GET lo usan las extensiones 1.x (token compartido, desde la página del
 * portal). La 2.0 llama con POST desde su service worker: es el único método
 * en el que Chrome manda `Origin: chrome-extension://<id>`, y sin él un token
 * por usuario no se acepta (ver lib/extension/sessions.ts).
 */
export async function POST(request: Request) {
  return GET(request);
}

export async function GET(request: Request) {
  const cors = extensionCorsHeaders(request);
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers: cors });

  const gate = await requireExtension(request, cors);
  if (!gate.ok) return gate.response;
  const user = gate.auth.kind === "user" ? gate.auth.user : null;

  // Con un usuario identificado, la lista es la que vería en el CRM: sus
  // países y, si es agente junior/senior, solo sus clientes. Antes cualquier
  // navegador con el token veía la lista entera.
  if (user) {
    if (clientRestriction(user) === "none" || !(await hasCollectionsPermission(user, "view"))) {
      return json({ error: "Tu usuario no tiene acceso a las fichas de clientes." }, 403);
    }
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

  if (user) {
    query = query.in("country", user.countries);
    if (clientRestriction(user) !== "all") query = query.eq("assigned_advisor_id", user.id);
  }

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
      // Quién está conectado: la extensión lo propone como "quién los llama".
      me: user ? { id: user.id, name: user.fullName || user.email || "Yo" } : null,
    },
    200,
  );
}
