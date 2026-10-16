import { createHash } from "node:crypto";
import { CoherentReadError, readCoherent, type CatalogMeta } from "../coherent-read";
import type { CatalogOperation } from "../operation-price";

// ============================================================================
// PDF del catálogo · captura fija (K1). Puro: los lectores llegan inyectados,
// así que se prueba con guiones (scripts/test-catalogs-public.mts).
//
// La huella H describe EXACTAMENTE lo capturado: es el sha-256 del JSON
// canónico (claves ordenadas) de la instantánea S y de su operación, que
// corresponde a S porque la lectura coherente la rodea (versión → S →
// versión). No se pide ninguna huella aparte, así que no hay hueco entre
// capturar y calcularla. La instantánea lleva los datos de las propiedades y
// la versión `u` de cada foto: H cambia también con los cambios en fichas y
// fotos compartidas que NO suben catalogs.version.
// La comprobación final vuelve a capturar con el mismo camino (acceso
// incluido) y compara H2 con H1.
// ============================================================================

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export function captureHash(snapshot: unknown, operation: CatalogOperation): string {
  return createHash("sha256").update(`${operation}\n${canonical(snapshot)}`).digest("hex");
}

export interface CaptureDeps<S> {
  /** ¿Sigue autorizado este ámbito? (dueño de la HOME y del catálogo, o
   *  formato de enlace válido; la validez del enlace la decide S). */
  checkAccess: () => Promise<boolean>;
  readMeta: () => Promise<CatalogMeta | null>;
  /** null = no disponible para este ámbito (enlace caducado, revocado,
   *  catálogo archivado para el cliente, catálogo inexistente o ajeno). */
  readSnapshot: () => Promise<S | null>;
}

export interface Captured<S> {
  snapshot: S;
  operation: CatalogOperation;
  hash: string;
}

/** Captura S1 + operación + H1, o null si el ámbito ya no tiene acceso. Lanza
 *  CoherentReadError si no se estabiliza. */
export async function captureFixed<S>(deps: CaptureDeps<S>): Promise<Captured<S> | null> {
  if (!(await deps.checkAccess())) return null;
  const r = await readCoherent<S | null>({ readMeta: deps.readMeta, readSnapshot: deps.readSnapshot, isAvailable: (s) => s !== null });
  if (r.snapshot === null || r.operation === null) return null;
  // Copia propia: S1 no puede cambiar después de capturada (el almacén de
  // desarrollo devuelve referencias; la BD, objetos nuevos).
  const snapshot = structuredClone(r.snapshot);
  return { snapshot, operation: r.operation, hash: captureHash(snapshot, r.operation) };
}

export type FinalCheck = "ok" | "changed" | "gone";

/** ¿El contenido se movía mientras se leía? (cualquier otro fallo es de la
 *  base de datos: 503, no 409). */
export function isUnstableRead(err: unknown): boolean {
  return err instanceof CoherentReadError && err.code === "catalog_read_unstable";
}

/** Comprobación final, por cada petición que va a recibir los bytes (K2).
 *  Lanza si la base de datos falla. */
export async function verifyFixed<S>(deps: CaptureDeps<S>, hash: string): Promise<FinalCheck> {
  let again: Captured<S> | null;
  try {
    again = await captureFixed(deps);
  } catch (err) {
    if (isUnstableRead(err)) return "changed";
    throw err;
  }
  if (!again) return "gone";
  return again.hash === hash ? "ok" : "changed";
}
