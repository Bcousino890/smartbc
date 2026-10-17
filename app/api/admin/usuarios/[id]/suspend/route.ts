import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import { canSuspendUser, isSuspended, isUserAdminRole } from "@/lib/auth/user-rank";

// Equivale a «para siempre» (100 años) en el formato de duración de GoTrue.
const BAN_FOREVER = "876000h";

/**
 * Suspende o reactiva una cuenta del equipo.
 *
 *   POST { suspended: true, reason?: string }   → suspende
 *   POST { suspended: false }                    → reactiva
 *
 * Suspender impide entrar y operar sin borrar nada (clientes, captaciones y
 * mensajes siguen en su sitio). Se hace en dos sitios a la vez:
 *   1. GoTrue: la cuenta queda baneada, no puede iniciar sesión ni renovar el
 *      token. Se hace PRIMERO: si falla, no se ha cambiado nada.
 *   2. `profiles.suspended_at`: el middleware y getCurrentProfile() cortan la
 *      sesión que siga viva hasta que caduque su token.
 * Solo quien administra esa cuenta, y nunca la propia (lib/auth/user-rank.ts).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  const actor = await getCurrentProfile();
  if (!actor) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!isUserAdminRole(actor.role)) {
    return Response.json(
      { error: "Solo el Propietario y los Administradores pueden suspender cuentas" },
      { status: 403 },
    );
  }

  let body: { suspended?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  if (typeof body.suspended !== "boolean") {
    return Response.json({ error: "Falta indicar si se suspende o se reactiva (suspended: true | false)" }, { status: 400 });
  }
  const wantSuspend = body.suspended;
  const reason =
    wantSuspend && typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: target, error: targetErr } = await db
    .from("profiles")
    .select("id, role, suspended_at")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr && targetErr.code === "42703") {
    return Response.json(
      { error: "Falta aplicar la migración 0210 (suspensión de cuentas) en la base de datos" },
      { status: 503 },
    );
  }
  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (actor.id === target.id) {
    return Response.json({ error: "No puedes suspender tu propia cuenta" }, { status: 400 });
  }
  if (!canSuspendUser({ id: actor.id, role: actor.role }, { id: target.id, role: target.role })) {
    return Response.json(
      { error: "No puedes suspender ni reactivar a un usuario de rango igual o superior al tuyo" },
      { status: 403 },
    );
  }

  // Idempotente: pedir lo que ya está hecho no es un error.
  if (wantSuspend === isSuspended(target)) {
    return Response.json({ ok: true, suspended: wantSuspend, unchanged: true });
  }

  // 1) GoTrue primero: si no responde, la cuenta queda como estaba.
  const { error: banError } = await db.auth.admin.updateUserById(userId, {
    ban_duration: wantSuspend ? BAN_FOREVER : "none",
  });
  if (banError) {
    return Response.json(
      {
        error: `No se pudo ${wantSuspend ? "suspender" : "reactivar"} la cuenta en el servicio de acceso (${banError.message}). No se ha cambiado nada: puedes reintentar.`,
        code: "auth_failed",
      },
      { status: 502 },
    );
  }

  // 2) El perfil.
  const { error: profileError } = await db
    .from("profiles")
    .update(
      wantSuspend
        ? { suspended_at: new Date().toISOString(), suspended_by: actor.id, suspended_reason: reason }
        : { suspended_at: null, suspended_by: null, suspended_reason: null },
    )
    .eq("id", userId);
  if (profileError) {
    // Deshace lo de GoTrue para no dejar la cuenta a medias.
    await db.auth.admin
      .updateUserById(userId, { ban_duration: wantSuspend ? "none" : BAN_FOREVER })
      .catch(() => undefined);
    const missingColumn = profileError.code === "42703";
    return Response.json(
      {
        error: missingColumn
          ? "Falta aplicar la migración 0210 (suspensión de cuentas) en la base de datos"
          : `No se pudo guardar el cambio (${profileError.message}). No se ha cambiado nada: puedes reintentar.`,
        code: missingColumn ? "migration_missing" : "profile_failed",
      },
      { status: missingColumn ? 503 : 500 },
    );
  }

  await logPermissionEvent({
    actorId: actor.id,
    targetUserId: userId,
    eventType: wantSuspend ? "user_suspended" : "user_reactivated",
    newValue: wantSuspend ? { reason } : null,
  });

  return Response.json({ ok: true, suspended: wantSuspend });
}
