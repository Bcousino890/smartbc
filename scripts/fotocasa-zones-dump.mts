/**
 * Regenera `lib/sync/particulares/fotocasa-zones.ts` bajando el árbol de zonas
 * del PROPIO buscador de Fotocasa.
 *
 * Por qué un script y no escribirlo a mano: los nombres de zona de Fotocasa no
 * son deducibles ("Salamanca" → `barrio-de-salamanca`, "Ibiza" →
 * `ibiza-de-madrid`), cambian con el tiempo y son cientos. El portal ya publica
 * el árbol completo dentro del HTML de cualquier búsqueda, en
 * `initialSearch.result.geographicSearch`, así que la fuente de verdad es él.
 *
 * Uso — añadir una ciudad nueva es pasar su slug:
 *   npm run fotocasa:zones -- madrid-capital barcelona-capital marbella
 *
 * Sin argumentos rehace el catálogo con las localidades que ya estaban (útil
 * para refrescar los contadores o recoger reorganizaciones del portal).
 *
 * El slug es el que usa Fotocasa en la URL:
 *   https://www.fotocasa.es/es/alquiler/viviendas/<slug>/todas-las-zonas/l
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchViaCurl } from "../lib/sync/import-by-link/fetch-via-curl.ts";
import { getProxyUrl } from "../lib/sync/proxy-config.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "lib/sync/particulares/fotocasa-zones.ts");

for (const file of [".env.local", ".env.production"]) {
  try {
    for (const line of readFileSync(join(ROOT, file), "utf-8").split("\n")) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* puede no existir */
  }
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Localidades por defecto: las que ya estaban en el catálogo.
const DEFAULT_SLUGS = [
  "madrid-capital",
  "pozuelo-de-alarcon",
  "la-moraleja",
];

type RawItem = {
  literal: string;
  segments: string;
  counter: number;
  subLocations?: RawItem[] | null;
};

type Zone = { path: string; label: string; approxListings: number };
type District = Zone & { subZones: Zone[] };
type Location = { slug: string; label: string; approxListings: number; districts: District[] };

async function fetchLocation(slug: string, proxyUrl: string | undefined): Promise<Location | null> {
  const url = `https://www.fotocasa.es/es/alquiler/viviendas/${slug}/todas-las-zonas/l?sortType=publicationDate`;
  // El proxy NO es opcional: desde una IP de datacenter Fotocasa responde 403.
  const res = await fetchViaCurl(url, BROWSER_UA, { proxyUrl, timeoutSec: 45 });
  if (!res.ok) {
    console.error(`  ✗ ${slug}: ${res.reason}`);
    return null;
  }
  const m = res.html.match(
    /<script[^>]+id=["']__initial_props__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) {
    console.error(`  ✗ ${slug}: sin __initial_props__ (¿página antibot?)`);
    return null;
  }

  const props = JSON.parse(m[1]) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const levels = props?.initialSearch?.result?.geographicSearch ?? [];
  // El nivel 3 son los distritos/zonas de la localidad seleccionada; el 2 es la
  // propia localidad. Se busca el primer nivel con items que cuelguen del slug.
  let items: RawItem[] = [];
  for (const lvl of levels) {
    const candidates: RawItem[] = lvl?.items ?? [];
    if (candidates.length > 0 && candidates.every((x) => x.segments?.startsWith(`${slug}/`))) {
      const noWhole = candidates.filter((x) => !x.segments.endsWith("/todas-las-zonas"));
      if (noWhole.length > 0) items = noWhole;
    }
  }
  const label: string = (props?.searchContext?.locationLiteral ?? slug).trim();
  const total: number = props?.counters?.realEstates ?? 0;

  const districts: District[] = items.map((d) => ({
    path: d.segments,
    label: d.literal.trim(),
    approxListings: d.counter,
    subZones: (d.subLocations ?? []).map((s) => ({
      path: s.segments,
      label: s.literal.trim(),
      approxListings: s.counter,
    })),
  }));

  const barrios = districts.reduce((n, d) => n + d.subZones.length, 0);
  console.log(`  ✓ ${label} (${slug}): ${districts.length} distritos, ${barrios} zonas, ${total} anuncios`);
  return { slug, label, approxListings: total, districts };
}

/** Slugs a bajar: los de la línea de comandos, o los que ya había. */
function targetSlugs(): string[] {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length > 0) return [...new Set(args)];
  try {
    const current = readFileSync(TARGET, "utf-8");
    const found = [...current.matchAll(/^\s{4}slug: "([a-z0-9-]+)",$/gm)].map((m) => m[1]);
    if (found.length > 0) return found;
  } catch {
    /* primera vez */
  }
  return DEFAULT_SLUGS;
}

