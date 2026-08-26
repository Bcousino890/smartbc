// Contrato de `Range` del proxy de medios.
//
// Nace de un fallo real: el storage de origen cuelga la conexión cuando el
// rango pedido termina más allá del final del fichero (60.720 bytes +
// `bytes=0-65535` → timeout) y devuelve 500 con rangos sufijo o con un `start`
// posterior al final. Pedir de más es legal; recortar es la respuesta.
//
// Uso: npm run test:media

import { parseRangeHeader, contentRange, unsatisfiedContentRange } from "../lib/http/range";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// El fichero real que destapó el fallo.
const SIZE = 60_720;

console.log("Range · casos del contrato:");
{
  // A · rango pequeño dentro del fichero
  const a = parseRangeHeader("bytes=0-2000", SIZE);
  check("A · bytes=0-2000 sobre 60.720 → 206 con ese tramo",
    a.kind === "satisfiable" && a.start === 0 && a.end === 2000, JSON.stringify(a));

  // B · el caso que colgaba: fin más allá del final → se recorta, no se cuelga
  const b = parseRangeHeader("bytes=0-65535", SIZE);
  check("B · bytes=0-65535 se RECORTA al último byte real",
    b.kind === "satisfiable" && b.start === 0 && b.end === SIZE - 1, JSON.stringify(b));

  // C · empieza después del final → insatisfacible
  const c = parseRangeHeader("bytes=999999-", SIZE);
  check("C · start más allá del final → 416",
    c.kind === "unsatisfiable", JSON.stringify(c));
  check("C · el 416 informa del tamaño real",
    unsatisfiedContentRange(SIZE) === "bytes */60720");

  // D · sin cabecera
  check("D · sin Range → respuesta completa",
    parseRangeHeader(null, SIZE).kind === "none");

  // E · abierto por la derecha
  const e = parseRangeHeader("bytes=1000-", SIZE);
  check("E · bytes=1000- llega hasta el final",
    e.kind === "satisfiable" && e.start === 1000 && e.end === SIZE - 1, JSON.stringify(e));

  // F · sufijo (el origen devolvía 500)
  const f = parseRangeHeader("bytes=-2000", SIZE);
  check("F · bytes=-2000 son los últimos 2000 bytes",
    f.kind === "satisfiable" && f.start === SIZE - 2000 && f.end === SIZE - 1, JSON.stringify(f));
  const fBig = parseRangeHeader("bytes=-999999", SIZE);
  check("F · un sufijo mayor que el fichero devuelve el fichero entero",
    fBig.kind === "satisfiable" && fBig.start === 0 && fBig.end === SIZE - 1, JSON.stringify(fBig));
  check("F · bytes=-0 no pide nada → 416",
    parseRangeHeader("bytes=-0", SIZE).kind === "unsatisfiable");

  // G · tamaños extremos, sin corrupción de los límites
  const tiny = parseRangeHeader("bytes=0-100", 1);
  check("G · fichero de 1 byte: el rango se recorta a ese byte",
    tiny.kind === "satisfiable" && tiny.start === 0 && tiny.end === 0, JSON.stringify(tiny));
  const huge = parseRangeHeader("bytes=0-", 12_000_000);
  check("G · fichero grande abierto por la derecha llega al último byte",
    huge.kind === "satisfiable" && huge.end === 11_999_999, JSON.stringify(huge));
  const exact = parseRangeHeader(`bytes=0-${SIZE - 1}`, SIZE);
  check("G · pedir exactamente el fichero entero es satisfacible",
    exact.kind === "satisfiable" && exact.end === SIZE - 1);

  // Sintaxis rara: nunca es un error del servidor. Una cabecera vacía es
  // como no mandarla; el resto se ignora y se responde el recurso entero.
  check('cabecera vacía = como no mandar Range',
    parseRangeHeader("", SIZE).kind === "none");
  for (const raw of ["bits=0-10", "bytes=abc", "bytes=", "bytes=10-5"]) {
    const r = parseRangeHeader(raw, SIZE);
    check(`sintaxis "${raw}" no rompe (ignorada o 416)`,
      r.kind === "ignored" || r.kind === "unsatisfiable", JSON.stringify(r));
  }
  const multi = parseRangeHeader("bytes=0-100, 200-300", SIZE);
  check("varios rangos → se ignora y se responde entero (no multipart)",
    multi.kind === "ignored", JSON.stringify(multi));

  // Cabecera Content-Range bien formada
  check("Content-Range de un 206 va con el tamaño total",
    contentRange(0, 2000, SIZE) === "bytes 0-2000/60720");
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log("✅ TODO OK");
