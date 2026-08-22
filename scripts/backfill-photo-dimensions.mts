// Backfill de dimensiones (0153). Sin IA y sin descargar la foto entera:
// se piden los primeros KB con Range y se leen las cabeceras del formato.
// Un WebP declara su tamaño en el byte 24; un JPEG, en el primer marcador
// SOF; un PNG, en el IHDR. Con 64KB sobra para los tres.
//
// Uso (VPS): node scripts/backfill-dimensions.bundle.cjs [--confirm] [--limit=N]

import { createAdminClient } from "../lib/db/admin";

const HEAD_BYTES = 65536;
const CONCURRENCY = 6;

export function readDimensions(buf: Buffer): { w: number; h: number } | null {
  // PNG · IHDR
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // WebP · RIFF….WEBP
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fmt = buf.toString("ascii", 12, 16);
    if (fmt === "VP8X") {
      return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    }
    if (fmt === "VP8 ") {
      return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fmt === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  // JPEG · se recorren los marcadores hasta el SOF (evitando DHT/DAC/DRI).
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

async function measure(url: string): Promise<{ w: number; h: number } | null> {
  // Un intento más: la primera tanda dejó 9 de 40 sin medir y todas eran
  // caídas de socket, no cabeceras ilegibles.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok && res.status !== 206) return null;
      const d = readDimensions(Buffer.from(await res.arrayBuffer()));
      if (d) return d;
    } catch {
      // reintenta
    }
  }
  return null;
}

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 0);
  if (!CONFIRM) console.log("[dims] sin --confirm → DRY-RUN");

  const HEROES = process.argv.includes("--heroes");
  const db = createAdminClient() as any;

  // Medir las 32.500 fotos del catálogo cuesta horas y no hace falta: las
  // decisiones de esta tanda son sobre el HERO, así que basta con las
  // primeras de cada propiedad activa — la portada y sus alternativas.
  let activeIds: string[] | null = null;
  if (HEROES) {
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("properties")
        .select("id")
        .is("archived_at", null)
        .neq("status", "archived")
        .range(from, from + 999);
      if (!data?.length) break;
      ids.push(...data.map((p: any) => p.id));
      if (data.length < 1000) break;
    }
    activeIds = ids;
    console.log(`[dims] modo heroes · propiedades activas: ${ids.length}`);
  }

  const rows: any[] = [];
  if (activeIds) {
    for (let i = 0; i < activeIds.length; i += 60) {
      const { data } = await db
        .from("property_photos")
        .select("id, url, position")
        .in("property_id", activeIds.slice(i, i + 60))
        .lte("position", 4)
        .is("source_width", null);
      rows.push(...(data ?? []));
    }
  } else {
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("property_photos")
        .select("id, url")
        .is("source_width", null)
        .range(from, from + 999);
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < 1000 || (LIMIT && rows.length >= LIMIT)) break;
    }
  }
  const todo = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`[dims] fotos sin medir: ${todo.length}`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p: any) => {
        const d = await measure(p.url);
        if (!d || !d.w || !d.h) { failed++; return; }
        ok++;
        if (CONFIRM) {
          await db
            .from("property_photos")
            .update({ source_width: d.w, source_height: d.h })
            .eq("id", p.id);
        }
      }),
    );
    if (i % 600 === 0) console.log(`  … ${i + batch.length}/${todo.length} (ok=${ok} fallos=${failed})`);
  }
  console.log(`\n[dims] medidas=${ok} · sin leer=${failed}`);
  process.exit(0);
}

void main();
