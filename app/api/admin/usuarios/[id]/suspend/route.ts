import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import { canSuspendUser, isSuspended, isUserAdminRole } from "@/lib/auth/user-rank";

// Equivale a «para siempre» (100 años) en el formato de duración de GoTrue.
const BAN_FOREVER = "876000h";

/**
 * Suspende o reactiva una cuenta.
 *
 *   POST { suspended: true, reason?: string }   → suspende
 *   POST { suspended: false }                    → reactiva
 *
 * Suspender impide entrar y operar sin borrar nada (clientes, captaciones y
 * mensajes siguen en su sitio). Se hace en tres sitios:
 *   1. GoTrue: la cuenta queda baneada, no puede iniciar sesión ni renovar el
 *      token. Va PRIMERO: si falla, no se ha cambiado nada.
 *   2. `profiles.suspended_at`: el middleware, getCurrentProfile() y los helpers
 *      de sesión la dejan fuera.
 *   3. Sus sesiones abiertas se cierran (`revoke_user_sessions`, migración
 *      0211): GoTrue valida la sesión del JWT en cada petición, así que su
 *      sesión deja de valer en el acto en vez de aguantar hasta que caduque.
 *      La API de datos (PostgREST) valida solo la firma del JWT, no la sesión:
 *      ahí puede seguir leyendo/escribiendo lo que sus políticas le permitan
 *      hasta que caduque el token (≤ 1 h).
 * Solo quien administra esa cuenta, y nunca la propia (lib/auth/user-rank.ts).
 *
 * No se corta por «ya está así»: repetir la petición vuelve a aplicar GoTrue y
 * la revocación, que es lo que arregla una cuenta que quedó a medias.
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
  // El motivo solo queda en la auditoría: `profiles` es legible con la clave
  // anónima y no se guardan ahí datos de quién suspende ni por qué.
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
      { error: "Falta aplicar la migración 0211 (suspensión de cuentas) en la base de datos" },
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

  const profileAlreadyThere = wantSuspend === isSuspended(target);

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

  // 2) El perfil (solo si cambia).
  if (!profileAlreadyThere) {
    const { error: profileError } = await db
      .from("profiles")
      .update({ suspended_at: wantSuspend ? new Date().toISOString() : null })
      .eq("id", userId);
    if (profileError) {
      // Deshace lo de GoTrue para no dejar la cuenta a medias. supabase-js no
      // lanza: devuelve el error, y hay que mirarlo.
      const { error: undoError } = await db.auth.admin.updateUserById(userId, {
        ban_duration: wantSuspend ? "none" : BAN_FOREVER,
      });
      const missingColumn = profileError.code === "42703";
      if (undoError) {
        return Response.json(
          {
            error: `Quedó a medias: el perfil no se pudo guardar (${profileError.message}) y tampoco se pudo deshacer el cambio en el servicio de acceso (${undoError.message}). Vuelve a pulsar ${wantSuspend ? "«Suspender»" : "«Reactivar»"} para dejarla consistente.`,
            code: "partial",
          },
          { status: 500 },
        );
      }
      return Response.json(
        {
          error: missingColumn
            ? "Falta aplicar la migración 0211 (suspensión de cuentas) en la base de datos"
            : `No se pudo guardar el cambio (${profileError.message}). No se ha cambiado nada: puedes reintentar.`,
          code: missingColumn ? "migration_missing" : "profile_failed",
        },
        { status: missingColumn ? 503 : 500 },
      );
    }
  }

  // 3) Sesiones abiertas (solo al suspender). Si la función aún no existe, la
  //    suspensión vale igual (GoTrue baneada + perfil) y se avisa.
  let sessionsRevoked: boolean | undefined;
  if (wantSuspend) {
    const { error: revokeError } = await db.rpc("revoke_user_sessions", { p_user_id: userId });
    sessionsRevoked = !revokeError;
    if (revokeError) {
      console.warn("[usuarios/suspend] No se pudieron cerrar sus sesiones:", revokeError.message);
    }
  }

  if (!profileAlreadyThere) {
    await logPermissionEvent({
      actorId: actor.id,
      targetUserId: userId,
      eventType: wantSuspend ? "user_suspended" : "user_reactivated",
      newValue: wantSuspend ? { reason, sessionsRevoked } : null,
    });
  }

  return Response.json({
    ok: true,
    suspended: wantSuspend,
    ...(profileAlreadyThere ? { unchanged: true } : {}),
    ...(sessionsRevoked !== undefined ? { sessionsRevoked } : {}),
  });
}
