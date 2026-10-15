// Lógica pura del selector de zonas (sin React) para poder probarla con node.

export type ZoneEntry = { name: string; total: number; missingPhone: number };
export type ZoneGroup = {
  district: string;
  total: number;
  missingPhone: number;
  /** true = distrito de Madrid capital; false = municipio. Ausente = se deduce. */
  isMadrid?: boolean;
  zones: ZoneEntry[];
};

export const SEP = "|";

export function parseValue(value: string): string[] {
  return value.split(SEP).map((s) => s.trim()).filter(Boolean);
}

/** Minúsculas y sin acentos, para buscar "alcala" y encontrar "Alcalá". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Parte `text` en trozos marcando los que coinciden con `query` (insensible a
 * acentos y mayúsculas). fold() de un carácter suelto conserva la longitud al
 * descomponer cada letra, así que los índices valen para el texto original.
 */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const q = fold(query.trim());
  if (!q) return [{ text, match: false }];
  // Mapa de índices del texto plegado al original (un carácter original puede
  // plegarse a 0..n caracteres).
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]);
    for (let k = 0; k < f.length; k++) {
      folded += f[k];
      map.push(i);
    }
  }
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  let from = 0;
  while (from <= folded.length) {
    const at = folded.indexOf(q, from);
    if (at < 0) break;
    const start = map[at];
    const end = map[at + q.length - 1] + 1;
    if (start >= cursor) {
      if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
      parts.push({ text: text.slice(start, end), match: true });
      cursor = end;
    }
    from = at + q.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

/** Un municipio con una sola zona homónima se muestra como fila plana. */
export function isFlat(g: ZoneGroup): boolean {
  return g.zones.length <= 1 && (g.zones.length === 0 || fold(g.zones[0].name) === fold(g.district));
}

export type CheckState = "on" | "off" | "some";

export function groupState(g: ZoneGroup, selected: Set<string>): CheckState {
  if (selected.has(`d:${g.district}`)) return "on";
  const n = g.zones.filter((z) => selected.has(`z:${z.name}`)).length;
  if (n === 0) return "off";
  return n === g.zones.length ? "on" : "some";
}

export function zoneOn(g: ZoneGroup, z: ZoneEntry, selected: Set<string>): boolean {
  return selected.has(`d:${g.district}`) || selected.has(`z:${z.name}`);
}

/** Elimina duplicados: si todos los barrios están marcados, pasa a "d:distrito". */
function normalize(next: Set<string>, groups: ZoneGroup[]): Set<string> {
  for (const g of groups) {
    const dk = `d:${g.district}`;
    if (next.has(dk)) {
      for (const z of g.zones) next.delete(`z:${z.name}`);
    } else if (g.zones.length > 0 && g.zones.every((z) => next.has(`z:${z.name}`))) {
      for (const z of g.zones) next.delete(`z:${z.name}`);
      next.add(dk);
    }
  }
  return next;
}

/** Marca/desmarca un distrito entero (casilla padre tri-estado). */
export function toggleGroup(groups: ZoneGroup[], selected: Set<string>, district: string): Set<string> {
  const g = groups.find((x) => x.district === district);
  const next = new Set(selected);
  if (!g) return next;
  const st = groupState(g, selected);
  next.delete(`d:${district}`);
  for (const z of g.zones) next.delete(`z:${z.name}`);
  // "some" y "off" -> todo; "on" -> nada.
  if (st !== "on") next.add(`d:${district}`);
  return normalize(next, groups);
}

/** Marca/desmarca un barrio. Si el distrito estaba entero, lo despieza. */
export function toggleZone(groups: ZoneGroup[], selected: Set<string>, district: string, zone: string): Set<string> {
  const g = groups.find((x) => x.district === district);
  const next = new Set(selected);
  if (!g) return next;
  const dk = `d:${district}`;
  if (next.has(dk)) {
    next.delete(dk);
    for (const z of g.zones) if (z.name !== zone) next.add(`z:${z.name}`);
  } else if (next.has(`z:${zone}`)) {
    next.delete(`z:${zone}`);
  } else {
    next.add(`z:${zone}`);
  }
  return normalize(next, groups);
}

export function serialize(selected: Set<string>): string {
  return [...selected].join(SEP);
}

/** Orden por nº de anuncios (desc), desempate alfabético. */
export function sortByTotal<T extends { total: number }>(items: T[], name: (t: T) => string): T[] {
  return [...items].sort((a, b) => b.total - a.total || name(a).localeCompare(name(b), "es"));
}

export function groupIsMadrid(g: ZoneGroup): boolean {
  return g.isMadrid ?? true;
}

/** Etiqueta legible de una entrada seleccionada ("d:X" -> "Todo X"). */
export function chipLabel(key: string): string {
  return key.startsWith("d:") ? key.slice(2) : key.startsWith("z:") ? key.slice(2) : key;
}

/** Filtra grupos por búsqueda y/o "solo sin teléfono". Conserva el orden. */
export function filterGroups(groups: ZoneGroup[], query: string, onlyMissingPhone: boolean): ZoneGroup[] {
  const q = fold(query.trim());
  const out: ZoneGroup[] = [];
  for (const g of groups) {
    const dm = !!q && fold(g.district).includes(q);
    let zones = q && !dm ? g.zones.filter((z) => fold(z.name).includes(q)) : g.zones;
    if (onlyMissingPhone) zones = zones.filter((z) => z.missingPhone > 0);
    if (q && !dm && zones.length === 0) continue;
    if (onlyMissingPhone && zones.length === 0) continue;
    out.push({ ...g, zones });
  }
  return out;
}

/** Los n distritos/municipios con más anuncios, como claves "d:". */
export function topKeys(groups: ZoneGroup[], n: number): string[] {
  return sortByTotal(groups, (g) => g.district).slice(0, n).map((g) => `d:${g.district}`);
}
