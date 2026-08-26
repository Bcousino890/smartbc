import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * Configuración del scraper.
 *
 * Los tiempos NO viven en el código del scraper: se editan en el panel y él los
 * lee en `GET /api/v1/idealista/config`. Así ajustar la frecuencia de refresco
 * de los particulares (o frenar el gasto a mitad de mes) no necesita un deploy
 * del proveedor externo.
 *
 * `version` sube sola en cada cambio (trigger en 0122): el scraper compara un
 * entero y sabe si su copia está vieja, sin diffear campo a campo.
 */

export type IdealistaScraperConfig = {
  version: number;
  scraping_enabled: boolean;
  discovery_interval_minutes: number;
  full_market_sweep_interval_hours: number;

  sale_0_14_days_refresh_hours: number;
  sale_15_30_days_refresh_hours: number;
  sale_31_90_days_refresh_hours: number;
  sale_over_90_days_refresh_hours: number;

  rent_0_7_days_refresh_hours: number;
  rent_8_30_days_refresh_hours: number;
  rent_over_30_days_refresh_hours: number;

  private_first_72h_refresh_hours: number;
  private_day_3_7_refresh_hours: number;

  missing_verification_delay_hours: number;
  off_market_confirmation_delay_hours: number;

  monthly_request_budget: number;
  monthly_request_reserve: number;
  max_batch_size: number;
  max_concurrency: number;
  requests_per_minute: number;

  heartbeat_stale_minutes: number;
  notes: string | null;
  updated_at: string;
};

/**
 * Valores por defecto. Duplican los DEFAULT de la migración a propósito: si la
 * tabla todavía no existe (VPS reinicia la app ANTES de aplicar migraciones,
 * ver lib/api/auth.ts) el scraper recibe una configuración usable en vez de un
 * 500, y sigue trabajando con criterios sensatos hasta el siguiente sondeo.
 */
export const DEFAULT_IDEALISTA_CONFIG: IdealistaScraperConfig = {
  version: 0,
  scraping_enabled: true,
  discovery_interval_minutes: 5,
  full_market_sweep_interval_hours: 24,
  sale_0_14_days_refresh_hours: 48,
  sale_15_30_days_refresh_hours: 72,
  sale_31_90_days_refresh_hours: 168,
  sale_over_90_days_refresh_hours: 336,
  rent_0_7_days_refresh_hours: 24,
  rent_8_30_days_refresh_hours: 48,
  rent_over_30_days_refresh_hours: 168,
  private_first_72h_refresh_hours: 6,
  private_day_3_7_refresh_hours: 24,
  missing_verification_delay_hours: 24,
  off_market_confirmation_delay_hours: 72,
  monthly_request_budget: 250_000,
  monthly_request_reserve: 50_000,
  max_batch_size: 200,
  max_concurrency: 4,
  requests_per_minute: 60,
  heartbeat_stale_minutes: 30,
  notes: null,
  updated_at: new Date(0).toISOString(),
};

/** Campos editables desde el panel. `version` y `updated_at` los lleva la BD. */
export const EDITABLE_CONFIG_FIELDS = [
  "scraping_enabled",
  "discovery_interval_minutes",
  "full_market_sweep_interval_hours",
  "sale_0_14_days_refresh_hours",
  "sale_15_30_days_refresh_hours",
  "sale_31_90_days_refresh_hours",
  "sale_over_90_days_refresh_hours",
  "rent_0_7_days_refresh_hours",
  "rent_8_30_days_refresh_hours",
  "rent_over_30_days_refresh_hours",
  "private_first_72h_refresh_hours",
  "private_day_3_7_refresh_hours",
  "missing_verification_delay_hours",
  "off_market_confirmation_delay_hours",
  "monthly_request_budget",
  "monthly_request_reserve",
  "max_batch_size",
  "max_concurrency",
  "requests_per_minute",
  "heartbeat_stale_minutes",
  "notes",
] as const;

export async function getIdealistaScraperConfig(): Promise<IdealistaScraperConfig> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  try {
    const { data, error } = await db
      .from("idealista_scraper_config")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error || !data) return DEFAULT_IDEALISTA_CONFIG;
    return { ...DEFAULT_IDEALISTA_CONFIG, ...data } as IdealistaScraperConfig;
  } catch {
    return DEFAULT_IDEALISTA_CONFIG;
  }
}