const j = (v: string) => JSON.stringify(v);

function render(locations: Location[]): string {
  const hoy = new Date().toISOString().slice(0, 10);
  const out: string[] = [];
  out.push(`import "server-only";

/**
 * Catálogo de zonas TAL Y COMO LAS NOMBRA FOTOCASA.
 *
 * ⚠️ GENERADO — no editar a mano. Se rehace con:
 *     npm run fotocasa:zones -- <slug> [<slug>…]
 * y para añadir una ciudad basta con pasar su slug (el de la URL del portal).
 *
 * No sirve la taxonomía canónica de \`lib/madrid-zones.ts\`: Fotocasa fusiona
 * barrios y les pone nombres propios, así que sus slugs NO son deducibles del
 * nombre oficial. Comprobado contra el portal:
 *
 *   "Salamanca"      → 404   el slug real es \`barrio-de-salamanca\`
 *   "Justicia"       → 404   el slug real es \`justicia-chueca\`
 *   "Ibiza"          → 404   el slug real es \`ibiza-de-madrid\`
 *   "Cuatro Caminos" → 404   el slug real es \`cuatro-caminos-azca\`
 *
 * ── La clave es el "path" ────────────────────────────────────────────────────
 * Todo se identifica por el \`segments\` de Fotocasa: \`localidad/zona\`, p.ej.
 * \`madrid-capital/centro\` o \`pozuelo-de-alarcon/somosaguas\`. Hace falta porque
 * las zonas prime NO están todas dentro de Madrid capital, y porque un slug
 * suelto ("centro") existe en varias localidades a la vez.
 *
 * \`approxListings\` es una foto del número de anuncios EN ALQUILER el ${hoy}.
 * Es orientativo — sólo se usa para ordenar y dar idea del tamaño de cada zona
 * en el panel; no se toma ninguna decisión con él.
 */

export type FotocasaZone = {
  /** \`localidad/zona\`, tal cual lo usa Fotocasa en la URL. */
  path: string;
  /** Nombre tal y como lo muestra Fotocasa. */
  label: string;
  approxListings: number;
};

export type FotocasaDistrict = FotocasaZone & { subZones: FotocasaZone[] };

export type FotocasaLocation = {
  /** Slug de la localidad (\`madrid-capital\`, \`barcelona-capital\`…). */
  slug: string;
  label: string;
  approxListings: number;
  /** En Madrid capital son distritos; en municipios pequeños, zonas. */
  districts: FotocasaDistrict[];
};

export const FOTOCASA_LOCATIONS: FotocasaLocation[] = [`);

  for (const loc of locations) {
    out.push(`  {`);
    out.push(`    slug: ${j(loc.slug)},`);
    out.push(`    label: ${j(loc.label)},`);
    out.push(`    approxListings: ${loc.approxListings},`);
    out.push(`    districts: [`);
    for (const d of loc.districts) {
      out.push(`      {`);
      out.push(`        path: ${j(d.path)},`);
      out.push(`        label: ${j(d.label)},`);
      out.push(`        approxListings: ${d.approxListings},`);
      if (d.subZones.length === 0) {
        out.push(`        subZones: [],`);
      } else {
        out.push(`        subZones: [`);
        for (const s of d.subZones) {
          out.push(
            `          { path: ${j(s.path)}, label: ${j(s.label)}, approxListings: ${s.approxListings} },`,
          );
        }
        out.push(`        ],`);
      }
      out.push(`      },`);
    }
    out.push(`    ],`);
    out.push(`  },`);
  }

  out.push(`];

/**
 * Zonas activas por defecto: el área prime en la que trabaja la agencia. Se usa
 * la primera vez, mientras no haya nada guardado en \`app_settings\`.
 */
export const FOTOCASA_DEFAULT_ZONES = [
  "madrid-capital/barrio-de-salamanca",
  "madrid-capital/centro",
  "madrid-capital/chamberi",
  "madrid-capital/ibiza-de-madrid",
  "madrid-capital/el-viso",
  "pozuelo-de-alarcon/todas-las-zonas",
  "la-moraleja/todas-las-zonas",
];

/** Path que representa una localidad ENTERA. */
export function wholeLocationPath(locationSlug: string): string {
  return \`\${locationSlug}/todas-las-zonas\`;
}

/** Parte un path en localidad y zona. */
export function splitZonePath(path: string): { location: string; zone: string } {
  const i = path.indexOf("/");
  if (i === -1) return { location: "madrid-capital", zone: path };
  return { location: path.slice(0, i), zone: path.slice(i + 1) };
}

/**
 * Acepta los paths guardados antes de que existieran las localidades, cuando
 * sólo se scrapeaba Madrid capital y se guardaba el slug suelto ("centro").
 */
export function normalizeZonePath(raw: string): string {
  return raw.includes("/") ? raw : \`madrid-capital/\${raw}\`;
}

const ZONES_BY_PATH = new Map<string, FotocasaZone>();
for (const location of FOTOCASA_LOCATIONS) {
  ZONES_BY_PATH.set(wholeLocationPath(location.slug), {
    path: wholeLocationPath(location.slug),
    label: location.label,
    approxListings: location.approxListings,
  });
  for (const district of location.districts) {
    ZONES_BY_PATH.set(district.path, district);
    for (const sub of district.subZones) ZONES_BY_PATH.set(sub.path, sub);
  }
}

/** ¿Existe la zona en el catálogo? Evita pedir URLs que darían 404. */
export function isKnownFotocasaZone(path: string): boolean {
  return ZONES_BY_PATH.has(normalizeZonePath(path));
}

/** Nombre legible ("Goya"), o el propio path si no se conoce. */
export function fotocasaZoneLabel(path: string): string {
  return ZONES_BY_PATH.get(normalizeZonePath(path))?.label ?? path;
}

/**
 * Quita zonas redundantes: si está seleccionada la localidad entera sobran sus
 * distritos, y si está el distrito sobran sus barrios (la búsqueda del padre ya
 * los incluye y recorrerlos aparte sería pagar dos veces el mismo proxy).
 */
export function dedupeFotocasaZones(paths: string[]): string[] {
  const selected = new Set(paths.map(normalizeZonePath).filter(isKnownFotocasaZone));
  for (const location of FOTOCASA_LOCATIONS) {
    const whole = wholeLocationPath(location.slug);
    for (const district of location.districts) {
      if (selected.has(whole)) selected.delete(district.path);
      if (selected.has(whole) || selected.has(district.path)) {
        for (const sub of district.subZones) selected.delete(sub.path);
      }
    }
  }
  return [...selected];
}
`);
  return out.join("\n");
}

const slugs = targetSlugs();
console.log(`Bajando el árbol de zonas de ${slugs.length} localidad(es)…`);

const proxyUrl = await getProxyUrl();
if (!proxyUrl) {
  console.error("No hay proxy configurado — Fotocasa responde 403 desde el VPS.");
  process.exit(1);
}

const locations: Location[] = [];
for (const slug of slugs) {
  const loc = await fetchLocation(slug, proxyUrl);
  if (loc) locations.push(loc);
}

if (locations.length === 0) {
  console.error("No se pudo bajar ninguna localidad; el catálogo se deja como estaba.");
  process.exit(1);
}
if (locations.length < slugs.length) {
  console.error(
    `Sólo se bajaron ${locations.length} de ${slugs.length}: se aborta para no perder las que faltan.`,
  );
  process.exit(1);
}

writeFileSync(TARGET, render(locations));
const zonas = locations.reduce(
  (n, l) => n + l.districts.length + l.districts.reduce((m, d) => m + d.subZones.length, 0),
  0,
);
console.log(`\nCatálogo reescrito: ${locations.length} localidades, ${zonas} zonas.`);
