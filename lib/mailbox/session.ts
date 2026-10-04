import "server-only";
import { getCurrentProfile, type ProfileRow } from "@/lib/db/queries/session";
import { isStaffRole } from "@/lib/permissions";
import { suggestedMailboxEmail } from "./config";
import { MailboxAuthError, MailboxConnectionError } from "./imap";
import { credentialsOf, getMailboxRow, recordMailboxError, type MailboxCredentials, type MailboxRow } from "./store";
import type { SignatureProfile } from "./signature";

/**
 * Gate de /api/admin/correo/**: cualquier usuario del staff, pero SOLO su
 * propio buzón — el id sale siempre de la sesión, nunca del navegador. No va
 * por la matriz de permisos: no es un módulo compartido sino el correo
 * personal de cada uno.
 */

export const APP_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

type Fail = { ok: false; response: Response };

export async function requireStaff(): Promise<{ ok: true; profile: ProfileRow } | Fail> {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile) return { ok: false, response: Response.json({ error: "No autenticado" }, { status: 401 }) };
  if (!isStaffRole(profile.role)) {
    return { ok: false, response: Response.json({ error: "Sin acceso" }, { status: 403 }) };
  }
  return { ok: true, profile };
}

export async function requireMailbox(): Promise<
  { ok: true; profile: ProfileRow; row: MailboxRow; creds: MailboxCredentials } | Fail
> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const row = await getMailboxRow(gate.profile.id);
  const creds = row ? credentialsOf(row) : null;
  if (!row || !creds) {
    return {
      ok: false,
      response: Response.json(
        { error: "Tu correo no está conectado todavía.", code: "not_connected" },
        { status: 409 },
      ),
    };
  }
  return { ok: true, profile: gate.profile, row, creds };
}

/** Error de IMAP/SMTP → respuesta JSON (y, si es de contraseña, se apunta). */
export async function mailboxErrorResponse(userId: string, err: unknown): Promise<Response> {
  if (err instanceof MailboxAuthError) {
    await recordMailboxError(userId, "La contraseña guardada ya no es válida.");
    return Response.json(
      {
        error: "El servidor rechazó la contraseña guardada. ¿La cambiaste en cPanel? Vuelve a conectar tu correo.",
        code: "auth_failed",
      },
      { status: 401 },
    );
  }
  if (err instanceof MailboxConnectionError) {
    return Response.json({ error: err.message, code: "connection" }, { status: 502 });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[correo]", message);
  return Response.json({ error: "Error del servidor de correo.", detail: message.slice(0, 300) }, { status: 500 });
}

export function signatureProfileOf(profile: ProfileRow, email: string, title: string | null): SignatureProfile {
  const p = profile as ProfileRow & { country?: string | null };
  return {
    fullName: p.full_name ?? null,
    role: p.role ?? null,
    phone: p.phone ?? null,
    country: p.country ?? null,
    email,
    title,
  };
}

export function defaultMailboxEmail(profile: ProfileRow): string | null {
  return suggestedMailboxEmail(profile.email);
}
