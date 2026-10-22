// SOLO VERIFICACIÓN LOCAL (PR7b · acabado fotográfico en el PDF). Genera PDF
// REALES de las fixtures por el mismo camino que el servidor (captura fija,
// fotos por clave, hilo del documento), sin y con el acabado, y comprueba:
//   · mismas páginas y mismo número de fotos incrustadas;
//   · con el acabado, cada foto incrustada es otra (tratada) salvo la marcada
//     «sin acabado», que es EXACTAMENTE la misma que sin acabado;
//   · el filete vectorial (trazo blanco con opacidad 0,28 en la portada y 0,38
//     en las aperturas) solo aparece con el acabado;
//   · el peso del PDF antes y después.
//
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs --import ./scripts/pdf/engine-patch-hook.mjs \
//     scripts/pdf/check-catalog-pdf-finish.mts <carpeta-salida>
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { exportCatalogPdf } from "../../lib/catalogs/export/generate.ts";
import { FIXTURE_TOKENS, fixtureMutate } from "../../lib/catalogs/fixture-store.ts";

const out = process.argv[2] ?? "/tmp/pdf-finish";
mkdirSync(out, { recursive: true });
let fails = 0;
const ok = (n: string, c: unknown, e = "") => {
  if (!c) fails++;
  console.log(`  ${c ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`);
};

function inspect(buf: Buffer) {
  const s = buf.toString("latin1");
  const re = /(\d+) 0 obj\b/g;
  const images: string[] = [];
  let pages = 0;
  const alphas = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endobj", start);
    const body = s.slice(start, end);
    const st = body.search(/\bstream\r?\n/);
    const head = st >= 0 ? body.slice(0, st) : body;
    if (/\/Type \/Page\b/.test(head)) pages++;
    for (const a of head.matchAll(/\/CA ([\d.]+)/g)) alphas.add(a[1]);
    if (st >= 0 && /\/Subtype \/Image/.test(head) && /\/DCTDecode/.test(head)) {
      const dataStart = start + st + body.slice(st).match(/^stream\r?\n/)![0].length;
      const raw = buf.subarray(dataStart, s.lastIndexOf("endstream", end));
      images.push(createHash("md5").update(/\/FlateDecode/.test(head) ? inflateSync(raw) : raw).digest("hex"));
    }
    re.lastIndex = end;
  }
  return { pages, images, alphas };
}

for (const [name, token, item, photo] of [
  ["main", FIXTURE_TOKENS.main, "fxKeyAtico01", "21548ba101e27bcf"],
  ["pdf", FIXTURE_TOKENS.pdf, "fxPdfDesc0002", createHash("md5").update("pdf-photo:pdf-descripcion:1").digest("hex").slice(0, 16)],
] as const) {
  await fixtureMutate({ op: "reset" });
  const a = await exportCatalogPdf({ kind: "link", token }, new AbortController().signal);
  await fixtureMutate({ op: "finish", token, on: true, n: { [item]: [photo] } });
  const b = await exportCatalogPdf({ kind: "link", token }, new AbortController().signal);
  if (!a.ok || !b.ok) {
    ok(`${name}: los dos PDF se generan`, false);
    continue;
  }
  writeFileSync(`${out}/${name}-sin-acabado.pdf`, a.pdf);
  writeFileSync(`${out}/${name}-con-acabado.pdf`, b.pdf);
  const A = inspect(a.pdf);
  const B = inspect(b.pdf);
  const same = B.images.filter((h) => A.images.includes(h));
  console.log(`· ${name}: ${A.pages} → ${B.pages} páginas · ${A.images.length} → ${B.images.length} fotos · ${(a.pdf.length / 1024).toFixed(0)} → ${(b.pdf.length / 1024).toFixed(0)} KB`);
  ok(`${name}: mismas páginas con y sin acabado`, A.pages === B.pages && A.pages > 0, `${A.pages} / ${B.pages}`);
  ok(`${name}: mismas fotos incrustadas (número)`, A.images.length === B.images.length && A.images.length > 0, `${A.images.length} / ${B.images.length}`);
  ok(`${name}: con acabado, todas las fotos tratadas salvo la marcada «sin acabado» (idéntica)`, same.length >= 1 && same.length <= 2 && new Set(same).size === 1, `${same.length} iguales`);
  ok(`${name}: filete vectorial solo con el acabado (opacidad 0,28 portada y 0,38 apertura)`, !A.alphas.has("0.28") && !A.alphas.has("0.38") && B.alphas.has("0.28") && B.alphas.has("0.38"), `${[...A.alphas].join(",")} | ${[...B.alphas].join(",")}`);
  ok(`${name}: el PDF con acabado pesa como mucho un 15 % más`, b.pdf.length <= a.pdf.length * 1.15, `${a.pdf.length} → ${b.pdf.length}`);
}
await fixtureMutate({ op: "reset" });
console.log(fails ? `❌ ${fails} fallos` : "✅ PDF con acabado: todo en verde");
process.exit(fails ? 1 : 0);
