import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import {
  REQUIRED_EXTENSION_VERSION,
  currentExtensionVersion,
  isExtensionOutdated,
} from "@/lib/services/idealista/extension-package";

/** Última captura del inbox que recibió el CRM (app_settings, la escribe la recepción). */
export type ExtensionCaptureStatus = {
  /** Versión que mandó la extensión; null = anterior a la 1.14.1 (no la mandaba). */
  version: string | null;
  at: string | null;
  received: number;
  withCode: number;
  /** Versión que acompaña a este despliegue (la que se descarga). */
  available: string;
  required: string;
  outdated: boolean;
  /** No ha llegado ninguna captura desde que se guarda esto. */
  unknown: boolean;
};

export async function getExtensionCaptureStatus(): Promise<ExtensionCaptureStatus> {
  const base = {
    version: null,
    at: null,
    received: 0,
    withCode: 0,
    available: currentExtensionVersion(),
    required: REQUIRED_EXTENSION_VERSION,
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("app_settings").select("value").eq("key", "idealista.extension_capture").maybeSingle();
    const v = (data?.value ?? null) as Record<string, unknown> | null;
    if (!v) return { ...base, outdated: false, unknown: true };
    const version = typeof v.version === "string" && v.version ? v.version : null;
    return {
      ...base,
      version,
      at: typeof v.at === "string" ? v.at : null,
      received: Number(v.received ?? 0),
      withCode: Number(v.with_code ?? 0),
      outdated: isExtensionOutdated(version),
      unknown: false,
    };
  } catch {
    return { ...base, outdated: false, unknown: true };
  }
}
