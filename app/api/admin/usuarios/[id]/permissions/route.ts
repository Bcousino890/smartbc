import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import {
  getEffectivePermissions,
  getEffectiveScopes,
  resolveBaseMatrix,
} from "@/lib/db/queries/permissions";
import { canManageUser, isUserAdminRole } from "@/lib/auth/user-rank";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from "@/lib/permissions";
import {
  SCOPE_LABELS,
  defaultScopes,
  planScopeChanges,
  validateScopeOverrides,
  type ScopeOverride,
  type ScopeOverrideInput,
} from "@/lib/permissions-scope";

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

  // Matriz base: rol personalizado (custom_roles) o rol por país si aplica,
  // si no el rol tal cual — ver resolveBaseMatrix() para el orden de
  // precedencia. Defensivo: si las tablas de la migración 0090 no existen
  // aún en el VPS, equivale a canAccess(role, ...) de siempre.
  const { matrix: roleMatrix, isCustomRole } = await resolveBaseMatrix(
    userId,
    role,
    country ?? undefined,
  );

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
      const roleDefault = roleMatrix[resource][action];
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

  // `roleDefaults` = la matriz base real (rol / rol por país / rol
  // personalizado), SIN overrides. La UI la usa como referencia para el
  // badge "modificado" y para "Restablecer a valores del rol" — si usara
  // canAccess(role,...) en cliente (solo estático) daría una base incorrecta
  // para usuarios con rol personalizado o rol por país.
  // Alcance (Todo / Solo lo suyo) por sección: efectivo (con ?country=) y el
  // del perfil del rol. Defensivo: sin la tabla 0216 equivale a los defaults.
  const { scopes } = await getEffectiveScopes(userId, role, country ?? undefined);
  const scopeDefaults = defaultScopes(role);

  return Response.json({
    role,
    permissions,
    isCustomRole,
    roleDefaults: roleMatrix,
    scopes,
    scopeDefaults,
  });
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

  if (!isUserAdminRole(currentProfile.role)) {
    return Response.json(
      { error: "Solo admins pueden modificar permisos" },
      { status: 403 },
    );
  }

  // Nadie se concede permisos a sí mismo (antes un agent_admin podía darse
  // usuarios.edit, configuracion.edit, reportes.export…).
  if (currentProfile.id === userId) {
    return Response.json(
      { error: "No puedes modificar tus propios permisos" },
      { status: 403 },
    );
  }

  let body: {
    overrides: { resource: string; action: string; allowed: boolean }[];
    country?: "es" | "cl" | null;
    scopeOverrides?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.overrides)) {
    return Response.json({ error: "overrides debe ser un array" }, { status: 400 });
  }

  // Cada excepción debe ser un recurso y una acción que EXISTEN, con un
  // booleano (antes se insertaba cualquier cadena tal cual en la tabla).
  const validResources = new Set<string>(RESOURCES);
  const validActions = new Set<string>(ACTIONS);
  const seen = new Set<string>();
  for (const o of body.overrides) {
    if (
      !o ||
      typeof o.resource !== "string" ||
      typeof o.action !== "string" ||
      typeof o.allowed !== "boolean" ||
      !validResources.has(o.resource) ||
      !validActions.has(o.action)
    ) {
      return Response.json(
        { error: "Excepción inválida: recurso, acción o valor no reconocidos" },
        { status: 400 },
      );
    }
    const key = `${o.resource}.${o.action}`;
    if (seen.has(key)) {
      return Response.json({ error: `Excepción duplicada: ${key}` }, { status: 400 });
    }
    seen.add(key);
  }

  // País del subconjunto a guardar.
  //   null (o ausente) = overrides GLOBALES (comportamiento actual)
  //   'es' | 'cl'      = overrides sólo de ese país
  const country = parseCountryParam(body.country ?? null);

  // Alcance por sección: opcional. Si falta no se tocan sus filas.
  let scopeInput: ScopeOverrideInput[] | null = null;
  if (body.scopeOverrides !== undefined) {
    const v = validateScopeOverrides(body.scopeOverrides);
    if (!v.ok) {
      return Response.json({ error: v.error }, { status: 400 });
    }
    scopeInput = v.value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // La cuenta destino debe existir y ser de rango inferior al del actor.
  const { data: target } = await db
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  if (
    !canManageUser(
      { id: currentProfile.id, role: currentProfile.role },
      { id: target.id, role: target.role },
    )
  ) {
    return Response.json(
      { error: "No puedes modificar los permisos de un usuario de rango igual o superior" },
      { status: 403 },
    );
  }

  // Nadie concede más de lo que él mismo tiene. Solo se comprueban las
  // concesiones NUEVAS: las que ya estaban guardadas (p. ej. dadas por un
  // Propietario) se pueden conservar al volver a guardar el conjunto.
  const granting = body.overrides.filter((o) => o.allowed);
  if (granting.length > 0) {
    let existingQuery = db
      .from("user_permission_overrides")
      .select("resource, action, allowed")
      .eq("user_id", userId);
    existingQuery = country
      ? existingQuery.eq("country", country)
      : existingQuery.is("country", null);
    const { data: existing } = await existingQuery;
    const alreadyGranted = new Set<string>(
      ((existing ?? []) as { resource: string; action: string; allowed: boolean }[])
        .filter((e) => e.allowed)
        .map((e) => `${e.resource}.${e.action}`),
    );
    const actorEffective = await getEffectivePermissions(
      currentProfile.id,
      currentProfile.role,
      country ?? undefined,
    );
    for (const o of granting) {
      if (alreadyGranted.has(`${o.resource}.${o.action}`)) continue;
      const actorHas =
        (actorEffective as Record<string, Record<string, boolean>>)[o.resource]?.[o.action] ?? false;
      if (!actorHas) {
        return Response.json(
          { error: `No puedes conceder ${o.resource}.${o.action}: tú no lo tienes` },
          { status: 403 },
        );
      }
    }
  }

  // Alcance: se calcula y comprueba ANTES de escribir nada (solo lecturas), así
  // un 403/500 no deja guardados los permisos a medias.
  let scopeToStore: ScopeOverrideInput[] = [];
  if (scopeInput !== null) {
    let storedQuery = db
      .from("user_scope_overrides")
      .select("resource, kind, scope, country")
      .eq("user_id", userId);
    storedQuery = country
      ? storedQuery.eq("country", country)
      : storedQuery.is("country", null);
    const { data: storedRows, error: storedErr } = await storedQuery;
    if (storedErr) {
      return Response.json(
        {
          error:
            "No se pudo guardar el alcance por sección: falta aplicar la migración de alcance (user_scope_overrides).",
        },
        { status: 500 },
      );
    }
    const { scopes: actorScopes } = await getEffectiveScopes(
      currentProfile.id,
      currentProfile.role,
      country ?? undefined,
    );
    const plan = planScopeChanges(
      defaultScopes(target.role),
      actorScopes,
      (storedRows ?? []) as ScopeOverride[],
      scopeInput,
    );
    if (plan.escalation) {
      return Response.json(
        {
          error: `No puedes conceder alcance “${SCOPE_LABELS.all}” en ${plan.escalation.resource}: tú no lo tienes`,
        },
        { status: 403 },
      );
    }
    scopeToStore = plan.toStore;
  }

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

  // Alcance por sección (tras los permisos). ORDEN Y NO ATOMICIDAD: las filas de
  // permisos ya están guardadas cuando llegamos aquí. Si el borrado o el insert
  // de alcance falla se responde 500 y, en el peor caso, las excepciones de
  // alcance de este subconjunto vuelven a los defaults del perfil (dirección
  // segura: nunca más amplio). Coherente con el delete+insert no atómico de los
  // permisos de arriba. La validación, la lectura previa y la comprobación de
  // escalada se hicieron antes de escribir nada, para que casi nada falle aquí.
  // Reemplaza el subconjunto del país.
  if (scopeInput !== null) {
    let delScope = db.from("user_scope_overrides").delete().eq("user_id", userId);
    delScope = country ? delScope.eq("country", country) : delScope.is("country", null);
    const { error: delScopeErr } = await delScope;
    if (delScopeErr) {
      return Response.json(
        { error: "No se pudo guardar el alcance por sección: " + delScopeErr.message },
        { status: 500 },
      );
    }
    if (scopeToStore.length > 0) {
      const { error: insScopeErr } = await db.from("user_scope_overrides").insert(
        scopeToStore.map((o) => ({
          user_id: userId,
          resource: o.resource,
          kind: o.kind,
          scope: o.scope,
          country,
          created_by: currentProfile.id,
        })),
      );
      if (insScopeErr) {
        return Response.json(
          { error: "No se pudo guardar el alcance por sección: " + insScopeErr.message },
          { status: 500 },
        );
      }
    }
  }

  // Auditoría (best-effort): registra que se actualizaron los overrides de este
  // usuario, con el país afectado (si vino) y un resumen del conjunto guardado.
  await logPermissionEvent({
    actorId: currentProfile.id,
    targetUserId: userId,
    eventType: "permissions_updated",
    country,
    newValue: {
      country,
      overrideCount: body.overrides.length,
      overrides: body.overrides,
      ...(scopeInput !== null
        ? { scopeOverrideCount: scopeToStore.length, scopeOverrides: scopeToStore }
        : {}),
    },
  });

  return Response.json({ ok: true });
}
