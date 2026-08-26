// FORENSE · ¿qué resolución da cada perfil del CDN de Idealista?
//
// El hero de las fichas importadas de Idealista llega a 850px mientras las de
// otras fuentes llegan a 1600. El importador normaliza toda URL de imagen a un
// único perfil "seguro" (`WEB_DETAIL_TOP-L-L`) porque los perfiles compuestos
// devolvían 404 — pero nadie midió si existía uno mayor que también
// funcionase. Esto lo mide, usando el mismo fetcher que el importador (con el
// proxy residencial configurado en BD) para no chocar con DataDome.
//
// Solo lee. No escribe nada.

import { fetchViaCurl } from "../lib/sync/import-by-link/fetch-via-curl";
import { getProxyUrl } from "../lib/sync/proxy-config";

const LISTING = process.argv[2] ?? "https://www.idealista.com/inmueble/112289435/";

/** Dimensiones de un JPEG/WebP/PNG a partir de sus primeros bytes. */
function dimensions(buf: Buffer): string {
  // PNG
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  }
  // WebP (VP8X / VP8 / VP8L)
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fmt = buf.toString("ascii", 12, 16);
    if (fmt === "VP8X") return `${(buf.readUIntLE(24, 3) & 0xffffff) + 1}x${(buf.readUIntLE(27, 3) & 0xffffff) + 1}`;
    if (fmt === "VP8 ") return `${buf.readUInt16LE(26) & 0x3fff}x${buf.readUInt16LE(28) & 0x3fff}`;
  }
  // JPEG: se recorren los marcadores hasta el SOF.
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return "?";
}

const PROFILES = [
  "WEB_DETAIL_TOP-L-L",
  "WEB_DETAIL_TOP-XL-L",
  "WEB_DETAIL-XL-L",
  "WEB_DETAIL-L-L",
  "WEB_DETAIL-M-L",
  "WEB_LISTING",
  "WEB_THUMB",
];

async function main() {
  const proxy = await getProxyUrl();
  console.log(`[forense] proxy configurado: ${proxy ? "sí" : "NO"}`);

  const res = await fetchViaCurl(LISTING, { proxyUrl: proxy ?? undefined, timeoutSec: 30 });
  if (!res.ok) {
    console.log(`[forense] la ficha no se pudo leer (${res.status} ${res.reason})`);
    process.exit(1);
  }
  const urls = [
    ...new Set(
      (res.html.match(/https?:\/\/img\d*\.idealista\.com\/blur\/[A-Z_\-]+\/\d+\/[^"'\s)>]+\.(?:jpe?g|webp|png)/gi) ?? []),
    ),
  ];
  console.log(`[forense] imágenes en la ficha: ${urls.length}`);
  if (!urls.length) process.exit(1);
  const sample = urls[0];
  console.log(`[forense] muestra: ${sample.replace(/\/blur\/[^/]+\//, "/blur/<PERFIL>/")}\n`);

  for (const profile of PROFILES) {
    const url = sample.replace(/(\/blur\/)[^/]+(\/\d+\/)/, `$1${profile}$2`);
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "image/avif,image/webp,*/*" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) {
        console.log(`  ${profile.padEnd(22)} http ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(
        `  ${profile.padEnd(22)} http ${r.status}  ${String(Math.round(buf.length / 1024)).padStart(5)} KB  ${dimensions(buf)}`,
      );
    } catch (e: any) {
      console.log(`  ${profile.padEnd(22)} error ${e?.message?.slice(0, 40)}`);
    }
  }
  process.exit(0);
}

void main();
