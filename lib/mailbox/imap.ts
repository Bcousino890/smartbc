import "server-only";
import { ImapFlow, type ListResponse, type MessageStructureObject } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { mailboxServerConfig } from "./config";
import { MailboxAuthError, MailboxConnectionError } from "./errors";
import type { MailboxCredentials } from "./store";

export { MailboxAuthError, MailboxConnectionError };

/**
 * Acceso IMAP al buzón corporativo de cada usuario (cPanel/Dovecot).
 *
 * Una conexión por petición (login ~0,5 s) en vez de un pool: PM2 corre un
 * solo proceso y el panel no mantiene pestañas abiertas en tiempo real.
 * Todos los timeouts están acotados — un servidor de correo colgado no puede
 * dejar una ruta del CRM esperando para siempre (ver CLAUDE.md: "fetch
 * externo sin timeout").
 */

/** Correos más grandes que esto no se descargan enteros para leerlos. */
// cPanel/Exim acepta correos de hasta ~50 MB: todo lo que pueda llegar se puede leer.
const MAX_PARSE_BYTES = 60 * 1024 * 1024;
/** Imágenes incrustadas (cid:) que se pasan a data: para verlas. */
const MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024;

function newClient(creds: MailboxCredentials) {
  const cfg = mailboxServerConfig();
  return new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 45_000,
  });
}

function describeConnectError(err: unknown): Error {
  const e = err as {
    authenticationFailed?: boolean;
    serverResponseCode?: string;
    code?: string;
    message?: string;
    responseText?: string;
    response?: unknown;
  };
  const text = `${e?.serverResponseCode ?? ""} ${e?.responseText ?? ""} ${typeof e?.response === "string" ? e.response : ""} ${e?.message ?? ""}`;
  // [UNAVAILABLE] = el servicio de autenticación del servidor no respondió
  // (cPanel caído/reiniciando). NO es una contraseña mala: tratarlo como tal
  // haría que todos los usuarios tuvieran que reconectar tras una caída.
  if (/UNAVAILABLE|temporary failure|try again later/i.test(text)) {
    return new MailboxConnectionError("El servidor de correo no está disponible ahora mismo. Prueba en unos minutos.");
  }
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|authentication failed|invalid credentials/i.test(text)) {
    return new MailboxAuthError();
  }
  if (e?.code === "ETIMEDOUT" || e?.code === "CONNECT_TIMEOUT" || /timeout/i.test(e?.message ?? "")) {
    return new MailboxConnectionError("El servidor de correo no respondió a tiempo.");
  }
  if (e?.code === "ENOTFOUND" || e?.code === "ECONNREFUSED") {
    return new MailboxConnectionError("No se pudo contactar con el servidor de correo.");
  }
  return new MailboxConnectionError(e?.message || "Error de conexión con el servidor de correo.");
}

export async function withImap<T>(creds: MailboxCredentials, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = newClient(creds);
  // Sin este listener, un 'error' del socket después del login tumba el proceso.
  client.on("error", () => {});
  try {
    await client.connect();
  } catch (err) {
    client.close();
    throw describeConnectError(err);
  }
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

/** Solo comprueba que el usuario/contraseña entran. */
export async function testImapLogin(creds: MailboxCredentials): Promise<void> {
  await withImap(creds, async () => undefined);
}

// ─── Carpetas ────────────────────────────────────────────────────────────────

export type MailFolder = {
  path: string;
  name: string;
  specialUse: string | null;
  unseen: number;
  total: number;
};

const SPECIAL_ORDER = ["\\Inbox", "\\Flagged", "\\Drafts", "\\Sent", "\\Archive", "\\Junk", "\\Trash"];

const SPECIAL_LABEL: Record<string, string> = {
  "\\Inbox": "Entrada",
  "\\Sent": "Enviados",
  "\\Drafts": "Borradores",
  "\\Trash": "Papelera",
  "\\Junk": "SPAM",
  "\\Archive": "Archivo",
  "\\Flagged": "Destacados",
};

/** cPanel no siempre marca SPECIAL-USE: se deduce también por el nombre. */
const NAME_HINTS: Array<[RegExp, string]> = [
  [/^(sent|sent items|sent messages|enviados?|elementos enviados)$/i, "\\Sent"],
  [/^(trash|deleted|deleted items|deleted messages|papelera|eliminados)$/i, "\\Trash"],
  [/^(drafts?|borradores?)$/i, "\\Drafts"],
  [/^(junk|spam|correo no deseado)$/i, "\\Junk"],
  [/^(archive|archivo|archivados)$/i, "\\Archive"],
];

function specialUseOf(box: ListResponse): string | null {
  if (box.path.toUpperCase() === "INBOX") return "\\Inbox";
  if (box.specialUse) return box.specialUse;
  for (const [re, use] of NAME_HINTS) if (re.test(box.name)) return use;
  return null;
}

export async function listFolders(client: ImapFlow): Promise<MailFolder[]> {
  const boxes = await client.list({ statusQuery: { unseen: true, messages: true } });
  const folders = boxes
    .filter((b) => !b.flags.has("\\Noselect") && !b.flags.has("\\NonExistent"))
    .map((b) => {
      const use = specialUseOf(b);
      return {
        path: b.path,
        name: (use && SPECIAL_LABEL[use]) || b.name,
        specialUse: use,
        unseen: b.status?.unseen ?? 0,
        total: b.status?.messages ?? 0,
      };
    });
  const rank = (f: MailFolder) => {
    const i = f.specialUse ? SPECIAL_ORDER.indexOf(f.specialUse) : -1;
    return i === -1 ? SPECIAL_ORDER.length : i;
  };
  return folders.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "es"));
}

