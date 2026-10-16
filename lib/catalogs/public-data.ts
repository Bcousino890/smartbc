import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { PublicCatalogState } from "./public-contract";
import { toPublicCatalog, type InternalSnapshot } from "./to-public";
import { readCoherent, readCoherentBatch, type CatalogMeta } from "./coherent-read";
import { composeFingerprint } from "./public-fingerprint";
import { isShareToken } from "./share";
import { isCatalogFixtureMode } from "./fixture-mode";

// ============================================================================
// Lecturas de la superficie pública del catálogo (BCP-01 T6). Pasan siempre
// por las funciones de 0193 (service_role) y por to-public.ts: la instantánea
// interna nunca sale tal cual. Un token con formato raro ni llega a la base.
// En desarrollo con CATALOG_FIXTURES=1 (y solo ahí) leen del almacén sintético
// en memoria (fixture-store.ts) en lugar de la base de datos.
// K1 (§3.2/§3.3): la operación del catálogo se lee aparte con una guarda por
// catalogs.version (coherent-read.ts), y la huella pública la incluye
// (public-fingerprint.ts). Mismo camino con la BD y con el almacén sintético.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

export interface CatalogTokenState {
  valid: boolean;
  fingerprint: string | null;
  expiresAt: string | null;
  /** Lectura coherente (§3.2): este enlace no se pudo leer de forma coherente
   *  en esta pasada; el vigilante no emite nada y lo intenta en la siguiente. */
  skipped?: boolean;
}

type RawPublic = { snapshot: InternalSnapshot; fingerprint: string; expiresAt: string } | null;

/** Versión y operación de los catálogos de unos enlaces (m1/m2 de la
 *  lectura coherente). Sin filtrar por validez: eso lo decide la instantánea. */
async function shareMetas(tokens: string[]): Promise<Map<string, CatalogMeta>> {
  if (isCatalogFixtureMode()) {
    const { fixtureGetMetas } = await import("./fixture-store");
    return fixtureGetMetas(tokens);
  }
  const { data, error } = await db().from("catalog_shares").select("token, catalogs(version, criteria)").in("token", tokens);
  if (error) throw new Error(`catalog_shares: ${error.message}`);
  const out = new Map<string, CatalogMeta>();
  for (const r of (data ?? []) as any[]) {
    const c = Array.isArray(r.catalogs) ? r.catalogs[0] : r.catalogs;
    if (!c) continue;
    out.set(String(r.token), { version: Number(c.version), operation: c.criteria?.operation });
  }
  return out;
}

async function rawPublic(token: string): Promise<RawPublic> {
  if (isCatalogFixtureMode()) {
    const { fixtureGetPublic } = await import("./fixture-store");
    return fixtureGetPublic(token);
  }
  const { data, error } = await db().rpc("get_public_catalog", { p_token: token });
  if (error) throw new Error(`get_public_catalog: ${error.message}`);
  if (!data || data.valid !== true || !data.snapshot) return null;
  return { snapshot: data.snapshot as InternalSnapshot, fingerprint: String(data.fingerprint), expiresAt: String(data.expires_at) };
}

async function rawStates(tokens: string[]): Promise<Map<string, CatalogTokenState>> {
  if (isCatalogFixtureMode()) {
    const { fixtureGetStates } = await import("./fixture-store");
    return new Map(await fixtureGetStates(tokens));
  }
  const { data, error } = await db().rpc("get_catalog_states", { p_tokens: tokens });
  if (error) throw new Error(`get_catalog_states: ${error.message}`);
  const out = new Map<string, CatalogTokenState>();
  for (const row of (data ?? []) as any[]) {
    out.set(String(row.token), { valid: row.valid === true, fingerprint: row.fingerprint ?? null, expiresAt: row.expires_at ?? null });
  }
  return out;
}

/** PDF del catálogo (K1): los lectores del enlace para la captura fija, por
 *  el MISMO camino que el estado público (versión de su catálogo e instantánea
 *  pública, que ya decide la validez del enlace y la disponibilidad). */
