import { CREDITS_PER_LISTING, zoneBaseCredits, zoneCredits, zoneListings, type ScraperPortal, type ScraperZone } from "@/lib/scrapers/control-types";

/**
 * Árbol de zonas a partir de `parent_key` (lo publica el crawler). Funciones
 * puras, compartidas por la lista y el mapa.
 *
 * Idealista: Madrid capital → Distrito → Barrio; y Comunidad → Zona → Municipio → Subzona.
 * Regla: NO se inventa jerarquía a partir de nombres. Una fila sin padre conocido
 * es una raíz; si no es una zona reconocible va a «Sin clasificar», nunca se oculta.
 */

export type TreeNode = { z: ScraperZone; children: TreeNode[] };

/** Las 6 zonas de la Comunidad de Madrid de Idealista (primer nivel de «Resto de la Comunidad»). */
export const IDEALISTA_ZONE_ROOTS = new Set([
  "madrid/zona-norte",
  "madrid/zona-noroeste",
  "madrid/zona-sur",
  "madrid/zona-sureste",
  "madrid/zona-suroeste",
  "madrid/corredor-del-henares",
]);

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const byLabel = (a: TreeNode, b: TreeNode) => a.z.label.localeCompare(b.z.label, "es", { sensitivity: "base", numeric: true }) || a.z.zone_key.localeCompare(b.z.zone_key);

/** Árbol completo, ordenado alfabéticamente en cada nivel. Toda fila aparece (también si hay ciclos o padres que no existen). */
export function buildTree(zones: ScraperZone[]): TreeNode[] {
  const byKey = new Map<string, TreeNode>(zones.map((z) => [z.zone_key, { z, children: [] }]));
  const roots: TreeNode[] = [];
  for (const n of byKey.values()) {
    const parent = n.z.parent_key ? byKey.get(n.z.parent_key) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  // Defensa: un ciclo (A→B→A) dejaría ramas inalcanzables. Se cuelgan como raíces para no perder zonas.
  const seen = new Set<TreeNode>();
  const walk = (n: TreeNode) => {
    if (seen.has(n)) return;
    seen.add(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  for (const n of byKey.values()) {
    if (!seen.has(n)) {
      const p = n.z.parent_key ? byKey.get(n.z.parent_key) : undefined;
      if (p) p.children = p.children.filter((c) => c !== n);
      roots.push(n);
      walk(n);
    }
  }
  const sort = (list: TreeNode[]) => {
    list.sort(byLabel);
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function family(n: TreeNode): ScraperZone[] {
  return [n.z, ...n.children.flatMap(family)];
}

/** ¿La zona o algún descendiente coincide con la búsqueda (ya normalizada)? */
export function matches(n: TreeNode, q: string): boolean {
  return normalize(n.z.label).includes(q) || normalize(n.z.zone_key).includes(q) || n.children.some((c) => matches(c, q));
}

export type ZoneGroup = { id: string; title: string; help?: string; nodes: TreeNode[] };

/** Reparte las raíces en grupos: capital primero; luego el resto de la Comunidad; y «Sin clasificar». */
export function groupRoots(portal: ScraperPortal, roots: TreeNode[]): ZoneGroup[] {
  const capital: TreeNode[] = [];
  const resto: TreeNode[] = [];
  const sinClasificar: TreeNode[] = [];
  for (const n of roots) {
    const k = n.z.zone_key;
    if (portal === "idealista") {
      if (n.z.scope === "capital" && k.startsWith("madrid/")) capital.push(n);
      else if (IDEALISTA_ZONE_ROOTS.has(k)) resto.push(n);
      else sinClasificar.push(n);
    } else if (n.z.scope === "capital") capital.push(n);
    else resto.push(n);
  }
  const groups: ZoneGroup[] = [
    { id: "capital", title: "Madrid capital", nodes: capital },
    { id: "resto", title: "Resto de la Comunidad", nodes: resto },
    {
      id: "sin-clasificar",
      title: "Sin clasificar",
      help: "El crawler todavía no ha indicado de qué zona o municipio cuelgan. Se pueden marcar igual.",
      nodes: sinClasificar,
    },
  ];
  return groups.filter((g) => g.nodes.length > 0);
}

/**
 * Anuncios «propios» de cada zona: los suyos menos los de sus hijas directas
 * (una zona padre cuenta a sus hijas dentro de su total). Así se puede sumar el
 * coste de varias zonas sin contar dos veces el mismo anuncio. Sin datos = 0 aquí;
 * `unknown` cuenta las zonas sin datos para poder avisar.
 */
export function exclusiveListings(zones: ScraperZone[]): Map<string, number> {
  const kids = new Map<string, ScraperZone[]>();
  for (const z of zones) if (z.parent_key) kids.set(z.parent_key, [...(kids.get(z.parent_key) ?? []), z]);
  const out = new Map<string, number>();
  for (const z of zones) {
    const own = zoneListings(z) ?? 0;
    const sub = (kids.get(z.zone_key) ?? []).reduce((n, c) => n + (zoneListings(c) ?? 0), 0);
    out.set(z.zone_key, Math.max(0, own - sub));
  }
  return out;
}

/** Coste estimado de lo marcado, lo que costaría marcarlo todo y nº de zonas sin datos. */
export function costTotals(zones: ScraperZone[]): { now: number; all: number; unknown: number } {
  const excl = exclusiveListings(zones);
  let now = 0;
  let all = 0;
  let unknown = 0;
  for (const z of zones) {
    if (zoneBaseCredits(z) == null) unknown++;
    const base = Math.round((excl.get(z.zone_key) ?? 0) * CREDITS_PER_LISTING);
    all += base;
    now += zoneCredits(base, z.priority);
  }
  return { now, all, unknown };
}
