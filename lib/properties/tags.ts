// Lógica pura de las etiquetas de propiedades (sin red ni BD): validación,
// autocompletar, filtro y cambios en lote. La usan la lista, la ficha, las
// rutas API y el test (scripts/test-property-tags.mts).

export type PropertyTag = {
  id: string;
  name: string;
  color: string; // #RRGGBB
  country?: string;
};

export const TAG_NAME_MAX = 40;
export const DEFAULT_TAG_COLOR = "#B8913E";

// Paleta sugerida en el selector (se admite cualquier #RRGGBB).
export const TAG_COLORS = [
  "#B8913E",
  "#2E7D5B",
  "#2F6FA3",
  "#C2410C",
  "#BE185D",
  "#7C3AED",
  "#1F1B16",
  "#6B7280",
] as const;

export const SUGGESTED_TAGS: { name: string; color: string }[] = [
  { name: "Exclusiva", color: "#B8913E" },
  { name: "Oportunidad", color: "#2E7D5B" },
  { name: "Reformado", color: "#2F6FA3" },
  { name: "Bajada de precio", color: "#C2410C" },
  { name: "Off-market", color: "#1F1B16" },
  { name: "Inversión", color: "#7C3AED" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isValidColor(c: unknown): c is string {
  return typeof c === "string" && HEX.test(c);
}

/** Recorta y colapsa espacios. */
export function normalizeTagName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Clave de comparación: sin mayúsculas ni tildes. */
export function tagKey(name: string): string {
  return normalizeTagName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function validateTagName(
  raw: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Escribe un nombre." };
  const name = normalizeTagName(raw);
  if (!name) return { ok: false, error: "Escribe un nombre." };
  if (name.length > TAG_NAME_MAX)
    return { ok: false, error: `Máximo ${TAG_NAME_MAX} caracteres.` };
  return { ok: true, name };
}

export function findTagByName<T extends { name: string }>(
  tags: T[],
  name: string,
): T | undefined {
  const k = tagKey(name);
  return tags.find((t) => tagKey(t.name) === k);
}

/** Autocompletar: etiquetas aún no asignadas cuyo nombre contiene la consulta. */
export function suggestTags(
  tags: PropertyTag[],
  query: string,
  assignedIds: string[] = [],
  limit = 8,
): PropertyTag[] {
  const k = tagKey(query);
  const assigned = new Set(assignedIds);
  return tags
    .filter((t) => !assigned.has(t.id) && (!k || tagKey(t.name).includes(k)))
    .sort((a, b) => {
      const as = tagKey(a.name).startsWith(k) ? 0 : 1;
      const bs = tagKey(b.name).startsWith(k) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name, "es");
    })
    .slice(0, limit);
}

/** ¿Se puede ofrecer "Crear «x»"? Solo si no existe ya una con ese nombre. */
export function canCreateTag(tags: PropertyTag[], query: string): boolean {
  const v = validateTagName(query);
  return v.ok && !findTagByName(tags, v.name);
}

/** Filtro por etiquetas: sin selección pasa todo; con selección, basta una. */
export function matchesTagFilter(
  propertyTagIds: string[] | undefined,
  selectedIds: string[],
): boolean {
  if (selectedIds.length === 0) return true;
  if (!propertyTagIds?.length) return false;
  return selectedIds.some((id) => propertyTagIds.includes(id));
}

/** Aplica un cambio en lote (añadir/quitar) a un conjunto de ids. */
export function applyTagChange(
  current: string[] | undefined,
  add: string[] = [],
  remove: string[] = [],
): string[] {
  const rm = new Set(remove);
  const out = new Set((current ?? []).filter((id) => !rm.has(id)));
  for (const id of add) if (!rm.has(id)) out.add(id);
  return Array.from(out);
}

/** Texto legible sobre el color de la etiqueta (fondo suave + borde). */
export function tagChipStyle(color: string): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  const c = isValidColor(color) ? color : DEFAULT_TAG_COLOR;
  return { backgroundColor: `${c}1F`, borderColor: `${c}66`, color: c };
}
