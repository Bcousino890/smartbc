import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";
import type { IdealistaCountry, IdealistaLanguage, IdealistaScope } from "./types";

// Credenciales y ajustes del Partner API de Idealista (la "API en tiempo real").
// Viven en `idealista_config`, la misma fila que ya usaba la integración por
// extensión; el client_secret se guarda cifrado (AES-256-GCM) con el mismo
// helper que el resto de integraciones del CRM.

export interface IdealistaApiConfig {
  clientId: string;
  clientSecret: string;
  /** `ilc` + 40 alfanuméricos. Va en el header `feedKey` de TODAS las llamadas. */
  feedKey: string;
  sandbox: boolean;
  /** `idealista` = buscador público; `microsite` = solo la web de la agencia. */
  scope: IdealistaScope;
  country: IdealistaCountry;
  language: IdealistaLanguage;
  /**
   * Si mandamos `code` (nuestra referencia) en el alta.
   *
   * El schema avisa de que `code` es el `propertyCode` del volcado masivo por
   * fichero; mandarlo nos da altas idempotentes y un 409 claro cuando el
   * anuncio ya existe. Se puede apagar desde el panel si el cliente además
   * mantiene un volcado V6 con códigos propios que puedan chocar.
   */
  sendCode: boolean;
}

export interface IdealistaApiConfigStatus {
  configured: boolean;
  clientId: string;
  feedKey: string;
  sandbox: boolean;
  scope: IdealistaScope;
  country: IdealistaCountry;
  language: IdealistaLanguage;
  sendCode: boolean;
  hasSecret: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

const FEED_KEY_PATTERN = /^ilc[a-z0-9]{40}$/;

/** Valida el feedKey contra `rules.json#/feedkey` antes de gastar una llamada. */
export function isValidFeedKey(feedKey: string): boolean {
  return FEED_KEY_PATTERN.test(feedKey.trim());
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function loadRow(): Promise<any | null> {
  const db = createAdminClient() as any;
  const { data } = await db.from("idealista_config").select("*").limit(1).maybeSingle();
  return data ?? null;
}

/** Config completa (con el secreto descifrado) o `null` si falta algo para poder llamar. */
export async function getIdealistaApiConfig(): Promise<IdealistaApiConfig | null> {
  const row = await loadRow();
  if (!row?.client_id || !row?.api_client_secret_encrypted || !row?.api_client_secret_iv || !row?.feed_key) {
    return null;
  }

  let clientSecret: string;
  try {
    clientSecret = decryptSecret(row.api_client_secret_encrypted, row.api_client_secret_iv);
  } catch (err) {
    // Pasa si cambia EMAIL_ENCRYPTION_KEY: el secreto guardado ya no se puede
    // descifrar y hay que volver a introducirlo. Mejor decirlo que fallar con
    // un 401 críptico de Idealista.
    console.error("[idealista-api] No se pudo descifrar el client_secret:", err);
    return null;
  }

  return {
    clientId: row.client_id,
    clientSecret,
    feedKey: row.feed_key,
    sandbox: row.sandbox_mode !== false,
    scope: row.api_scope === "microsite" ? "microsite" : "idealista",
    country: (row.api_country as IdealistaCountry) || "Spain",
    language: (row.api_language as IdealistaLanguage) || "es",
    sendCode: row.api_send_code !== false,
  };
}

/** Lo que se le enseña al panel: nunca incluye el secreto, solo si lo hay. */
export async function getIdealistaApiConfigStatus(): Promise<IdealistaApiConfigStatus> {
  const row = await loadRow();
  return {
    configured: !!(row?.client_id && row?.api_client_secret_encrypted && row?.feed_key),
    clientId: row?.client_id ?? "",
    feedKey: row?.feed_key ?? "",
    sandbox: row?.sandbox_mode !== false,
    scope: row?.api_scope === "microsite" ? "microsite" : "idealista",
    country: (row?.api_country as IdealistaCountry) || "Spain",
    language: (row?.api_language as IdealistaLanguage) || "es",
    sendCode: row?.api_send_code !== false,
    hasSecret: !!row?.api_client_secret_encrypted,
    lastTestAt: row?.api_last_test_at ?? null,
    lastTestOk: row?.api_last_test_ok ?? null,
    lastTestMessage: row?.api_last_test_message ?? null,
  };
}

export interface SaveIdealistaApiConfigInput {
  clientId: string;
  /** Opcional: si no viene, se conserva el que ya estaba guardado. */
  clientSecret?: string;
  feedKey: string;
  sandbox: boolean;
  scope?: IdealistaScope;
  country?: IdealistaCountry;
  language?: IdealistaLanguage;
  sendCode?: boolean;
}

export async function saveIdealistaApiConfig(input: SaveIdealistaApiConfigInput): Promise<void> {
  const db = createAdminClient() as any;

  const record: Record<string, unknown> = {
    client_id: input.clientId.trim(),
    feed_key: input.feedKey.trim(),
    sandbox_mode: input.sandbox,
    api_scope: input.scope ?? "idealista",
    api_country: input.country ?? "Spain",
    api_language: input.language ?? "es",
    api_send_code: input.sendCode ?? true,
    updated_at: new Date().toISOString(),
  };

  if (input.clientSecret) {
    const { encrypted, iv } = encryptSecret(input.clientSecret);
    record.api_client_secret_encrypted = encrypted;
    record.api_client_secret_iv = iv;
  }

  const { data: existing } = await db.from("idealista_config").select("id").limit(1).maybeSingle();
  if (existing) {
    await db.from("idealista_config").update(record).eq("id", existing.id);
  } else {
    await db.from("idealista_config").insert(record);
  }
}

/** Deja constancia del último "Probar conexión" para que el panel lo enseñe. */
export async function recordApiTestResult(ok: boolean, message: string): Promise<void> {
  const db = createAdminClient() as any;
  const { data: existing } = await db.from("idealista_config").select("id").limit(1).maybeSingle();
  if (!existing) return;
  await db
    .from("idealista_config")
    .update({
      api_last_test_at: new Date().toISOString(),
      api_last_test_ok: ok,
      api_last_test_message: message.slice(0, 500),
    })
    .eq("id", existing.id);
}