type SpecialUse = "\\Sent" | "\\Trash" | "\\Archive" | "\\Junk" | "\\Inbox";

async function findSpecialFolder(client: ImapFlow, use: SpecialUse): Promise<string | null> {
  const boxes = await client.list();
  const hit = boxes.find((b) => specialUseOf(b) === use && !b.flags.has("\\Noselect"));
  return hit?.path ?? null;
}

// ─── Lista de mensajes ───────────────────────────────────────────────────────

export type MailAddress = { name: string | null; address: string | null };

export type MailListItem = {
  uid: number;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  date: string | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
  size: number;
};

function hasAttachmentPart(node: MessageStructureObject | undefined): boolean {
  if (!node) return false;
  if (node.disposition?.toLowerCase() === "attachment") return true;
  if (node.childNodes?.length) return node.childNodes.some(hasAttachmentPart);
  const type = node.type?.toLowerCase() ?? "";
  return Boolean(
    (node.dispositionParameters?.filename || node.parameters?.name) &&
      !type.startsWith("text/") &&
      node.disposition?.toLowerCase() !== "inline",
  );
}

function toIso(d: Date | string | undefined | null): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function listMessages(
  client: ImapFlow,
  folder: string,
  opts: { page: number; pageSize: number; query?: string | null },
): Promise<{ total: number; items: MailListItem[] }> {
  const lock = await client.getMailboxLock(folder, { readOnly: true, acquireTimeout: 15_000 });
  try {
    const box = client.mailbox;
    const exists = box ? box.exists : 0;
    if (!exists) return { total: 0, items: [] };

    const query = opts.query?.trim();
    let range: string | number[];
    let byUid = false;
    let total = exists;

    if (query) {
      const found = await client.search(
        { or: [{ subject: query }, { from: query }, { to: query }, { body: query }] },
        { uid: true },
      );
      const uids = (Array.isArray(found) ? found : []).sort((a, b) => b - a);
      total = uids.length;
      const slice = uids.slice(opts.page * opts.pageSize, (opts.page + 1) * opts.pageSize);
      if (!slice.length) return { total, items: [] };
      range = slice;
      byUid = true;
    } else {
      const end = exists - opts.page * opts.pageSize;
      if (end < 1) return { total, items: [] };
      const start = Math.max(1, end - opts.pageSize + 1);
      range = `${start}:${end}`;
    }

    const items: MailListItem[] = [];
    for await (const msg of client.fetch(
      range,
      { uid: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true },
      byUid ? { uid: true } : undefined,
    )) {
      const env = msg.envelope;
      const flags = msg.flags ?? new Set<string>();
      const from = env?.from?.[0];
      items.push({
        uid: msg.uid,
        subject: env?.subject?.trim() || "(sin asunto)",
        from: from ? { name: from.name || null, address: from.address || null } : null,
        to: (env?.to ?? []).map((a) => ({ name: a.name || null, address: a.address || null })),
        date: toIso(env?.date) ?? toIso(msg.internalDate),
        seen: flags.has("\\Seen"),
        flagged: flags.has("\\Flagged"),
        answered: flags.has("\\Answered"),
        hasAttachments: hasAttachmentPart(msg.bodyStructure),
        size: msg.size ?? 0,
      });
    }
    // Más reciente primero (por UID: el orden de llegada al buzón).
    items.sort((a, b) => b.uid - a.uid);
    return { total, items };
  } finally {
    lock.release();
  }
}

// ─── Un mensaje ──────────────────────────────────────────────────────────────

export type MailAttachmentMeta = {
  index: number;
  filename: string;
  contentType: string;
  size: number;
};

export type MailMessage = {
  uid: number;
  folder: string;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  replyTo: MailAddress[];
  date: string | null;
  messageId: string | null;
  references: string | null;
  html: string | null;
  text: string | null;
  attachments: MailAttachmentMeta[];
  seen: boolean;
  flagged: boolean;
  tooLarge: boolean;
};

