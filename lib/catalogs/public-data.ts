import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { PublicCatalogState } from "./public-contract";
import { toPublicCatalog, type InternalSnapshot } from "./to-public";
import { isShareToken } from "./share";
import { isCatalogFixtureMode } from "./fixture-mode";

// ============================================================================
// Lecturas de la superficie pública del catálogo (BCP-01 T6). Pasan siempre
// por las funciones de 0193 (service_role) y por to-public.ts: la instantánea
// interna nunca sale tal cual. Un token con formato raro ni llega a la base.
// En desarrollo con CATALOG_FIXTURES=1 (y solo ahí) leen del almacén sintético
// en memoria (fixture-store.ts) en lugar de la base de datos.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

export interface CatalogTokenState {
  valid: boolean;
  fingerprint: string | null;
  expiresAt: string | null;
}

/** Acceso + contenido público + huella. null = no disponible (inexistente,
 *  revocado, caducado o archivado: no se distingue). Lanza si falla la BD. */
export async function getPublicCatalogState(token: string): Promise<PublicCatalogState | null> {
  if (!isShareToken(token)) return null;
  if (isCatalogFixtureMode()) {
    const { fixtureGetPublic } = await import("./fixture-store");
    const fx = await fixtureGetPublic(token);
    return fx ? { fingerprint: fx.fingerprint, expiresAt: fx.expiresAt, catalog: toPublicCatalog(fx.snapshot) } : null;
  }
  const { data, error } = await db().rpc("get_public_catalog", { p_token: token });
  if (error) throw new Error(`get_public_catalog: ${error.message}`);
  if (!data || data.valid !== true || !data.snapshot) return null;
  return {
    fingerprint: String(data.fingerprint),
    expiresAt: String(data.expires_at),
    catalog: toPublicCatalog(data.snapshot as InternalSnapshot),
  };
}

/** Validez y huella de varios enlaces en una consulta (vigilante). */
export async function getCatalogTokenStates(tokens: string[]): Promise<Map<string, CatalogTokenState>> {
  const out = new Map<string, CatalogTokenState>();
  const valid = tokens.filter(isShareToken);
  for (const t of tokens) if (!valid.includes(t)) out.set(t, { valid: false, fingerprint: null, expiresAt: null });
  if (valid.length === 0) return out;
  if (isCatalogFixtureMode()) {
    const { fixtureGetStates } = await import("./fixture-store");
    for (const [t, st] of await fixtureGetStates(valid)) out.set(t, st);
    return out;
  }
  const { data, error } = await db().rpc("get_catalog_states", { p_tokens: valid });
  if (error) throw new Error(`get_catalog_states: ${error.message}`);
  for (const row of (data ?? []) as any[]) {
    out.set(String(row.token), {
      valid: row.valid === true,
      fingerprint: row.fingerprint ?? null,
      expiresAt: row.expires_at ?? null,
    });
  }
  return out;
}

export interface OwnerShare {
  token: string;
  expiresAt: string;
  expired: boolean;
}

/** Enlace vigente (no revocado) de un catálogo del dueño, caducado o no. */
export async function getCatalogShare(ownerId: string, catalogId: string): Promise<OwnerShare | null> {
  const { data: cat } = await db().from("catalogs").select("id").eq("id", catalogId).eq("owner_id", ownerId).maybeSingle();
  if (!cat) return null;
  const { data } = await db()
    .from("catalog_shares")
    .select("token, expires_at")
    .eq("catalog_id", catalogId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    token: String(data.token),
    expiresAt: String(data.expires_at),
    expired: new Date(data.expires_at).getTime() <= Date.now(),
  };
}

/** Huella pública actual (la HOME la publica en el modo medición). */
export async function getCatalogFingerprint(ownerId: string, catalogId: string): Promise<string | null> {
  const { data, error } = await db().rpc("catalog_public_fingerprint", { p_actor: ownerId, p_catalog: catalogId });
  if (error || typeof data !== "string") return null;
  return data;
}
