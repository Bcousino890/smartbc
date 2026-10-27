import "server-only";

import { createAdminClient } from "@/lib/db/admin";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";

/**
 * Catálogo de zonas del CRM para el encargo del cliente: las zonas y barrios
 * que de verdad tienen las propiedades y las captaciones, no una lista
 * escrita a mano. Es la misma comparación que hace el match (zona y subzona
 * de la ficha), así que lo que se marca aquí encuentra fichas.
 */
export type ZoneCatalog = {
  /** Zonas por nº de fichas (propiedades + captaciones), de más a menos. */
  zones: string[];
  /** Barrios (subzona) que aparecen bajo cada zona. */
  subzones: Record<string, string[]>;
};

const PAGE = 1000;
const MAX_ROWS = 60_000;
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: ZoneCatalog }>();

type Row = { zone: string | null; subzone: string | null };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function readAll(table: "properties" | "captaciones", country: string): Promise<Row[]> {
  const db = createAdminClient();
  const out: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = db.from(table).select("zone, subzone").not("zone", "is", null);
    q = table === "properties" ? q.eq("country", country).is("archived_at", null) : q.eq("country", country);
    const { data, error } = await q.range(from, from + PAGE - 1);
    const page = (data ?? []) as Row[];
    if (error || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

/**
 * Captaciones de España: viven en `particulares` (el scraper), no en
 * `captaciones`. Se leen ya agregadas (zona × municipio, ≈2k filas) y se
 * cuelgan del distrito de Madrid si la zona es un distrito/barrio conocido,
 * o del municipio si no (Pozuelo, Alcobendas…). El match ya resuelve esos
 * nombres por municipio/distrito (placeAliases), así que lo marcado encuentra fichas.
 */
async function readParticulares(): Promise<(Row & { n: number })[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const out: (Row & { n: number })[] = [];
  for (let page = 0; page < 50; page++) {
    const res = await db
      .rpc("particulares_zone_counts", { p_advertiser: "" })
      .order("portal", { ascending: true })
      .order("zone", { ascending: true })
      .order("municipality", { ascending: true })
      .order("is_active", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (res.error || !Array.isArray(res.data)) break;
    for (const r of res.data) {
      if (!r.is_active || !r.zone) continue;
      const nz = normalizeZone(r.zone);
      const muni = (r.municipality as string | null)?.trim() || null;
      // "Madrid"/"Madrid Capital" no es una zona útil: una zona de la capital
      // que no es distrito ni barrio conocido va como zona por sí sola.
      const generic = !muni || /^madrid( capital)?$/i.test(muni);
      const parent = nz.district !== OTHER_ZONE_LABEL ? nz.district : generic ? String(r.zone).trim() : muni;
      if (!parent) continue;
      out.push({ zone: parent, subzone: parent === r.zone ? null : r.zone, n: Number(r.total) });
    }
    if (res.data.length < 1000) break;
  }
  return out;
}

export async function loadZoneCatalog(country: "es" | "cl"): Promise<ZoneCatalog> {
  const hit = cache.get(country);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const rows: (Row & { n?: number })[] = [
    ...(await readAll("properties", country)),
    ...(await readAll("captaciones", country)),
    ...(country === "es" ? await readParticulares() : []),
  ];

  // Una sola grafía por nombre ("Chamberí" y "chamberi" son la misma zona).
  const canon = new Map<string, string>();
  const count = new Map<string, number>();
  const subs = new Map<string, Map<string, string>>();
  for (const r of rows) {
    const zone = r.zone?.trim();
    if (!zone) continue;
    const zk = fold(zone);
    if (!canon.has(zk)) canon.set(zk, zone);
    count.set(zk, (count.get(zk) ?? 0) + (r.n ?? 1));
    const sub = r.subzone?.trim();
    if (sub && fold(sub) !== zk) {
      const m = subs.get(zk) ?? new Map<string, string>();
      if (!m.has(fold(sub))) m.set(fold(sub), sub);
      subs.set(zk, m);
    }
  }

  const keys = [...canon.keys()].sort((a, b) => (count.get(b)! - count.get(a)!) || a.localeCompare(b));
  const value: ZoneCatalog = {
    zones: keys.map((k) => canon.get(k)!),
    subzones: Object.fromEntries(
      keys.filter((k) => subs.has(k)).map((k) => [canon.get(k)!, [...subs.get(k)!.values()].sort((a, b) => a.localeCompare(b, "es"))]),
    ),
  };
  cache.set(country, { at: Date.now(), value });
  return value;
}
