import "server-only";
import { resolveCountryAccess, type CountryAccessProfile } from "@/lib/auth/country-access";
import { loadTargetProfile, requireUserAdmin } from "@/lib/auth/user-admin";
import {
  canChangeOwnAccess,
  canManageUser,
  checkGrants,
  countryOverrideRows,
  grantableCells,
  parseOverrides,
  type OverrideInput,
} from "@/lib/auth/user-admin-rules";
import { createAdminClient } from "@/lib/db/admin";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import { resolveBaseMatrix } from "@/lib/db/queries/permissions";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getRequestPermissions } from "@/lib/auth/guard";
import {
  applyOverrides,
  applyOverridesForCountry,
  type PermissionOverride,
} from "@/lib/permissions";

/**
 * Permisos de un usuario, SIEMPRE por país (es lo que se usa en el panel: el
 * menú y las APIs evalúan con el país activo — ver lib/auth/guard.ts).
 *
 *   GET  ?country=es|cl → matriz del rol en ese país, efectivo (rol +
 *        excepciones globales + del país), si quien mira puede editarla y qué
 *        celdas puede encender.
 *   POST { country, overrides } → `overrides` es la diferencia deseada contra
 *        la matriz del rol en ese país. El servidor calcula las filas del país
 *        para que el efectivo quede EXACTAMENTE así (anulando, si hace falta,
 *        una excepción global) y las reemplaza.
 *
 * Reglas (lib/auth/user-admin-rules.ts): permiso usuarios.edit, nadie se
 * cambia sus propios permisos, al propietario solo lo toca otro propietario y
 * a un admin solo propietario/admin, y quien no es propietario/admin no puede
 * conceder lo que él mismo no tiene. Antes bastaba con ser agent_admin para
 * darse a sí mismo cualquier permiso.
 */

type Country = "es" | "cl";

function parseCountry(value: unknown): Country | null {
  return value === "es" || value === "cl" ? value : null;
}

/** País sobre el que se trabaja: el pedido si el usuario lo tiene; si no, su país por defecto. */
function targetCountry(target: CountryAccessProfile, requested: Country | null): Country {
  const access = resolveCountryAccess(target);
  if (requested && (access.isOwnerOrAdmin || access.countries.includes(requested))) return requested;
  return access.defaultCountry;
}

async function readOverrides(userId: string): Promise<PermissionOverride[] | { error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient({ timeoutMs: 10_000 }) as any;
  const { data, error } = await db
    .from("user_permission_overrides")
    .select("resource, action, allowed, country")
    .eq("user_id", userId);
  if (error) return { error: error.message };
  return (data ?? []) as PermissionOverride[];
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;

  const actor = await getCurrentProfile().catch(() => null);
  if (!actor) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { permissions: actorPermissions } = await getRequestPermissions(actor);
  const isSelf = actor.id === userId;
  // Cada uno puede ver los suyos; los de otros, quien ve Usuarios.
  if (!isSelf && actorPermissions.usuarios?.view !== true) {
    return Response.json({ error: "Sin acceso" }, { status: 403 });
  }

  const target = await loadTargetProfile(userId);
  if (!target) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });

  const country = targetCountry(target, parseCountry(new URL(req.url).searchParams.get("country")));
  const base = await resolveBaseMatrix(userId, target.role, country);
  const rows = await readOverrides(userId);
  if ("error" in rows) return Response.json({ error: rows.error }, { status: 500 });
  const effective = applyOverridesForCountry(base.effectiveRole, rows, country, base.matrix);

  // ¿Puede editarlos quien mira? Mismo orden de comprobaciones que el POST.
  let reason: string | null = null;
  if (actorPermissions.usuarios?.edit !== true) {
    reason = "Puedes ver estos permisos, pero no cambiarlos.";
  } else {
    const own = canChangeOwnAccess(actor.id, userId);
    const manage = canManageUser({ id: actor.id, role: actor.role }, target);
    if (!own.ok) reason = own.error;
    else if (!manage.ok) reason = manage.error;
  }

  return Response.json({
    role: target.role,
    effectiveRole: base.effectiveRole,
    isCustomRole: base.isCustomRole,
    country,
    roleDefaults: base.matrix,
    effective,
    editable: reason === null,
    reason,
    grantable: grantableCells(actor.role, actorPermissions),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;

  const gate = await requireUserAdmin("edit");
  if (!gate.ok) return gate.response;
  const { actor, actorPermissions } = gate;

  let body: { overrides?: unknown; country?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = parseOverrides(body.overrides);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const own = canChangeOwnAccess(actor.id, userId);
  if (!own.ok) return Response.json({ error: own.error }, { status: 403 });

  const target = await loadTargetProfile(userId);
  if (!target) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  const manage = canManageUser({ id: actor.id, role: actor.role }, target);
  if (!manage.ok) return Response.json({ error: manage.error }, { status: 403 });

  const country = targetCountry(target, parseCountry(body.country));
  const base = await resolveBaseMatrix(userId, target.role, country);
  const rows = await readOverrides(userId);
  if ("error" in rows) return Response.json({ error: rows.error }, { status: 500 });

  const current = applyOverridesForCountry(base.effectiveRole, rows, country, base.matrix);
  const desired = applyOverrides(base.effectiveRole, parsed.overrides, base.matrix);

  const grants = checkGrants({
    desired,
    current,
    grantable: grantableCells(actor.role, actorPermissions),
  });
  if (!grants.ok) return Response.json({ error: grants.error }, { status: 403 });

  const globalOverrides: OverrideInput[] = rows
    .filter((r) => r.country === null || r.country === undefined)
    .map((r) => ({ resource: r.resource, action: r.action, allowed: r.allowed }));
  const previousCountryRows = rows.filter((r) => r.country === country);
  const nextRows = countryOverrideRows({ base: base.matrix, globalOverrides, desired });

  // Reemplazo de las filas de ESTE país (las globales no se tocan: pueden
  // estar sosteniendo el otro país). Si la inserción falla se restauran las
  // anteriores, para no dejar al usuario con sus excepciones borradas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient({ timeoutMs: 10_000 }) as any;
  const { error: deleteErr } = await db
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("country", country);
  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 });

  const toRow = (o: { resource: string; action: string; allowed: boolean }) => ({
    user_id: userId,
    resource: o.resource,
    action: o.action,
    allowed: o.allowed,
    country,
    created_by: actor.id,
  });

  if (nextRows.length > 0) {
    const { error: insertErr } = await db.from("user_permission_overrides").insert(nextRows.map(toRow));
    if (insertErr) {
      if (previousCountryRows.length > 0) {
        await db.from("user_permission_overrides").insert(previousCountryRows.map(toRow));
      }
      return Response.json({ error: insertErr.message }, { status: 500 });
    }
  }

  await logPermissionEvent({
    actorId: actor.id,
    targetUserId: userId,
    eventType: "permissions_updated",
    country,
    oldValue: {
      country,
      overrides: previousCountryRows.map((r) => ({ resource: r.resource, action: r.action, allowed: r.allowed })),
    },
    newValue: { country, overrideCount: nextRows.length, overrides: nextRows },
  });

  return Response.json({ ok: true, country, overrideCount: nextRows.length });
}
