// ============================================================================
// EXTENSIÓN DE CHROME · versión exigida y paquete descargable
//
// La extensión se instala «descomprimida» en el Chrome de quien captura el
// inbox de Idealista y NO se actualiza sola. Desde la 1.14 el CRM necesita que
// cada captura traiga el código del anuncio; si llega de una versión anterior
// (o sin versión: las anteriores a la 1.14.1 no la mandan), Solicitudes lo
// avisa y ofrece el paquete al día para descargarlo desde el propio panel.
//
// El zip se construye aquí sin dependencias (formato «stored», sin comprimir:
// son ~70 KB) a partir de chrome-extension/ del propio despliegue, así el
// paquete que se descarga es SIEMPRE el de la versión que corre el CRM.
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Primera versión que captura el código del anuncio. */
export const REQUIRED_EXTENSION_VERSION = "1.14.0";

const EXTENSION_DIR = join(process.cwd(), "chrome-extension");

/** Versión del manifest de la extensión que acompaña a este despliegue. */
export function currentExtensionVersion(): string {
  try {
    const m = JSON.parse(readFileSync(join(EXTENSION_DIR, "manifest.json"), "utf8")) as { version?: string };
    return m.version ?? REQUIRED_EXTENSION_VERSION;
  } catch {
    return REQUIRED_EXTENSION_VERSION;
  }
}

/** -1, 0 o 1 comparando «a.b.c»; lo que no sea una versión cuenta como 0.0.0. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const parse = (v: string | null | undefined) =>
    String(v ?? "")
      .trim()
      .split(".")
      .map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Una captura sin versión viene de una extensión anterior a la 1.14.1. */
export function isExtensionOutdated(version: string | null | undefined): boolean {
  if (!version) return true;
  return compareVersions(version, REQUIRED_EXTENSION_VERSION) < 0;
}

// ─── Zip «stored» ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha/hora MS-DOS fija (1 ene 2026): el paquete es reproducible. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export type ZipEntry = { name: string; data: Uint8Array };

/** Zip sin compresión; suficiente para unos pocos ficheros de texto. */
export function buildStoredZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const chunk = Buffer.concat([local, name, Buffer.from(e.data)]);
    locals.push(chunk);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += chunk.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

/** Ficheros de la extensión (solo lo que Chrome necesita: nada de .DS_Store). */
export function extensionFiles(dir = EXTENSION_DIR): ZipEntry[] {
  const out: ZipEntry[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (!statSync(full).isFile()) continue;
    if (!/\.(js|json|html|css|md|png|svg)$/i.test(name)) continue;
    out.push({ name: `chrome-extension/${name}`, data: readFileSync(full) });
  }
  return out;
}

export function buildExtensionZip(): Buffer {
  return buildStoredZip(extensionFiles());
}
