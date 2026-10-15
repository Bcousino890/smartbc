import type { CatalogOperation } from "./operation-price";

// ============================================================================
// Lectura coherente de la operación de un catálogo y su instantánea (BCP-01
// K1; plan §3.2, D-QA15/D-QA16). Pura: los lectores llegan inyectados, así que
// se prueba con guiones (scripts/test-catalogs-public.mts, V1–V11).
//
// La instantánea SQL no lleva los criterios, así que la operación se lee
// aparte. Para saber que las dos lecturas corresponden se usa catalogs.version:
// cada escritura de gestión la sube en 1 en la misma sentencia y nunca baja
// (verificado en scripts/sql/test-catalog-operations.sql). Por intento:
//   m1 = versión y operación → s = instantánea → m2 = versión otra vez.
// Si m1.version = m2.version no hubo ningún cambio entre medias y s vio los
// criterios de m1. Comparar solo la operación no basta: A→B→A da la misma
// operación con la instantánea de B en medio.
//
//   · versiones distintas → otro intento, hasta COHERENT_ATTEMPTS; agotados,
//     catalog_read_unstable;
//   · error al leer m1 o m2, u operación que no es sale|rent|any →
//     catalog_operation_unreadable, sin reintento;
//   · NUNCA se cae en «any»: eso cambiaría etiquetas y huella sin que nadie
//     hubiera cambiado nada;
//   · la validez del enlace la decide s, como siempre.
// ============================================================================

export const COHERENT_ATTEMPTS = 3;

export interface CatalogMeta {
  version: number;
  /** Tal cual viene de criteria->operation; se valida aquí. */
  operation: unknown;
}

export type CoherentReadCode = "catalog_operation_unreadable" | "catalog_read_unstable";

export class CoherentReadError extends Error {
  readonly code: CoherentReadCode;
  constructor(code: CoherentReadCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "CoherentReadError";
    this.code = code;
  }
}

export function parseCatalogOperation(v: unknown): CatalogOperation | null {
  return v === "sale" || v === "rent" || v === "any" ? v : null;
}

async function readMetaOrFail<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    throw new CoherentReadError("catalog_operation_unreadable", err instanceof Error ? err.message : String(err));
  }
}

function checkedOperation(m: CatalogMeta | null | undefined): CatalogOperation | null {
  if (!m) return null;
  const op = parseCatalogOperation(m.operation);
  if (op === null) throw new CoherentReadError("catalog_operation_unreadable", "operación no válida");
  return op;
}

/** Un catálogo (carga del lector y medición). `operation` es null solo si
 *  la instantánea dice que no está disponible. */
export async function readCoherent<S>(deps: {
  readMeta: () => Promise<CatalogMeta | null>;
  readSnapshot: () => Promise<S>;
  isAvailable: (s: S) => boolean;
  attempts?: number;
}): Promise<{ snapshot: S; operation: CatalogOperation | null; attempts: number }> {
  const max = deps.attempts ?? COHERENT_ATTEMPTS;
  for (let attempt = 1; attempt <= max; attempt++) {
    const m1 = await readMetaOrFail(deps.readMeta);
    const op = checkedOperation(m1);
    const snapshot = await deps.readSnapshot();
    if (!deps.isAvailable(snapshot)) return { snapshot, operation: null, attempts: attempt };
    const m2 = await readMetaOrFail(deps.readMeta);
    checkedOperation(m2);
    if (m1 && m2 && op !== null && m1.version === m2.version) return { snapshot, operation: op, attempts: attempt };
  }
  throw new CoherentReadError("catalog_read_unstable", `${max} intentos`);
}

/** Varios catálogos a la vez (vigilante): una lectura de versiones antes y
 *  otra después, para todos. Solo se reintentan los que cambiaron; los que no
 *  se estabilizan (o traen una operación no válida) se saltan en esta pasada.
 *  Un error al leer las versiones hace fallar la pasada entera. */
export async function readCoherentBatch<S>(
  keys: string[],
  deps: {
    readMetas: (keys: string[]) => Promise<Map<string, CatalogMeta>>;
    readStates: (keys: string[]) => Promise<Map<string, S>>;
    isAvailable: (s: S) => boolean;
    attempts?: number;
  },
): Promise<{ accepted: Map<string, { state: S; operation: CatalogOperation | null }>; skipped: Map<string, CoherentReadCode> }> {
  const max = deps.attempts ?? COHERENT_ATTEMPTS;
  const accepted = new Map<string, { state: S; operation: CatalogOperation | null }>();
  const skipped = new Map<string, CoherentReadCode>();
  let pending = [...new Set(keys)];
  for (let attempt = 1; attempt <= max && pending.length > 0; attempt++) {
    const m1 = await readMetaOrFail(() => deps.readMetas(pending));
    const states = await deps.readStates(pending);
    const m2 = await readMetaOrFail(() => deps.readMetas(pending));
    const next: string[] = [];
    for (const k of pending) {
      const st = states.get(k);
      if (st === undefined) continue;
      if (!deps.isAvailable(st)) {
        accepted.set(k, { state: st, operation: null });
        continue;
      }
      const a = m1.get(k);
      const b = m2.get(k);
      const opA = a ? parseCatalogOperation(a.operation) : null;
      const opB = b ? parseCatalogOperation(b.operation) : null;
      if ((a && opA === null) || (b && opB === null)) {
        skipped.set(k, "catalog_operation_unreadable");
        continue;
      }
      if (a && b && opA !== null && a.version === b.version) accepted.set(k, { state: st, operation: opA });
      else next.push(k);
    }
    pending = next;
  }
  for (const k of pending) skipped.set(k, "catalog_read_unstable");
  return { accepted, skipped };
}
