import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import {
  createPasswordResetToken,
  sendPasswordResetEmail,
} from "@/lib/email/password-reset";
import { canResetPassword, isUserAdminRole } from "@/lib/auth/user-rank";

// Un solo enlace por cuenta y minuto: sin freno, pulsar el botón varias veces
// (o un script) llenaría de correos la bandeja de la persona.
const COOLDOWN_MS = 60_000;

/**
 * Envía un enlace para que la PERSONA elija su contraseña nueva.
 *
 * Nadie fija la contraseña de otra cuenta, ni el Propietario: el enlace llega
 * al correo de esa cuenta, caduca a las 24 h y no se devuelve en la respuesta
 * ni se guarda en la auditoría (quien lo pide no puede usarlo para entrar como
 * ella). Solo lo envía quien administra esa cuenta (lib/auth/user-rank.ts).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  const actor = await getCurrentProfile();
  if (!actor) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!isUserAdminRole(actor.role)) {
    return Response.json(
      { error: "Solo el Propietario y los Administradores pueden restablecer contraseñas" },
      { status: 403 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: target } = await db
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (actor.id === target.id) {
    return Response.json(
      { error: "Para cambiar tu propia contraseña usa el campo de tu perfil o «Olvidé mi contraseña»" },
      { status: 400 },
    );
  }
  if (!canResetPassword({ id: actor.id, role: actor.role }, { id: target.id, role: target.role })) {
    return Response.json(
      { error: "No puedes restablecer la contraseña de un usuario de rango igual o superior al tuyo" },
      { status: 403 },
    );
  }
  // Los clientes dados de alta sin correo llevan uno interno inventado
  // (…@interno.smartbc.local): no es un buzón, el enlace no llegaría a nadie.
  if (!target.email || /@interno\.smartbc\.local$/i.test(target.email)) {
    return Response.json(
      { error: "Esta cuenta no tiene un correo real al que enviar el enlace. Ponle uno desde «Editar» y vuelve a probar." },
      { status: 422 },
    );
  }

  // Freno por cuenta (best-effort: si la consulta falla, no se bloquea el envío).
  const { data: recent } = await db
    .from("password_reset_tokens")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - COOLDOWN_MS).toISOString())
    .limit(1);
  if (Array.isArray(recent) && recent.length > 0) {
    return Response.json(
      { error: "Ya se envió un enlace a esta cuenta hace menos de un minuto. Espera un poco antes de reenviarlo." },
      { status: 429 },
    );
  }

  const tokenData = await createPasswordResetToken(userId, 24);
  if (!tokenData) {
    return Response.json({ error: "No se pudo crear el enlace de restablecimiento" }, { status: 500 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3137";
  const resetUrl = `${appUrl}/auth/reset-password?token=${tokenData.token}`;

  const sent = await sendPasswordResetEmail(
    target.email,
    target.full_name || "Usuario",
    resetUrl,
  );

  // Auditoría: queda quién lo pidió y si salió el correo; nunca el enlace.
  await logPermissionEvent({
    actorId: actor.id,
    targetUserId: userId,
    eventType: "password_reset_sent",
    newValue: { emailSent: sent.success },
  });

  if (!sent.success) {
    console.warn("[usuarios/reset-password] El correo no salió:", sent.error);
    return Response.json(
      {
        error:
          "No se pudo enviar el correo (revisa Configuración → Email). El enlace no se muestra por seguridad: reinténtalo cuando el correo funcione.",
        code: "email_failed",
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
