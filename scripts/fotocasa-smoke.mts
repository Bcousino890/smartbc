/**
 * Prueba de humo del scraper de particulares de Fotocasa contra el portal y la
 * base de datos REALES. Sin levantar Next: ejecuta el mismo runner que usa la
 * ruta `/api/cron/particulares/scrape-fotocasa`.
 *
 * Uso (una sola página de alquiler, que es lo barato):
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/fotocasa-smoke.mts --toPage=1 --operation=rent
 *
 * Opciones: --fromPage=N --toPage=N --operation=rent|sale --location=slug
 *           --bajas (incluye la pasada de bajas; por defecto se omite)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  scrapeFotocasaParticulares,
  readFotocasaZones,
  FOTOCASA_DEFAULT_LOCATION,
} from "../lib/sync/particulares/fotocasa-runner.ts";
import { dedupeFotocasaZones } from "../lib/sync/particulares/fotocasa-zones.ts";
import type { FotocasaOperation } from "../lib/sync/particulares/fotocasa-scraper.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const file of [".env.local", ".env.production"]) {
  try {
    for (const line of readFileSync(join(ROOT, file), "utf-8").split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* puede no existir */
  }
}

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const fromPage = Number.parseInt(arg("fromPage") ?? "1", 10);
const toPage = Number.parseInt(arg("toPage") ?? "1", 10);
const location = arg("location") ?? FOTOCASA_DEFAULT_LOCATION;
const opArg = arg("operation");
const operations: FotocasaOperation[] =
  opArg === "rent" || opArg === "sale" ? [opArg] : ["rent", "sale"];
const scrapeOnly = !process.argv.includes("--bajas");
const zonesArg = arg("zones");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

const zones = zonesArg
  ? dedupeFotocasaZones(zonesArg.split(",").map((z) => z.trim()).filter(Boolean))
  : await readFotocasaZones(db);

console.log(
  `Fotocasa · ${location} · zonas: ${zones.join(", ")} · ${operations.join("+")} · páginas ${fromPage}-${toPage}` +
    `${scrapeOnly ? " · sin pasada de bajas" : " · con bajas"}`,
);

const started = Date.now();
const results = await scrapeFotocasaParticulares(db, {
  fromPage,
  toPage,
  location,
  zones,
  operations,
  scrapeOnly,
});
console.log(JSON.stringify(results, null, 1));
console.log(`\nTerminado en ${Math.round((Date.now() - started) / 1000)}s`);
