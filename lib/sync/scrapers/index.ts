import type { Scraper } from "../types";
import { testScraper } from "./_test";
import { levelRealEstateScraper } from "./level-real-estate";
import { terrahomesScraper } from "./terrahomes";

// Registry de scrapers conocidos. Cada `scraper_key` en `agency_feeds` debe
// existir aquí. Fase 5 irá añadiendo entradas (level-real-estate, etc.).
const REGISTRY: Record<string, Scraper> = {
  _test: testScraper,
  "level-real-estate": levelRealEstateScraper,
  terrahomes: terrahomesScraper,
};

export function getScraperByKey(key: string): Scraper | null {
  return REGISTRY[key] ?? null;
}

export function listScraperKeys(): string[] {
  return Object.keys(REGISTRY);
}
