import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { requirePermission } from "@/lib/auth/guard";
import { generateApiKey } from "@/lib/api/keys";
import { API_SCOPES, isApiScope } from "@/lib/api/types";
import { getApiKeysForClient } from "@/lib/db/queries/api-clients";

/**
 * /api/admin/integraciones/clients/{id}/keys
 *
 * Emisión de claves. La clave en claro se devuelve UNA sola vez, en la
 * respuesta del POST: en base de datos solo queda su hash SHA-256. Si el admin
 * la pierde, emite otra y revoca la anterior.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("configuracion", "view");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  return Response.json({ keys: await getApiKeysForClient(id) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("configuracion", "create");
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Cuerpo opcional: sin él se emite una clave con los valores por defecto.
  }

  const scopes = Array.isArray(body.scopes)
    ? (body.scopes as unknown[]).filter((s): s is string => typeof s === "string" && isApiScope(s))
    : [...API_SCOPES];

  if (scopes.length === 0) {
    return Response.json({ error: "Debes indicar al menos un permiso" }, { status: 400 });
  }

  const rateLimit =
    typeof body.rate_limit_per_minute === "number" && body.rate_limit_per_minute > 0
      ? Math.min(Math.floor(body.rate_limit_per_minute), 10_000)
      : 120;

  const generated = generateApiKey(body.environment === "test" ? "test" : "live");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  try {
    const { data: client } = await db
      .from("api_clients")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!client) {
      return Response.json({ error: "La integración no existe" }, { status: 404 });
    }

    const { data, error } = await db
      .from("api_keys")
      .insert({
        client_id: id,
        label: typeof body.label === "string" ? body.label.trim() || null : null,
        key_prefix: generated.prefix,
        key_hash: generated.hash,
        last_four: generated.lastFour,
        scopes,
        rate_limit_per_minute: rateLimit,
        expires_at: typeof body.expires_at === "string" ? body.expires_at : null,
        created_by: gate.profile.id,
      })
      .select("id, client_id, label, key_prefix, last_four, scopes, rate_limit_per_minute, expires_at, created_at")
      .single();

    if (error) throw error;

    return Response.json(
      {
        key: data,
        // Única vez que esto sale del servidor.
        plaintext: generated.plaintext,
        warning: "Guarda esta clave ahora: no se puede volver a mostrar.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[admin integraciones keys create]", err);
    return Response.json({ error: "Error al generar la clave" }, { status: 500 });
  }
}
