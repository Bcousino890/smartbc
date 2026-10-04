import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/db/admin";
import { LARGE_FILE_LINK_DAYS, storageSafeName } from "./attachments";

/**
 * Archivos que no caben como adjunto → bucket privado `mail-attachments`
 * (migración 0171) + enlace firmado en el cuerpo del correo.
 *
 * El enlace es nuestro (/api/public/correo-archivo/{token}) y no una URL
 * firmada de storage: queda bajo el dominio de la agencia, caduca a los
 * LARGE_FILE_LINK_DAYS días y siempre descarga (attachment + nosniff).
 * Firma HMAC con EMAIL_ENCRYPTION_KEY, mismo secreto que la baja de alertas.
 */

export const MAIL_FILES_BUCKET = "mail-attachments";
const SECRET = process.env.EMAIL_ENCRYPTION_KEY || "default-insecure-key-change-this";
const DAY_MS = 24 * 60 * 60 * 1000;

type LinkPayload = { p: string; n: string; e: number };

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(`mail-file:${data}`).digest("base64url");
}

export function signFileToken(storagePath: string, filename: string, expiresAt: number): string {
  const data = Buffer.from(JSON.stringify({ p: storagePath, n: filename, e: expiresAt } satisfies LinkPayload)).toString(
    "base64url",
  );
  return `${data}.${sign(data)}`;
}

export function verifyFileToken(token: string): { path: string; filename: string; expiresAt: number } | null {
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as LinkPayload;
    if (typeof payload.p !== "string" || typeof payload.n !== "string" || typeof payload.e !== "number") return null;
    return { path: payload.p, filename: payload.n, expiresAt: payload.e };
  } catch {
    return null;
  }
}

export class LargeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LargeFileError";
  }
}

/** Sube el archivo y devuelve la URL pública firmada para el cuerpo del correo. */
export async function storeLargeFile(
  userId: string,
  file: { filename: string; contentType: string; content: Buffer },
  appUrl: string,
): Promise<{ url: string; expiresAt: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const storagePath = `${userId}/${day}_${randomUUID()}_${storageSafeName(file.filename)}`;
  const db = createAdminClient();
  const { error } = await db.storage.from(MAIL_FILES_BUCKET).upload(storagePath, file.content, {
    contentType: file.contentType || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    const tooBig = /too large|exceeded|413|maximum/i.test(error.message);
    throw new LargeFileError(
      tooBig
        ? `«${file.filename}» es más grande de lo que acepta el almacenamiento del servidor (FILE_SIZE_LIMIT del contenedor storage).`
        : `No se pudo guardar «${file.filename}» para enviarlo como enlace: ${error.message}`,
    );
  }
  const expiresAt = Date.now() + LARGE_FILE_LINK_DAYS * DAY_MS;
  const token = signFileToken(storagePath, file.filename, expiresAt);
  return { url: `${appUrl.replace(/\/+$/, "")}/api/public/correo-archivo/${token}`, expiresAt };
}

/** Borra los archivos de este usuario cuyo enlace ya caducó (perezoso, en cada envío). */
export async function cleanupExpiredLargeFiles(userId: string): Promise<void> {
  try {
    const db = createAdminClient({ timeoutMs: 10_000 });
    const bucket = db.storage.from(MAIL_FILES_BUCKET);
    const { data } = await bucket.list(userId, { limit: 1000 });
    const cutoff = Date.now() - (LARGE_FILE_LINK_DAYS + 1) * DAY_MS;
    const expired = (data ?? [])
      .filter((o) => o.created_at && new Date(o.created_at).getTime() < cutoff)
      .map((o) => `${userId}/${o.name}`);
    if (expired.length) await bucket.remove(expired);
  } catch {
    // best-effort
  }
}
