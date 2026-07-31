import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { requirePermission } from "@/lib/auth/guard";
import { getApiClients } from "@/lib/db/queries/api-clients";
import { API_SCOPES, isApiScope } from "@/lib/api/types";

/**
 * /api/admin/integraciones/clients
 *
 * Alta y listado de sistemas externos autorizados a escribir en SmartBC.
 * Gestionar integraciones es configuración del sistema, así que va bajo el
 * permiso `configuracion` (owner/admin).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requirePermission("configuracion", "view");
  if (!gate.ok) return gate.response;

  const country = new URL(req.url).searchParams.get("country") ?? undefined;
  const clients = await getApiClients(country);
  return Response.json({ clients });
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(req: Request) {
  const gate = await requirePermission("configuracion", "create");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const country = body.country === "es" ? "es" : "cl";
  const slug = slugify(typeof body.slug === "string" && body.slug ? body.slug : name);
  if (!slug) {
    return Response.json({ error: "No se pudo generar un identificador válido" }, { status: 400 });
  }

  // Quién firma las captaciones que entren por esta integración. Por defecto,
  // quien la crea: captaciones.created_by es NOT NULL y necesita un usuario real.
  const defaultCreatedBy =
    typeof body.default_created_by === "string" && body.default_created_by
      ? body.default_created_by
      : gate.profile.id;

  const scopes = Array.isArray(body.scopes)
    ? (body.scopes as unknown[]).filter((s): s is string => typeof s === "string" && isApiScope(s))
    : [...API_SCOPES];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  try {
    const { data, error } = await db
      .from("api_clients")
      .insert({
        name,
        slug,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        country,
        contact_email:
          typeof body.contact_email === "string" ? body.contact_email.trim() || null : null,
        default_created_by: defaultCreatedBy,
        default_pipeline_id:
          typeof body.default_pipeline_id === "string" ? body.default_pipeline_id : null,
        default_assigned_to:
          typeof body.default_assigned_to === "string" ? body.default_assigned_to : null,
        auto_distribute: body.auto_distribute !== false,
        overwrite_manual_fields: body.overwrite_manual_fields === true,
        match_by_source_url: body.match_by_source_url !== false,
        created_by: gate.profile.id,
      })
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return Response.json(
          { error: `Ya existe una integración con el identificador "${slug}"` },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json({ client: data, scopes }, { status: 201 });
  } catch (err) {
    console.error("[admin integraciones create]", err);
    return Response.json({ error: "Error al crear la integración" }, { status: 500 });
  }
}
