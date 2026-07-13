import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  canAccess,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from "@/lib/permissions";

// Resources and actions shown in the permissions matrix.
// Canonical set lives in lib/permissions.ts so canAccess() resolves every cell.
const RESOURCES = PERMISSION_RESOURCES;
const ACTIONS = PERMISSION_ACTIONS;

type PermValue = true | false | "override_true" | "override_false";

// Normaliza el query param `?country=` a 'es' | 'cl' | null (null = todos).
function parseCountryParam(value: string | null): "es" | "cl" | null {
  return value === "es" || value === "cl" ? value : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  const currentProfile = await getCurrentProfile();
  if (!currentProfile) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const callerRole = currentProfile.role as string;
  if (
    callerRole !== "admin" &&
    callerRole !== "owner" &&
    currentProfile.id !== userId
  ) {
    return Response.json({ error: "Sin acceso" }, { status: 403 });
  }

  // País activo opcional. Si viene, devolvemos los overrides de ese país + los
  // globales (country NULL); si no, comportamiento actual (todos).
  const country = parseCountryParam(
    new URL(req.url).searchParams.get("country"),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Fetch target user's role
  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr || !profile) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const role: string = profile.role;

  // Fetch per-user overrides. Si se filtra por país incluimos también la
  // columna `country` para poder aplicar globales + país.
  let overridesQuery = db
    .from("user_permission_overrides")
    .select(country ? "resource, action, allowed, country" : "resource, action, allowed")
    .eq("user_id", userId);

  // Con país: globales (country IS NULL) + los del país indicado.
  if (country) {
    overridesQuery = overridesQuery.or(`country.is.null,country.eq.${country}`);
  }

  const { data: overrides, error: overridesErr } = await overridesQuery;

  if (overridesErr) {
    return Response.json({ error: overridesErr.message }, { status: 500 });
  }

  // Build override lookup: { resource: { action: boolean } }.
  // En modo país, aplicamos primero los globales (country NULL) y luego los del
  // país activo, de modo que los específicos de país ganen sobre los globales.
  const rows = (overrides ?? []) as Array<{
    resource: string;
    action: string;
    allowed: boolean;
    country?: string | null;
  }>;
  const orderedRows = country
    ? [
        ...rows.filter((r) => r.country === null || r.country === undefined),
        ...rows.filter((r) => r.country === country),
      ]
    : rows;

  const overrideMap: Record<string, Record<string, boolean>> = {};
  for (const row of orderedRows) {
    if (!overrideMap[row.resource]) overrideMap[row.resource] = {};
    overrideMap[row.resource][row.action] = row.allowed;
  }

  // Build merged permissions matrix
  const permissions: Record<string, Record<string, PermValue>> = {};
  for (const resource of RESOURCES) {
    permissions[resource] = {};
    for (const action of ACTIONS) {
      const roleDefault = canAccess(role, resource, action);
      const hasOverride =
        overrideMap[resource] !== undefined &&
        overrideMap[resource][action] !== undefined;

      if (hasOverride) {
        const overrideAllowed = overrideMap[resource][action];
        permissions[resource][action] = overrideAllowed
          ? "override_true"
          : "override_false";
      } else {
        permissions[resource][action] = roleDefault;
      }
    }
  }

  return Response.json({ role, permissions });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  const currentProfile = await getCurrentProfile();
  if (!currentProfile) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const callerRole = currentProfile.role as string;
  if (!["owner", "admin", "agent_admin"].includes(callerRole)) {
    return Response.json(
      { error: "Solo admins pueden modificar permisos" },
      { status: 403 },
    );
  }

  let body: {
    overrides: { resource: string; action: string; allowed: boolean }[];
    country?: "es" | "cl" | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.overrides)) {
    return Response.json({ error: "overrides debe ser un array" }, { status: 400 });
  }

  // País del subconjunto a guardar.
  //   null (o ausente) = overrides GLOBALES (comportamiento actual)
  //   'es' | 'cl'      = overrides sólo de ese país
  const country = parseCountryParam(body.country ?? null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Borra sólo el subconjunto del país indicado. `.is`/`.eq` en la columna
  // `country` implementa el "IS NOT DISTINCT FROM" del valor recibido:
  //   - country NULL → borra sólo las filas globales (country IS NULL)
  //   - country 'es' → borra sólo las filas de 'es'
  let deleteQuery = db
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", userId);
  deleteQuery = country
    ? deleteQuery.eq("country", country)
    : deleteQuery.is("country", null);

  const { error: deleteErr } = await deleteQuery;

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 });
  }

  // Insert new overrides (if any), etiquetando cada fila con el país del subset.
  if (body.overrides.length > 0) {
    const rows = body.overrides.map((o) => ({
      user_id: userId,
      resource: o.resource,
      action: o.action,
      allowed: o.allowed,
      country,
      created_by: currentProfile.id,
    }));

    const { error: insertErr } = await db
      .from("user_permission_overrides")
      .insert(rows);

    if (insertErr) {
      return Response.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
