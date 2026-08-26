import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { ApiClientRow, ApiKeyRow } from "@/lib/api/types";

/**
 * Consultas del panel de integraciones (/admin/integraciones).
 *
 * Todo degrada a vacío si las tablas todavía no existen: en este despliegue el
 * VPS reinicia la app ANTES de aplicar migraciones, así que la página tiene que
 * aguantar unos minutos sin esquema en vez de romperse.
 */

export type ApiClientSummary = ApiClientRow & {
  keys_active: number;
  last_request_at: string | null;
  requests_24h: number;
  errors_24h: number;
  captaciones_total: number;
};

export type ApiKeySummary = Omit<ApiKeyRow, "key_hash">;

export type ApiRequestSummary = {
  id: string;
  request_id: string | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  dry_run: boolean;
  idempotency_key: string | null;
  items_total: number;
  items_created: number;
  items_updated: number;
  items_unchanged: number;
  items_removed: number;
  items_failed: number;
  request_body: unknown;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any;
}

export async function getApiClients(country?: string): Promise<ApiClientSummary[]> {
  try {
    const db = admin();
    let query = db.from("api_clients").select("*").order("created_at", { ascending: false });
    if (country) query = query.eq("country", country);

    const { data: clients, error } = await query;
    if (error || !clients) return [];

    const ids = clients.map((c: ApiClientRow) => c.id);
    if (ids.length === 0) return [];

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [{ data: keys }, { data: requests }, { data: captaciones }] = await Promise.all([
      db.from("api_keys").select("client_id, revoked_at").in("client_id", ids),
      db
        .from("api_requests")
        .select("api_client_id, status_code, created_at")
        .in("api_client_id", ids)
        .gte("created_at", since),
      db.from("captaciones").select("api_client_id").in("api_client_id", ids),
    ]);

    // Última petición de cada cliente, fuera de la ventana de 24 h.
    const { data: lastRequests } = await db
      .from("api_requests")
      .select("api_client_id, created_at")
      .in("api_client_id", ids)
      .order("created_at", { ascending: false })
      .limit(500);

    return clients.map((client: ApiClientRow) => {
      const clientRequests = (requests ?? []).filter(
        (r: { api_client_id: string }) => r.api_client_id === client.id
      );
      return {
        ...client,
        keys_active: (keys ?? []).filter(
          (k: { client_id: string; revoked_at: string | null }) =>
            k.client_id === client.id && !k.revoked_at
        ).length,
        last_request_at:
          (lastRequests ?? []).find(
            (r: { api_client_id: string }) => r.api_client_id === client.id
          )?.created_at ?? null,
        requests_24h: clientRequests.length,
        errors_24h: clientRequests.filter(
          (r: { status_code: number | null }) => (r.status_code ?? 0) >= 400
        ).length,
        captaciones_total: (captaciones ?? []).filter(
          (c: { api_client_id: string | null }) => c.api_client_id === client.id
        ).length,
      };
    });
  } catch (err) {
    console.error("[getApiClients]", err);
    return [];
  }
}

export async function getApiClientBySlug(slug: string): Promise<ApiClientRow | null> {
  try {
    const { data } = await admin()
      .from("api_clients")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    return data ?? null;
  } catch (err) {
    console.error("[getApiClientBySlug]", err);
    return null;
  }
}

export async function getApiKeysForClient(clientId: string): Promise<ApiKeySummary[]> {
  try {
    const { data } = await admin()
      .from("api_keys")
      // `key_hash` no sale nunca del servidor.
      .select("id, client_id, label, key_prefix, last_four, scopes, rate_limit_per_minute, expires_at, last_used_at, revoked_at, created_by, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    return data ?? [];
  } catch (err) {
    console.error("[getApiKeysForClient]", err);
    return [];
  }
}

export async function getApiRequests(
  clientId: string,
  limit = 50,
  onlyErrors = false
): Promise<ApiRequestSummary[]> {
  try {
    let query = admin()
      .from("api_requests")
      .select("*")
      .eq("api_client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (onlyErrors) query = query.gte("status_code", 400);
    const { data } = await query;
    return data ?? [];
  } catch (err) {
    console.error("[getApiRequests]", err);
    return [];
  }
}

/** Staff al que se puede asignar como firmante de una integración. */
export async function getSigningCandidates(): Promise<
  { id: string; full_name: string | null; email: string | null; role: string }[]
> {
  try {
    const { data } = await admin()
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true });
    return data ?? [];
  } catch (err) {
    console.error("[getSigningCandidates]", err);
    return [];
  }
}
