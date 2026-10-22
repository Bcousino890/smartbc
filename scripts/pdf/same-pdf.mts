// SOLO VERIFICACIÓN LOCAL (BCP-01 ampliación, PR5). ¿Son el mismo PDF dos
// archivos maquetados con la misma entrada? Compara, objeto a objeto, el PDF
// entero con los flujos descomprimidos, quitando solo lo que cambia en cada
// generación: la fecha de creación, el /ID y el prefijo aleatorio de los
// subconjuntos de fuente (ABCDEF+). Si todo lo demás coincide, los dos PDF son
// byte a byte equivalentes (mismas páginas, texto, posiciones, fuentes,
// imágenes y enlaces). Sin red.
//
//   node --experimental-strip-types scripts/pdf/same-pdf.mts <carpeta-a> <carpeta-b> [archivo…]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

/** Objetos del PDF (número → texto con el flujo descomprimido) y nº de páginas. */
export function pdfObjects(buf: Buffer): { objects: Map<number, string>; pages: number } {
  const s = buf.toString("latin1");
  const objects = new Map<number, string>();
  const re = /(\d+) 0 obj\s*([\s\S]*?)\bendobj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let body = m[2];
    const st = body.indexOf("stream");
    if (st >= 0 && /\/FlateDecode/.test(body.slice(0, st))) {
      const start = m.index + m[0].indexOf(m[2]) + st + "stream".length + (s[m.index + m[0].indexOf(m[2]) + st + 6] === "\r" ? 2 : 1);
      const end = s.indexOf("endstream", start);
      try {
        body = body.slice(0, st) + "stream\n" + inflateSync(buf.subarray(start, end)).toString("latin1");
      } catch {
        /* se compara tal cual */
      }
    }
    objects.set(Number(m[1]), normalize(body));
  }
  return { objects, pages: (s.match(/\/Type \/Page\b/g) ?? []).length };
}

const normalize = (t: string) =>
  t
    .replace(/\(D:\d{14}(?:Z|[+-]\d\d'?\d\d'?)?\)/g, "(D:)")
    .replace(/\/(BaseFont|FontName) \/[A-Z]{6}\+/g, "/$1 /")
    .replace(/\/Length \d+/g, "/Length");

export function samePdf(a: Buffer, b: Buffer): { same: boolean; pages: [number, number]; diffs: string[] } {
  const A = pdfObjects(a);
  const B = pdfObjects(b);
  const diffs: string[] = [];
  if (A.pages !== B.pages) diffs.push(`páginas ${A.pages} ≠ ${B.pages}`);
  if (A.objects.size !== B.objects.size) diffs.push(`objetos ${A.objects.size} ≠ ${B.objects.size}`);
  for (const [n, body] of A.objects) {
    if (B.objects.get(n) !== body) diffs.push(`objeto ${n} distinto (${body.slice(0, 60).replace(/\s+/g, " ")}…)`);
  }
  // El trailer (/ID) cambia en cada generación: no se compara.
  return { same: diffs.length === 0, pages: [A.pages, B.pages], diffs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [da, db, ...only] = process.argv.slice(2);
  const files = only.length ? only : readdirSync(da).filter((f) => f.endsWith(".pdf")).sort();
  let bad = 0;
  for (const f of files) {
    const r = samePdf(readFileSync(join(da, f)), readFileSync(join(db, f)));
    if (!r.same) bad++;
    console.log(`  ${r.same ? "✅" : "❌"} ${f}: ${r.pages[0]} / ${r.pages[1]} páginas${r.same ? ", idénticos (sin fecha, /ID ni prefijo de subconjunto)" : ` — ${r.diffs.slice(0, 4).join(" | ")}`}`);
  }
  console.log(bad ? `\n❌ ${bad} distinto(s)` : `\n✅ ${files.length} PDF idénticos`);
  process.exit(bad ? 1 : 0);
}