export function linkExportReaders(token: string): {
  checkAccess: () => Promise<boolean>;
  readMeta: () => Promise<CatalogMeta | null>;
  readSnapshot: () => Promise<InternalSnapshot | null>;
} {
  return {
    checkAccess: async () => isShareToken(token),
    readMeta: async () => (await shareMetas([token])).get(token) ?? null,
    readSnapshot: async () => (await rawPublic(token))?.snapshot ?? null,
  };
}

/** Acceso + contenido público + huella. null = no disponible (inexistente,
 *  revocado, caducado o archivado: no se distingue). Lanza si falla la BD o
 *  si la operación no se puede leer de forma coherente (§3.2): nunca se
 *  sirve con otra operación ni con «venta y alquiler» por defecto. */
export async function getPublicCatalogState(token: string): Promise<PublicCatalogState | null> {
  if (!isShareToken(token)) return null;
  const r = await readCoherent({
    readMeta: async () => (await shareMetas([token])).get(token) ?? null,
    readSnapshot: () => rawPublic(token),
    isAvailable: (s) => s !== null,
  });
  if (!r.snapshot || !r.operation) return null;
  return {
    fingerprint: composeFingerprint(r.snapshot.fingerprint, r.operation),
    expiresAt: r.snapshot.expiresAt,
    catalog: toPublicCatalog(r.snapshot.snapshot, r.operation),
  };
}

/** Validez y huella de varios enlaces en una pasada (vigilante), con la
 *  lectura coherente por versión. Los que no se estabilizan salen con
 *  `skipped`; si falla la lectura de versiones, lanza (pasada perdida). */
export async function getCatalogTokenStates(tokens: string[]): Promise<Map<string, CatalogTokenState>> {
  const out = new Map<string, CatalogTokenState>();
  const valid = tokens.filter(isShareToken);
  for (const t of tokens) if (!valid.includes(t)) out.set(t, { valid: false, fingerprint: null, expiresAt: null });
  if (valid.length === 0) return out;
  const { accepted, skipped } = await readCoherentBatch(valid, {
    readMetas: shareMetas,
    readStates: rawStates,
    isAvailable: (st) => st.valid && !!st.fingerprint,
  });
  for (const [t, { state, operation }] of accepted) {
    out.set(t, operation && state.fingerprint ? { ...state, fingerprint: composeFingerprint(state.fingerprint, operation) } : state);
  }
  for (const t of skipped.keys()) out.set(t, { valid: true, fingerprint: null, expiresAt: null, skipped: true });
  if (skipped.size) console.warn(`[catalogos] vigilante: ${skipped.size} enlace(s) sin lectura coherente en esta pasada (${[...new Set(skipped.values())].join(", ")})`);
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

/** Huella pública actual (la HOME la publica en el modo medición), con la
 *  misma lectura coherente que el lector. null si no se puede leer. */
export async function getCatalogFingerprint(ownerId: string, catalogId: string): Promise<string | null> {
  try {
    const r = await readCoherent<string | null>({
      readMeta: async () => {
        const { data, error } = await db().from("catalogs").select("version, criteria").eq("id", catalogId).eq("owner_id", ownerId).maybeSingle();
        if (error) throw new Error(`catalogs: ${error.message}`);
        return data ? { version: Number(data.version), operation: data.criteria?.operation } : null;
      },
      readSnapshot: async () => {
        const { data, error } = await db().rpc("catalog_public_fingerprint", { p_actor: ownerId, p_catalog: catalogId });
        return error || typeof data !== "string" ? null : data;
      },
      isAvailable: (fp) => fp !== null,
    });
    return r.snapshot && r.operation ? composeFingerprint(r.snapshot, r.operation) : null;
  } catch (err) {
    console.warn("[catalogos] medición:", err instanceof Error ? err.message : err);
    return null;
  }
}
