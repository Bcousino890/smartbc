import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { snapshotLang } from "./i18n";
import { isCatalogFixtureMode } from "./fixture-mode";
import { isShareToken } from "./share";
import type { InternalSnapshot } from "./to-public";
import { isTargetLanguage, TRANSLATION_TIMEOUT_MS, type TargetLanguage } from "./translations";
import { AutoTranslator, type AutoDeps, type AutoRunSummary, type AutoTarget } from "./auto-translate";

// ============================================================================
// La instancia ÚNICA del traductor automático en este proceso (como el
// vigilante, sync-hub-instance.ts: PM2 de un solo proceso; en globalThis para
// que la recarga en caliente no deje traductores huérfanos). Las lecturas
// públicas llaman a `requestAutoTranslation` SIN esperarla; el trabajo corre
// en segundo plano con la IA configurada (aiComplete) o, en los fixtures, con
// la IA FALSA que cuenta llamadas. Si el proceso se reinicia a mitad, la
// reserva caduca (300 s) y la siguiente visita lo reintenta tras la espera.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEY = "__bcpCatalogAutoTranslator";
type G = typeof globalThis & { [KEY]?: AutoTranslator };

const db = () => createAdminClient() as any;

/** Token → catálogo, dueño e idioma, con las MISMAS condiciones que
 *  get_public_catalog (enlace sin revocar ni caducar y catálogo activo). */
async function resolveToken(token: string): Promise<AutoTarget | null> {
  if (!isShareToken(token)) return null;
  const cols = "catalog_id, expires_at, revoked_at, catalogs(owner_id, status, default_lang)";
  const [shares, personal] = await Promise.all([
    db().from("catalog_shares").select(cols).eq("token", token).maybeSingle(),
    db().from("catalog_client_links").select(`${cols}, lang`).eq("token", token).maybeSingle(),
  ]);
  if (shares.error) throw new Error(`catalog_shares: ${shares.error.message}`);
  if (personal.error) throw new Error(`catalog_client_links: ${personal.error.message}`);
  const row = (shares.data ?? personal.data) as any;
  if (!row) return null;
  const c = Array.isArray(row.catalogs) ? row.catalogs[0] : row.catalogs;
  if (!c || c.status !== "active" || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  const lang = snapshotLang(row.lang ?? c.default_lang);
  return isTargetLanguage(lang) ? { catalogId: String(row.catalog_id), ownerId: String(c.owner_id), lang } : null;
}

function realDeps(): AutoDeps {
  return {
    resolve: resolveToken,
    backend: async (ownerId) => (await import("./translation-data")).sqlTranslations(ownerId),
    ai: (o) => aiComplete(o),
    isNotConfigured: (e) => e instanceof AINotConfiguredError,
    timeoutMs: TRANSLATION_TIMEOUT_MS,
    notify: () => {
      void import("./sync-hub-instance").then((m) => m.notifyCatalogChanged()).catch(() => {});
    },
    log: (m) => console.warn(m),
  };
}

function fixtureDeps(): AutoDeps {
  return {
    resolve: async (token) => (await import("./fixture-store")).fixtureAutoTarget(token),
    backend: async () => (await (await import("./fixture-store")).fixtureTranslations()).mem,
    // SOLO DESARROLLO: la IA FALSA de los fixtures (cuenta llamadas).
    ai: async (o) => (await (await import("./fixture-store")).fixtureTranslations()).ai.ai(o),
    timeoutMs: 20_000,
    notify: () => {
      void import("./sync-hub-instance").then((m) => m.notifyCatalogChanged()).catch(() => {});
    },
    log: (m) => console.warn(m),
  };
}

export function autoTranslator(): AutoTranslator {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = new AutoTranslator(isCatalogFixtureMode() ? fixtureDeps() : realDeps());
  return g[KEY]!;
}

/** Fixtures: empezar de cero (lo usa el «reset» del almacén sintético). */
export function resetAutoTranslator(): void {
  (globalThis as G)[KEY] = undefined;
}

/** Lectura pública en un idioma: traduce lo que falte EN SEGUNDO PLANO.
 *  Nunca lanza y nunca hace esperar a quien lee. */
export function requestAutoTranslation(token: string, snapshot: InternalSnapshot | null | undefined): void {
  try {
    autoTranslator().request(token, snapshot);
  } catch (err) {
    console.warn("[catalogos] traducción automática:", err instanceof Error ? err.message : err);
  }
}

/** «Preparar ahora» (el dueño, para traducir antes de compartir): mismo
 *  camino, sin espera creciente ni tope diario. No se espera en la acción. */
export function prepareNow(ownerId: string, catalogId: string, lang: TargetLanguage): Promise<AutoRunSummary | null> {
  return autoTranslator().run({ catalogId, ownerId, lang }, { manual: true });
}
