import "server-only";

import { createAdminClient } from "@/lib/db/admin";
import { MADRID_DISTRICT_NAMES, normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";

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
  /** Para el selector en árbol: zona → barrios, con nº de fichas. */
  groups: ZoneCatalogGroup[];
};

export type ZoneCatalogGroup = {
  name: string;
  total: number;
  /** true = distrito de Madrid capital; false = municipio u otra zona. */
  isMadrid: boolean;
  subs: { name: string; total: number }[];
};

const PAGE = 1000;
const MAX_ROWS = 60_000;
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: ZoneCatalog }>();

type Row = { zone: string | null; subzone: string | null };

/** Ruido del scraper: "venta en Estrella en Estrella", "Guindalera, 9", "Zona Centro"… */
const NOISE = /^(venta|alquiler|piso|casa|chalet|local|zona)\b|\ben\b|,|\d/i;

/** "Centro (Alcobendas)" → zona "Alcobendas", barrio "Centro". */
function splitParen(raw: string): { zone: string; sub: string | null } {
  const m = raw.match(/^(.+?)\s*\((.+)\)$/);
  if (!m) return { zone: raw, sub: null };
  const [, a, b] = m;
  return { zone: b.trim(), sub: fold(a) === fold(b) ? null : a.trim() };
}

/**
 * Una sola ubicación canónica por ficha: un barrio conocido de Madrid cuelga
 * de su distrito (Goya → Salamanca › Goya), los paréntesis pasan a municipio
 * y el ruido se descarta.
 */
function tidy(zoneRaw: string, subRaw: string | null): { zone: string; sub: string | null } | null {
  const z0 = splitParen(zoneRaw.trim());
  let zone = z0.zone;
  let sub = subRaw?.trim() || z0.sub;
  if (NOISE.test(zone)) return null;
  const nz = normalizeZone(zone);
  if (nz.district !== OTHER_ZONE_LABEL) {
    if (nz.barrio) sub = sub ?? nz.barrio;
    zone = nz.district;
  }
  if (sub) {
    const ns = normalizeZone(sub);
    if (ns.barrio) sub = ns.barrio;
    // Variantes compuestas ("Chueca-Justicia") y ruido no se ofrecen como barrio.
    else if (NOISE.test(sub) || /[-–]/.test(sub)) sub = null;
    if (sub && fold(sub) === fold(zone)) sub = null;
  }
  return { zone, sub };
}

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
      const muni = (r.municipality as string | null)?.trim() || null;
      // "Madrid"/"Madrid Capital" no es una zona útil: la zona va por sí sola.
      const generic = !muni || /^madrid( capital)?$/i.test(muni);
      const z = String(r.zone).trim();
      out.push({ zone: generic ? z : muni, subzone: generic ? null : z, n: Number(r.total) });
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
  const subCount = new Map<string, number>();
  for (const r of rows) {
    if (!r.zone?.trim()) continue;
    const t = tidy(r.zone, r.subzone);
    if (!t) continue;
    const zone = t.zone;
    const zk = fold(zone);
    if (!canon.has(zk)) canon.set(zk, zone);
    count.set(zk, (count.get(zk) ?? 0) + (r.n ?? 1));
    const sub = t.sub;
    if (sub) {
      const m = subs.get(zk) ?? new Map<string, string>();
      if (!m.has(fold(sub))) m.set(fold(sub), sub);
      subs.set(zk, m);
      subCount.set(`${zk}|${fold(sub)}`, (subCount.get(`${zk}|${fold(sub)}`) ?? 0) + (r.n ?? 1));
    }
  }

  const keys = [...canon.keys()].sort((a, b) => (count.get(b)! - count.get(a)!) || a.localeCompare(b));
  const groups: ZoneCatalogGroup[] = keys.map((k) => {
    const name = canon.get(k)!;
    const list = [...(subs.get(k)?.entries() ?? [])]
      .map(([fk, sname]) => ({ name: sname, total: subCount.get(`${k}|${fk}`) ?? 0 }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
    return { name, total: count.get(k)!, isMadrid: MADRID_DISTRICT_NAMES.some((d) => fold(d) === k), subs: list };
  });
  const value: ZoneCatalog = {
    groups,
    zones: keys.map((k) => canon.get(k)!),
    subzones: Object.fromEntries(
      keys.filter((k) => subs.has(k)).map((k) => [canon.get(k)!, [...subs.get(k)!.values()].sort((a, b) => a.localeCompare(b, "es"))]),
    ),
  };
  cache.set(country, { at: Date.now(), value });
  return value;
}
