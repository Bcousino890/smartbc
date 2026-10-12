import type { ScraperPortal } from "./control-types";

// Estadísticas (tabla scraper_stats_daily, la rellena el crawler). Tipos compartidos servidor/navegador.

export type StatsPeriod = "7" | "30" | "billing";
export type StatsPortalFilter = "all" | ScraperPortal;
export type StatsOpFilter = "all" | "sale" | "rent";

export type StatsZoneRow = {
  portal: ScraperPortal;
  zone_key: string;
  label: string;
  newListings: number;
  takenDown: number;
  priceDown: number;
  priceUp: number;
  /** Media (ponderada por nº de variaciones) del % de cambio de precio; negativa = bajada. */
  avgChangePct: number | null;
  credits: number;
  /** Créditos por anuncio nuevo; null si la zona no encontró ninguno. */
  creditsPerNew: number | null;
};

export type StatsPayload = {
  /** false si la tabla aún no existe (migración sin aplicar). */
  tableReady: boolean;
  /** false mientras el crawler no haya escrito ninguna fila en el periodo. */
  hasData: boolean;
  from: string;
  to: string;
  kpis: {
    newListings: number;
    takenDown: number;
    reactivated: number;
    priceDown: number;
    priceUp: number;
    avgChangePct: number | null;
    requests: number;
    credits: number;
  };
  daily: Array<{ day: string; newListings: number; takenDown: number; credits: number }>;
  zones: StatsZoneRow[];
  tasks: Array<{ task: string; label: string; credits: number; requests: number }>;
};
