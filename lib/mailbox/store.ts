import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret";
import type { SignatureMode } from "./signature";

/**
 * Tabla `user_mailboxes` (migración 0171). Solo service role: cada función
 * recibe el id del usuario de la sesión, nunca uno que venga del navegador.
 */

export type MailboxRow = {
  user_id: string;
  email: string;
  password_encrypted: string | null;
  password_iv: string | null;
  signature_mode: SignatureMode;
  signature_html: string | null;
  signature_title: string | null;
  connected_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

export type MailboxCredentials = { email: string; password: string };

type Table = {
  select: (cols: string) => {
    eq: (c: string, v: string) => {
      maybeSingle: () => Promise<{ data: MailboxRow | null; error: { message: string } | null }>;
    };
  };
  upsert: (
    row: Record<string, unknown>,
    opts: { onConflict: string },
  ) => Promise<{ error: { message: string } | null }>;
  update: (patch: Record<string, unknown>) => {
    eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
  };
};

function table(): Table {
  const db = createAdminClient({ timeoutMs: 10_000 }) as unknown as { from: (t: string) => Table };
  return db.from("user_mailboxes");
}

const COLUMNS =
  "user_id, email, password_encrypted, password_iv, signature_mode, signature_html, signature_title, connected_at, last_error, last_error_at";

export async function getMailboxRow(userId: string): Promise<MailboxRow | null> {
  const { data, error } = await table().select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`user_mailboxes: ${error.message}`);
  return data;
}

export function isConnected(row: MailboxRow | null): row is MailboxRow & {
  password_encrypted: string;
  password_iv: string;
} {
  return Boolean(row?.password_encrypted && row.password_iv);
}

export function credentialsOf(row: MailboxRow): MailboxCredentials | null {
  if (!isConnected(row)) return null;
  try {
    return { email: row.email, password: decryptSecret(row.password_encrypted, row.password_iv) };
  } catch {
    // EMAIL_ENCRYPTION_KEY cambió: la contraseña guardada ya no se puede leer.
    return null;
  }
}

export async function saveMailboxCredentials(userId: string, email: string, password: string) {
  const { encrypted, iv } = encryptSecret(password);
  const now = new Date().toISOString();
  const { error } = await table().upsert(
    {
      user_id: userId,
      email,
      password_encrypted: encrypted,
      password_iv: iv,
      connected_at: now,
      last_error: null,
      last_error_at: null,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`user_mailboxes: ${error.message}`);
}

export async function disconnectMailbox(userId: string) {
  const { error } = await table()
    .update({
      password_encrypted: null,
      password_iv: null,
      connected_at: null,
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error(`user_mailboxes: ${error.message}`);
}

/**
 * Guarda la firma. Si el usuario aún no conectó su buzón, crea la fila con la
 * dirección propuesta para que la firma quede lista de antemano.
 */
export async function saveSignature(
  userId: string,
  fallbackEmail: string,
  patch: { mode: SignatureMode; html: string | null; title: string | null },
) {
  const existing = await getMailboxRow(userId);
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await table()
      .update({
        signature_mode: patch.mode,
        signature_html: patch.html,
        signature_title: patch.title,
        updated_at: now,
      })
      .eq("user_id", userId);
    if (error) throw new Error(`user_mailboxes: ${error.message}`);
    return;
  }
  const { error } = await table().upsert(
    {
      user_id: userId,
      email: fallbackEmail,
      signature_mode: patch.mode,
      signature_html: patch.html,
      signature_title: patch.title,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`user_mailboxes: ${error.message}`);
}

/** Apunta un fallo de autenticación para pedir reconexión en el panel. */
export async function recordMailboxError(userId: string, message: string) {
  try {
    await table()
      .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch {
    // best-effort
  }
}

export async function clearMailboxError(userId: string) {
  try {
    await table().update({ last_error: null, last_error_at: null }).eq("user_id", userId);
  } catch {
    // best-effort
  }
}
