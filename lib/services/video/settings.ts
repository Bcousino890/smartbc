import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  normalizeSettings,
  type VideoSettings,
} from "./config";

// Lectura y escritura de los ajustes en app_settings.
//
// Separado de config.ts a propósito: allí solo hay constantes y aritmética, sin
// dependencias de servidor, para que el planificador (plan.ts) pueda probarse
// con un script suelto. Todo lo que toca la base de datos vive aquí.

/** Lee los ajustes de app_settings. Si no hay fila o falla, devuelve defaults. */
export async function getVideoSettings(): Promise<VideoSettings> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_SETTINGS };
  return normalizeSettings(data.value);
}

/** Guarda los ajustes ya normalizados. Devuelve lo que quedó persistido. */
export async function saveVideoSettings(input: unknown): Promise<VideoSettings> {
  const settings = normalizeSettings(input);
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`No se pudieron guardar los ajustes: ${error.message}`);
  return settings;
}
