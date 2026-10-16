/**
 * Piezas PURAS de las acciones de infraestructura (confirmación y candado), sin
 * acceso a datos para poder probarlas con `npm run test:infra-action`. La
 * auditoría vive en `infra-action.ts` (necesita la base de datos).
 */

export const INFRA_CONFIRMATION = {
  migrations: "APLICAR MIGRACIONES",
  deploy: "REINTENTAR DESPLIEGUE",
} as const;

export type InfraActionName = "migrations_apply" | "deploy_retry";

/** ¿El cuerpo JSON trae la frase de confirmación exacta? */
export async function hasConfirmation(req: Request, expected: string): Promise<boolean> {
  try {
    const body = (await req.json()) as { confirm?: unknown } | null;
    return body?.confirm === expected;
  } catch {
    return false;
  }
}

// Candado en memoria (PM2 de un solo proceso): evita lanzamientos solapados.
const running = new Map<InfraActionName, number>();
const LOCK_MS = 10 * 60 * 1000;

/** Intenta tomar el candado de la acción; false si ya hay una en curso (< 10 min). */
export function tryLockInfraAction(action: InfraActionName): boolean {
  const since = running.get(action);
  if (since && Date.now() - since < LOCK_MS) return false;
  running.set(action, Date.now());
  return true;
}

export function releaseInfraAction(action: InfraActionName): void {
  running.delete(action);
}

