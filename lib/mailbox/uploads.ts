import "server-only";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { MAX_FILE_BYTES } from "./attachments";

/**
 * Adjuntos subidos por trozos antes de enviar (ver lib/mailbox/attachments.ts:
 * el middleware corta cualquier cuerpo > 10 MB). Viven en disco temporal del
 * VPS — PM2 corre UN proceso, así que todas las peticiones ven la misma
 * carpeta — y se borran al enviar, al quitarlos del borrador o, como muy
 * tarde, a las 24 h (limpieza perezosa en cada subida nueva).
 */

const ROOT = path.join(os.tmpdir(), "smartbc-correo-uploads");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USER_RE = /^[0-9a-f-]{36}$/;

export type UploadMeta = { id: string; filename: string; size: number; contentType: string; createdAt: number };

function userDir(userId: string): string {
  if (!USER_RE.test(userId)) throw new Error("usuario inválido");
  return path.join(ROOT, userId);
}

function paths(userId: string, id: string) {
  if (!UUID_RE.test(id)) throw new UploadError("Adjunto inválido", 400);
  const dir = userDir(userId);
  return { meta: path.join(dir, `${id}.json`), data: path.join(dir, `${id}.bin`) };
}

export class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

async function cleanupOld(userId: string) {
  const dir = userDir(userId);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  const now = Date.now();
  await Promise.all(
    names.map(async (n) => {
      const full = path.join(dir, n);
      try {
        const st = await fs.stat(full);
        if (now - st.mtimeMs > MAX_AGE_MS) await fs.rm(full, { force: true });
      } catch {
        // ya no está
      }
    }),
  );
}

export async function createUpload(
  userId: string,
  input: { filename: string; size: number; contentType: string },
): Promise<UploadMeta> {
  if (!Number.isInteger(input.size) || input.size <= 0) throw new UploadError("El archivo está vacío.", 400);
  if (input.size > MAX_FILE_BYTES) {
    throw new UploadError(`«${input.filename}» supera el máximo de ${MAX_FILE_BYTES / 1024 / 1024} MB por archivo.`, 413);
  }
  await cleanupOld(userId);
  await fs.mkdir(userDir(userId), { recursive: true });
  const meta: UploadMeta = {
    id: randomUUID(),
    filename: (input.filename || "archivo").replace(/[\r\n\\/]+/g, "_").slice(0, 200),
    size: input.size,
    contentType: (input.contentType || "application/octet-stream").slice(0, 150),
    createdAt: Date.now(),
  };
  const p = paths(userId, meta.id);
  await fs.writeFile(p.data, Buffer.alloc(0));
  await fs.writeFile(p.meta, JSON.stringify(meta));
  return meta;
}

async function readMeta(userId: string, id: string): Promise<UploadMeta> {
  const p = paths(userId, id);
  try {
    return JSON.parse(await fs.readFile(p.meta, "utf8")) as UploadMeta;
  } catch {
    throw new UploadError("El adjunto ya no existe (¿caducó?). Vuelve a añadirlo.", 404);
  }
}

/**
 * Añade un trozo. `offset` tiene que coincidir con lo ya recibido: si no
 * (un reintento tras un corte), se devuelve lo recibido para que el cliente
 * siga desde ahí en vez de duplicar bytes.
 */
export async function appendChunk(
  userId: string,
  id: string,
  offset: number,
  chunk: Buffer,
): Promise<{ received: number; complete: boolean; resync: boolean }> {
  const meta = await readMeta(userId, id);
  const p = paths(userId, id);
  const current = (await fs.stat(p.data)).size;
  if (offset !== current) return { received: current, complete: current === meta.size, resync: true };
  if (current + chunk.length > meta.size) throw new UploadError("El trozo excede el tamaño declarado.", 400);
  await fs.appendFile(p.data, chunk);
  const received = current + chunk.length;
  return { received, complete: received === meta.size, resync: false };
}

/** Un adjunto COMPLETO, listo para el envío. */
export async function readUpload(userId: string, id: string): Promise<UploadMeta & { content: Buffer }> {
  const meta = await readMeta(userId, id);
  const content = await fs.readFile(paths(userId, id).data);
  if (content.length !== meta.size) {
    throw new UploadError(`«${meta.filename}» no terminó de subirse. Quítalo y vuelve a añadirlo.`, 409);
  }
  return { ...meta, content };
}

export async function deleteUpload(userId: string, id: string): Promise<void> {
  const p = paths(userId, id);
  await Promise.all([fs.rm(p.meta, { force: true }), fs.rm(p.data, { force: true })]);
}
