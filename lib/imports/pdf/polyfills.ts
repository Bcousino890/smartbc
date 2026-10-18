// Polyfills que el build «legacy» de pdf.js NO trae y Safari necesita
// (BCP-01, importar desde PDF). pdf.js 5 lee el texto de cada página con
// `for await (const value of readableStream)`, y Safari (al menos hasta la 18)
// no implementa el recorrido asíncrono de ReadableStream: fallaba con
// «undefined is not a function (near '...value of readableStream...')».
// Es el comportamiento estándar (Streams: ReadableStream.prototype.values).

type RSProto = { getReader(): { read(): Promise<{ done: boolean; value?: unknown }>; cancel(r?: unknown): Promise<void>; releaseLock(): void } };

/** Añade ReadableStream.prototype[Symbol.asyncIterator] y .values si faltan. Devuelve true si los añadió. */
export function installReadableStreamAsyncIterator(RS: { prototype: object } | undefined = (globalThis as { ReadableStream?: { prototype: object } }).ReadableStream): boolean {
  if (!RS) return false;
  const proto = RS.prototype as Record<PropertyKey, unknown>;
  if (typeof proto[Symbol.asyncIterator] === "function") return false;
  async function* values(this: RSProto, opts?: { preventCancel?: boolean }) {
    const reader = this.getReader();
    let finished = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          return;
        }
        yield value;
      }
    } finally {
      // Si se sale antes de terminar (break/throw), se cancela como manda el estándar.
      if (!finished && !opts?.preventCancel) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  if (typeof proto.values !== "function") Object.defineProperty(proto, "values", { value: values, writable: true, configurable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: proto.values, writable: true, configurable: true });
  return true;
}
