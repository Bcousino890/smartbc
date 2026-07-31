import type { Database } from "@/lib/db/database.types";

export type ApiClientRow = Database["public"]["Tables"]["api_clients"]["Row"];
export type ApiKeyRow = Database["public"]["Tables"]["api_keys"]["Row"];

/** Permisos que puede llevar una clave. Se validan endpoint a endpoint. */
export const API_SCOPES = [
  "captaciones:read",
  "captaciones:write",
  "catalogos:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/** Contexto que recibe cada handler tras pasar auth, rate limit y validación. */
export type ApiContext = {
  requestId: string;
  client: ApiClientRow;
  key: ApiKeyRow;
  /** Segmentos dinámicos de la ruta, ya resueltos (Next 15 los da como Promise). */
  params: Record<string, string>;
  /** Query string de la petición. */
  searchParams: URLSearchParams;
  /** `true` si la petición pidió simulación (no debe escribir nada). */
  dryRun: boolean;
  /** Cabecera Idempotency-Key, si vino. */
  idempotencyKey: string | null;
  /** Contadores que el handler puede rellenar; se guardan en `api_requests`. */
  counters: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
  };
};
