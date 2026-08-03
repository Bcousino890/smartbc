import "server-only";
import { getCapSolverApiKey } from "./capsolver-config";

const DEFAULT_MIN_BALANCE_USD = Number(process.env.PARTICULARES_MIN_CAPSOLVER_BALANCE ?? "2");

export type CapSolverGuardResult =
  | { blocked: false }
  | { blocked: true; balance: number; min: number };

/**
 * Chequea el saldo de CapSolver ANTES de arrancar un lote de búsquedas de
 * teléfono (CapSolver solo se gasta cuando DataDome devuelve un slider
 * resoluble — ver fetchIdealistaPhoneViaAjax). Si el saldo se puede leer y
 * está por debajo del mínimo, bloquea para no fundirlo sin avisar en un
 * barrido masivo. Si no se puede leer (API caída, key no configurada), NO
 * bloquea — mismo criterio tolerante que ya usaba proxy-health.
 *
 * Antes solo existía inline en refresh-phones/route.ts; verify-phones y el
 * backfill del cron (el de mayor volumen, corre cada hora) no tenían
 * ninguna guardia.
 */
export async function checkCapSolverBalanceGuard(
  minUsd: number = DEFAULT_MIN_BALANCE_USD,
): Promise<CapSolverGuardResult> {
  try {
    const key = await getCapSolverApiKey();
    if (!key) return { blocked: false };
    const res = await fetch("https://api.capsolver.com/getBalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: key }),
    });
    const data = (await res.json()) as { balance?: number; errorId?: number };
    if (data.errorId === 0 && typeof data.balance === "number" && data.balance < minUsd) {
      return { blocked: true, balance: data.balance, min: minUsd };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}
