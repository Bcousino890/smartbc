// Cabecera `Range` según RFC 9110 §14. Puro y testeable.
//
// Existe porque el storage de origen la maneja mal y lo pagábamos nosotros:
// con un fichero de 60.720 bytes, `Range: bytes=0-60719` responde 206 en
// 270ms, pero `bytes=0-60720` —un solo byte más allá del final— deja la
// conexión colgada hasta el timeout, y un `start` posterior al final o un
// rango sufijo devuelven 500. Un navegador pidiendo de más es normal y
// perfectamente legal; la respuesta correcta es recortar, no colgarse.
//
// Nuestro proxy parsea aquí, decide, y solo pide aguas arriba rangos que ya
// sabe satisfacibles.

export type RangeResult =
  | { kind: "none" }
  /** Rango válido y ya recortado al tamaño real. */
  | { kind: "satisfiable"; start: number; end: number }
  /** 416: hay que responder con `Content-Range: bytes *​/<size>`. */
  | { kind: "unsatisfiable" }
  /** Sintaxis que no entendemos o rangos múltiples: se ignora (RFC: 200). */
  | { kind: "ignored" };

/**
 * @param header  valor de la cabecera `Range` (o null)
 * @param size    tamaño real del recurso en bytes
 *
 * Reglas que importan:
 *  · `bytes=0-99`      → 0..99, recortado a size-1 si se pasa;
 *  · `bytes=100-`      → 100..size-1 (abierto por la derecha);
 *  · `bytes=-500`      → los últimos 500 bytes (sufijo);
 *  · `start >= size`   → insatisfacible (416);
 *  · `bytes=-0`        → insatisfacible;
 *  · varios rangos     → se ignora y se responde entero (200): un multipart
 *                        no aporta nada aquí y sí complica.
 */
export function parseRangeHeader(header: string | null, size: number): RangeResult {
  if (!header) return { kind: "none" };
  if (!Number.isFinite(size) || size <= 0) return { kind: "ignored" };

  const match = /^bytes\s*=\s*(.+)$/i.exec(header.trim());
  if (!match) return { kind: "ignored" };

  const spec = match[1].trim();
  if (spec.includes(",")) return { kind: "ignored" };

  const parts = /^(\d*)-(\d*)$/.exec(spec);
  if (!parts) return { kind: "ignored" };

  const [, rawStart, rawEnd] = parts;
  if (rawStart === "" && rawEnd === "") return { kind: "ignored" };

  // Sufijo: los últimos N bytes.
  if (rawStart === "") {
    const suffix = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return { kind: "unsatisfiable" };
    const start = Math.max(0, size - suffix);
    return { kind: "satisfiable", start, end: size - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  if (!Number.isFinite(start) || start >= size) return { kind: "unsatisfiable" };

  // Abierto por la derecha, o recortado al final real: pedir de más es legal.
  const end = rawEnd === "" ? size - 1 : Math.min(Number.parseInt(rawEnd, 10), size - 1);
  if (!Number.isFinite(end) || end < start) return { kind: "unsatisfiable" };

  return { kind: "satisfiable", start, end };
}

/** Valor de `Content-Range` para una respuesta 206. */
export function contentRange(start: number, end: number, size: number): string {
  return `bytes ${start}-${end}/${size}`;
}

/** Valor de `Content-Range` para un 416. */
export function unsatisfiedContentRange(size: number): string {
  return `bytes */${size}`;
}
