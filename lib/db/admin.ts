import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cliente con service role (GoTrue + PostgREST + Storage del VPS).
 *
 * `timeoutMs` (opcional) pone un tope a CADA petición que haga el cliente. Por
 * defecto no hay ninguno — este mismo cliente sube vídeos de cientos de MB —,
 * así que solo lo pasan las rutas que contestan a un formulario y no pueden
 * quedarse colgadas esperando a GoTrue (ver app/api/admin/usuarios/create).
 * Un timeout no se lanza: supabase-js lo devuelve en `error` como cualquier
 * otro fallo de red.
 */
export function createAdminClient(options?: { timeoutMs?: number }) {
  const timeoutMs = options?.timeoutMs;
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      ...(timeoutMs ? { global: { fetch: fetchWithTimeout(timeoutMs) } } : {}),
    }
  );
}

function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    // Si quien llama ya trae su propia señal (`.abortSignal()` de postgrest),
    // se respetan las dos.
    const signal =
      init?.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([init.signal, timeout])
        : (init?.signal ?? timeout);
    return fetch(input, { ...init, signal });
  };
}
