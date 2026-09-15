import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { decryptSecret } from "@/lib/crypto/secret";

/**
 * Config de la API v2 de Zinto (https://crm.zinto.app/api/v2) — la que hoy
 * manda/recibe WhatsApp real en producción (el cliente v1 se retiró del repo
 * el 2026-09-15, confirmado muerto). Vive en la MISMA fila de `zinto_config`
 * (columnas *_v2, migración 0164) para no duplicar el patrón de credenciales
 * cifradas en panel, pero es un config independiente del piloto de
 * integración CRM (lib/services/zinto-integration/**): v2 exige además el
 * header X-Zinto-Integration-Id, que el piloto no tiene.
 *
 * `enabled` es la fuente de verdad de si v2 debe usarse de verdad (panel
 * admin o env ZINTO_V2_ENABLED) — el resto del código nunca debe llamar a
 * la API v2 si esto es false, ni siquiera para el botón "Probar Conexión"
 * en producción (sandbox/pruebas manuales sí pueden forzarlo vía env).
 */
export interface ZintoV2Config {
  apiKey: string;
  baseUrl: string;
  integrationId: string | null;
  webhookSecret: string;
  enabled: boolean;
  /** true cuando vino de la BD (no solo del fallback por env). */
  fromDb: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El Integration ID de Zinto es un UUID opaco: nunca debe convertirse a número. */
export function parseZintoV2IntegrationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const integrationId = value.trim();
  return UUID_PATTERN.test(integrationId) ? integrationId : null;
}

export async function getZintoV2Config(): Promise<ZintoV2Config | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("zinto_config").select("*").limit(1).single();

    if (data?.api_key_v2_encrypted && data?.api_key_v2_iv) {
      let apiKey = "";
      let webhookSecret = "";
      try {
        apiKey = decryptSecret(data.api_key_v2_encrypted, data.api_key_v2_iv);
        if (data.webhook_secret_v2_encrypted && data.webhook_secret_v2_iv) {
          webhookSecret = decryptSecret(data.webhook_secret_v2_encrypted, data.webhook_secret_v2_iv);
        }
      } catch (e) {
        console.error("Failed to decrypt Zinto v2 config:", e);
      }
      if (apiKey) {
        return {
          apiKey,
          baseUrl: data.base_url_v2 || "https://crm.zinto.app/api/v2",
          integrationId: parseZintoV2IntegrationId(data.integration_id),
          webhookSecret,
          enabled: Boolean(data.enabled_v2),
          fromDb: true,
        };
      }
    }
  } catch {
    // tabla/columnas sin migrar todavía → cae a env
  }

  const apiKey = process.env.ZINTO_V2_API_KEY || "";
  if (!apiKey) return null;
  const integrationId = parseZintoV2IntegrationId(process.env.ZINTO_V2_INTEGRATION_ID);
  return {
    apiKey,
    baseUrl: process.env.ZINTO_V2_BASE_URL || "https://crm.zinto.app/api/v2",
    integrationId,
    webhookSecret: process.env.ZINTO_V2_WEBHOOK_SECRET || "",
    enabled: process.env.ZINTO_V2_ENABLED === "true",
    fromDb: false,
  };
}