function addrList(a: AddressObject | AddressObject[] | undefined): MailAddress[] {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list.flatMap((o) =>
    (o.value ?? []).flatMap((v) => {
      // Grupos (RFC 5322) traen sus miembros en `group`.
      if (v.group?.length) return v.group.map((g) => ({ name: g.name || null, address: g.address || null }));
      return [{ name: v.name || null, address: v.address || null }];
    }),
  );
}

function inlineCidImages(html: string, parsed: ParsedMail): string {
  let out = html;
  for (const att of parsed.attachments) {
    const cid = att.cid || att.contentId?.replace(/^<|>$/g, "");
    if (!cid || !att.contentType?.startsWith("image/") || att.size > MAX_INLINE_IMAGE_BYTES) continue;
    const dataUri = `data:${att.contentType};base64,${att.content.toString("base64")}`;
    out = out.split(`cid:${cid}`).join(dataUri);
  }
  return out;
}

/** Adjuntos que se enseñan como descargables (no los incrustados en el HTML). */
function visibleAttachments(parsed: ParsedMail, html: string | null): MailAttachmentMeta[] {
  return parsed.attachments.flatMap((att, index) => {
    const cid = att.cid || att.contentId?.replace(/^<|>$/g, "");
    const embedded = Boolean(cid && html && html.includes(`cid:${cid}`));
    if (embedded) return [];
    return [
      {
        index,
        filename: att.filename || `adjunto-${index + 1}`,
        contentType: att.contentType || "application/octet-stream",
        size: att.size ?? att.content?.length ?? 0,
      },
    ];
  });
}

async function fetchParsed(
  client: ImapFlow,
  uid: number,
): Promise<{ parsed: ParsedMail | null; flags: Set<string>; size: number } | null> {
  const meta = await client.fetchOne(String(uid), { uid: true, size: true, flags: true }, { uid: true });
  if (!meta) return null;
  const size = meta.size ?? 0;
  const flags = meta.flags ?? new Set<string>();
  if (size > MAX_PARSE_BYTES) return { parsed: null, flags, size };
  const full = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
  if (!full || !full.source) return null;
  const parsed = await simpleParser(full.source, { skipImageLinks: true });
  return { parsed, flags, size };
}

function referencesOf(parsed: ParsedMail): string | null {
  const refs = parsed.references;
  if (!refs) return null;
  return Array.isArray(refs) ? refs.join(" ") : refs;
}

export async function getMessage(
  client: ImapFlow,
  folder: string,
  uid: number,
  opts: { markSeen: boolean } = { markSeen: true },
): Promise<MailMessage | null> {
  const lock = await client.getMailboxLock(folder, { acquireTimeout: 15_000 });
  try {
    const got = await fetchParsed(client, uid);
    if (!got) return null;
    const { parsed, flags } = got;
    if (opts.markSeen && !flags.has("\\Seen")) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      flags.add("\\Seen");
    }
    if (!parsed) {
      return {
        uid,
        folder,
        subject: "(mensaje demasiado grande para mostrarlo)",
        from: [],
        to: [],
        cc: [],
        replyTo: [],
        date: null,
        messageId: null,
        references: null,
        html: null,
        text: null,
        attachments: [],
        seen: flags.has("\\Seen"),
        flagged: flags.has("\\Flagged"),
        tooLarge: true,
      };
    }
    const html = parsed.html ? inlineCidImages(parsed.html, parsed) : null;
    return {
      uid,
      folder,
      subject: parsed.subject?.trim() || "(sin asunto)",
      from: addrList(parsed.from),
      to: addrList(parsed.to),
      cc: addrList(parsed.cc),
      replyTo: addrList(parsed.replyTo),
      date: toIso(parsed.date),
      messageId: parsed.messageId ?? null,
      references: referencesOf(parsed),
      html,
      text: parsed.text ?? null,
      attachments: visibleAttachments(parsed, parsed.html || null),
      seen: flags.has("\\Seen"),
      flagged: flags.has("\\Flagged"),
      tooLarge: false,
    };
  } finally {
    lock.release();
  }
}

export async function getAttachment(
  client: ImapFlow,
  folder: string,
  uid: number,
  index: number,
): Promise<{ filename: string; contentType: string; content: Buffer } | null> {
  const lock = await client.getMailboxLock(folder, { readOnly: true, acquireTimeout: 15_000 });
  try {
    const got = await fetchParsed(client, uid);
    const att = got?.parsed?.attachments[index];
    if (!att) return null;
    return {
      filename: att.filename || `adjunto-${index + 1}`,
      contentType: att.contentType || "application/octet-stream",
      content: att.content,
    };
  } finally {
    lock.release();
  }
}

/** Todos los adjuntos del original, para reenviarlo tal cual. */
export async function getAllAttachments(
  client: ImapFlow,
  folder: string,
  uid: number,
): Promise<Array<{ filename: string; contentType: string; content: Buffer; cid?: string }>> {
  const lock = await client.getMailboxLock(folder, { readOnly: true, acquireTimeout: 15_000 });
  try {
    const got = await fetchParsed(client, uid);
    return (got?.parsed?.attachments ?? []).map((a, i) => ({
      filename: a.filename || `adjunto-${i + 1}`,
      contentType: a.contentType || "application/octet-stream",
      content: a.content,
      cid: a.cid || undefined,
    }));
  } finally {
    lock.release();
  }
}

// ─── Acciones ────────────────────────────────────────────────────────────────

export async function setMessageFlags(
  client: ImapFlow,
  folder: string,
  uid: number,
  patch: { seen?: boolean; flagged?: boolean; answered?: boolean },
): Promise<void> {
  const lock = await client.getMailboxLock(folder, { acquireTimeout: 15_000 });
  try {
    const add: string[] = [];
    const remove: string[] = [];
    if (patch.seen !== undefined) (patch.seen ? add : remove).push("\\Seen");
    if (patch.flagged !== undefined) (patch.flagged ? add : remove).push("\\Flagged");
    if (patch.answered !== undefined) (patch.answered ? add : remove).push("\\Answered");
    if (add.length) await client.messageFlagsAdd(String(uid), add, { uid: true });
    if (remove.length) await client.messageFlagsRemove(String(uid), remove, { uid: true });
  } finally {
    lock.release();
  }
}

const DEFAULT_FOLDER_NAME: Record<Exclude<SpecialUse, "\\Inbox">, string> = {
  "\\Sent": "Sent",
  "\\Trash": "Trash",
  "\\Archive": "Archive",
  "\\Junk": "spam",
};

/**
 * Carpeta especial del buzón; si no existe se crea con el nombre que usa
 * cPanel (bajo INBOX. cuando el servidor anida así las carpetas).
 */
async function ensureSpecialFolder(client: ImapFlow, use: SpecialUse): Promise<string> {
  if (use === "\\Inbox") return "INBOX";
  const found = await findSpecialFolder(client, use);
  if (found) return found;
  const boxes = await client.list();
  const delimiter = boxes[0]?.delimiter || ".";
  const inboxIsParent = boxes.some((b) => b.path.toUpperCase().startsWith(`INBOX${delimiter}`));
  const name = DEFAULT_FOLDER_NAME[use];
  const path = inboxIsParent ? `INBOX${delimiter}${name}` : name;
  try {
    await client.mailboxCreate(path);
  } catch {
    // Puede existir sin listarse; la operación siguiente dirá si no.
  }
  return path;
}

/**
 * Borrar = mover a la Papelera (creándola si el buzón aún no la tiene: un
 * buzón recién creado en cPanel puede no tenerla hasta que se abre el
 * webmail, y borrar definitivamente por eso sería perder correo). Solo desde
 * la propia Papelera se elimina de verdad.
 */
export async function deleteMessage(client: ImapFlow, folder: string, uid: number): Promise<"trash" | "deleted"> {
  const trash = await ensureSpecialFolder(client, "\\Trash");
  const lock = await client.getMailboxLock(folder, { acquireTimeout: 15_000 });
  try {
    if (trash !== folder) {
      await client.messageMove(String(uid), trash, { uid: true });
      return "trash";
    }
    await client.messageDelete(String(uid), { uid: true });
    return "deleted";
  } finally {
    lock.release();
  }
}

/** Mover a Archivo / SPAM / Recibidos (botones de la barra de lectura). */
export async function moveMessage(
  client: ImapFlow,
  folder: string,
  uid: number,
  target: "archive" | "junk" | "inbox",
): Promise<string> {
  const use: SpecialUse = target === "archive" ? "\\Archive" : target === "junk" ? "\\Junk" : "\\Inbox";
  const dest = await ensureSpecialFolder(client, use);
  if (dest === folder) return dest;
  const lock = await client.getMailboxLock(folder, { acquireTimeout: 15_000 });
  try {
    await client.messageMove(String(uid), dest, { uid: true });
    return dest;
  } finally {
    lock.release();
  }
}

/**
 * Guarda en "Enviados" lo que se mandó por SMTP: cPanel (Dovecot+Exim) NO lo
 * hace solo, a diferencia de Gmail. Si la carpeta no existe se crea.
 */
export async function appendToSent(client: ImapFlow, raw: Buffer): Promise<void> {
  const sent = await ensureSpecialFolder(client, "\\Sent");
  await client.append(sent, raw, ["\\Seen"]);
}

/** Marca \Answered en el original tras responder (best-effort). */
export async function markAnswered(client: ImapFlow, folder: string, uid: number): Promise<void> {
  try {
    await setMessageFlags(client, folder, uid, { answered: true });
  } catch {
    // no crítico
  }
}
