// ============================================================================
// HOME · grupos editables de catálogos (expediente 2026-10-16-bcp-01-home-
// grupos). PURO, sin red ni servidor: lo usan la estantería, la HOME de
// fixtures y las pruebas (scripts/test-catalogs-manager.mts).
//
// Los grupos solo ORGANIZAN la HOME: nada de aquí toca los criterios, el
// título, el modo ni las propiedades de un catálogo (R2). Las reglas de
// escritura (applyGroupOp) repiten las de SQL (0203) para las fixtures:
//   · dos niveles (grupo → subgrupo), sin ciclos;
//   · nombres de 1 a 60 caracteres, únicos entre hermanos sin distinguir
//     mayúsculas ni tildes (el mismo pliegue que catalog_fold);
//   · 100 grupos como mucho (subgrupos incluidos);
//   · borrar un grupo borra sus subgrupos y SUS asignaciones, nunca catálogos.
// ============================================================================

export const GROUP_NAME_MAX = 60;
export const GROUP_LIMIT = 100;

export interface CatalogGroup {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
}

export interface GroupMember {
  groupId: string;
  catalogId: string;
}

/** Lo que la HOME sabe de los grupos. `available: false` = la migración no
 *  está aplicada (la HOME se pinta como antes, sin grupos). */
export interface GroupsState {
  available: boolean;
  groups: CatalogGroup[];
  members: GroupMember[];
}

export const EMPTY_GROUPS: GroupsState = { available: true, groups: [], members: [] };

export type GroupSelection = { kind: "all" } | { kind: "none" } | { kind: "group"; id: string };

export const ALL: GroupSelection = { kind: "all" };

export type GroupError = "invalid_name" | "duplicate_name" | "too_deep" | "too_many_groups" | "invalid_order" | "invalid_move" | "forbidden";

// ── Nombres ─────────────────────────────────────────────────────────────────

const FOLD_FROM = "ÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãåéèëêíìïîóòöôõúùüûñç";
const FOLD_TO = "aaaaaaeeeeiiiiooooouuuuncaaaaaaeeeeiiiiooooouuuunc";

/** Igual que catalog_fold() de 0195: tildes fuera (solo las de la lista),
 *  minúsculas y sin espacios en los extremos. */
export function foldGroupName(s: string): string {
  let out = "";
  for (const ch of s ?? "") {
    const i = FOLD_FROM.indexOf(ch);
    out += i >= 0 ? FOLD_TO[i] : ch;
  }
  return out.toLowerCase().trim();
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Igual que catalog_group_name() de 0203: espacios sobrantes fuera y de 1 a
 *  60 caracteres sin caracteres de control. */
export function normalizeGroupName(raw: unknown): { ok: true; value: string } | { ok: false; error: "invalid_name" } {
  const v = (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim();
  const len = [...v].length;
  if (len === 0 || len > GROUP_NAME_MAX || CONTROL.test(v)) return { ok: false, error: "invalid_name" };
  return { ok: true, value: v };
}

export function nameTaken(groups: CatalogGroup[], parentId: string | null, name: string, exceptId: string | null = null): boolean {
  const f = foldGroupName(name);
  return groups.some((g) => g.parentId === parentId && g.id !== exceptId && foldGroupName(g.name) === f);
}

// ── Árbol ───────────────────────────────────────────────────────────────────

const byPos = (a: CatalogGroup, b: CatalogGroup) => a.position - b.position || a.name.localeCompare(b.name, "es");

export function rootGroups(groups: CatalogGroup[]): CatalogGroup[] {
  return groups.filter((g) => g.parentId === null).sort(byPos);
}

export function childGroups(groups: CatalogGroup[], parentId: string): CatalogGroup[] {
  return groups.filter((g) => g.parentId === parentId).sort(byPos);
}

/** Grupos en orden de árbol: cada grupo seguido de sus subgrupos. */
export function treeOrder(groups: CatalogGroup[]): { group: CatalogGroup; depth: 0 | 1 }[] {
  const out: { group: CatalogGroup; depth: 0 | 1 }[] = [];
  for (const r of rootGroups(groups)) {
    out.push({ group: r, depth: 0 });
    for (const c of childGroups(groups, r.id)) out.push({ group: c, depth: 1 });
  }
  return out;
}

/** El grupo y sus subgrupos. */
export function subtreeIds(groups: CatalogGroup[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  for (const g of groups) if (g.parentId === id) ids.add(g.id);
  return ids;
}

export function groupById(groups: CatalogGroup[], id: string | null | undefined): CatalogGroup | undefined {
  return id ? groups.find((g) => g.id === id) : undefined;
}

/** «Salamanca › Recoletos» o «Retiro». */
export function groupLabel(groups: CatalogGroup[], id: string): string {
  const g = groupById(groups, id);
  if (!g) return "";
  const p = groupById(groups, g.parentId);
  return p ? `${p.name} › ${g.name}` : g.name;
}

// ── Estantería ──────────────────────────────────────────────────────────────

export function groupsOfCatalog(state: GroupsState, catalogId: string): Set<string> {
  return new Set(state.members.filter((m) => m.catalogId === catalogId).map((m) => m.groupId));
}

/** ¿Se ve este catálogo con esta selección? «Todas»: siempre. «Sin
 *  organizar»: sin asignaciones. Un grupo: él o cualquiera de sus subgrupos
 *  (D1; el catálogo sale una vez porque se filtra la lista, no se une). */
export function selectionMatcher(state: GroupsState, sel: GroupSelection): (catalogId: string) => boolean {
  if (sel.kind === "all") return () => true;
  const byCatalog = new Map<string, Set<string>>();
  for (const m of state.members) {
    const s = byCatalog.get(m.catalogId) ?? new Set<string>();
    s.add(m.groupId);
    byCatalog.set(m.catalogId, s);
  }
  if (sel.kind === "none") return (id) => !(byCatalog.get(id)?.size);
  const tree = subtreeIds(state.groups, sel.id);
  return (id) => {
    const mine = byCatalog.get(id);
    if (!mine) return false;
    for (const g of mine) if (tree.has(g)) return true;
    return false;
  };
}

/** Recuentos del selector con el filtro de estado actual ("" = todos). */
export function selectionCounts(
  state: GroupsState,
  catalogs: { id: string; status: string }[],
  status: string,
): { all: number; none: number; byGroup: Map<string, number> } {
  const visible = catalogs.filter((c) => !status || c.status === status);
  const none = selectionMatcher(state, { kind: "none" });
  const byGroup = new Map<string, number>();
  for (const g of state.groups) {
    const m = selectionMatcher(state, { kind: "group", id: g.id });
    byGroup.set(g.id, visible.filter((c) => m(c.id)).length);
  }
  return { all: visible.length, none: visible.filter((c) => none(c.id)).length, byGroup };
}

/** Asignaciones por grupo, sin filtros (panel «Organizar»). Un grupo cuenta
 *  también lo de sus subgrupos, sin repetir. */
export function assignedCounts(state: GroupsState): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of state.groups) {
    const tree = subtreeIds(state.groups, g.id);
    out.set(g.id, new Set(state.members.filter((m) => tree.has(m.groupId)).map((m) => m.catalogId)).size);
  }
  return out;
}

/** Etiquetas de una tarjeta: una por grupo de primer nivel, con sus
 *  subgrupos asignados («Salamanca › Recoletos, Castellana»). */
export function cardTags(state: GroupsState, catalogId: string): string[] {
  const mine = groupsOfCatalog(state, catalogId);
  if (!mine.size) return [];
  const out: string[] = [];
  for (const r of rootGroups(state.groups)) {
    const kids = childGroups(state.groups, r.id).filter((c) => mine.has(c.id)).map((c) => c.name);
    if (kids.length) out.push(`${r.name} › ${kids.join(", ")}`);
    else if (mine.has(r.id)) out.push(r.name);
  }
  return out;
}

// ── URL y lo recordado (D5, D8, C2, C3) ─────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?grupo=`: «todas», «sin» o el id. null = ausente; "invalid" = mal formado. */
export function parseSelection(raw: string | null | undefined): GroupSelection | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  if (raw === "todas") return { kind: "all" };
  if (raw === "sin") return { kind: "none" };
  if (UUID_RE.test(raw)) return { kind: "group", id: raw.toLowerCase() };
  return "invalid";
}

export function selectionParam(sel: GroupSelection): string {
  return sel.kind === "all" ? "todas" : sel.kind === "none" ? "sin" : sel.id;
}

export function sameSelection(a: GroupSelection, b: GroupSelection): boolean {
  return selectionParam(a) === selectionParam(b);
}

/** Qué se abre: la URL manda (también «todas»); sin `?grupo`, lo recordado;
 *  si no, «Todas». Un grupo que no existe (borrado, ajeno o mal formado) cae
 *  a «Todas» y pide corregir la URL y lo recordado (`fix`). */
export function resolveSelection(
  urlParam: string | null | undefined,
  remembered: string | null | undefined,
  state: GroupsState,
): { selection: GroupSelection; source: "url" | "memory" | "default"; fix: boolean } {
  const exists = (sel: GroupSelection) => sel.kind !== "group" || state.groups.some((g) => g.id === sel.id);
  const fromUrl = parseSelection(urlParam);
  if (fromUrl !== null) {
    if (fromUrl === "invalid" || !exists(fromUrl)) return { selection: ALL, source: "url", fix: true };
    return { selection: fromUrl, source: "url", fix: false };
  }
  const fromMem = parseSelection(remembered);
  if (fromMem !== null) {
    if (fromMem === "invalid" || !exists(fromMem)) return { selection: ALL, source: "memory", fix: true };
    return { selection: fromMem, source: "memory", fix: false };
  }
  return { selection: ALL, source: "default", fix: false };
}

/** Clave de lo recordado: por dueño y país (C3). */
export function memoryKey(ownerKey: string, country: string): string {
  return `bcp-home-grupo:v1:${ownerKey}:${country}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Lee lo recordado; sin almacenamiento (privado, bloqueado) devuelve null. */
export function readMemory(storage: () => StorageLike | null | undefined, key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Guarda lo recordado; si no se puede, no pasa nada (no se recuerda). */
export function writeMemory(storage: () => StorageLike | null | undefined, key: string, value: string): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** La URL con `grupo` cambiado y el resto de parámetros intactos. */
export function withGroupParam(href: string, sel: GroupSelection): string {
  const u = new URL(href, "http://x.invalid");
  u.searchParams.set("grupo", selectionParam(sel));
  return `${u.pathname}${u.search}${u.hash}`;
}

// ── Escrituras (las mismas reglas que SQL; las usan las fixtures) ───────────

export type GroupOp =
  | { op: "create"; parentId: string | null; name: string; id: string }
  | { op: "rename"; id: string; name: string }
  | { op: "reorder"; parentId: string | null; ids: string[] }
  | { op: "move"; id: string; parentId: string | null }
  | { op: "delete"; id: string }
  | { op: "member"; groupId: string; catalogId: string; member: boolean };

export interface DeletePreview {
  groups: number;
  subgroups: string[];
  assignments: number;
  catalogs: number;
  unorganized: number;
}

export function previewDelete(state: GroupsState, id: string): DeletePreview | null {
  const g = groupById(state.groups, id);
  if (!g) return null;
  const tree = subtreeIds(state.groups, id);
  const mem = state.members.filter((m) => tree.has(m.groupId));
  const cats = new Set(mem.map((m) => m.catalogId));
  const outside = new Set(state.members.filter((m) => !tree.has(m.groupId)).map((m) => m.catalogId));
  return {
    groups: tree.size,
    subgroups: childGroups(state.groups, id).map((c) => c.name),
    assignments: mem.length,
    catalogs: cats.size,
    unorganized: [...cats].filter((c) => !outside.has(c)).length,
  };
}

function renumber(groups: CatalogGroup[], parentId: string | null): CatalogGroup[] {
  const sib = groups.filter((g) => g.parentId === parentId).sort(byPos);
  const pos = new Map(sib.map((g, i) => [g.id, i]));
  return groups.map((g) => (pos.has(g.id) ? { ...g, position: pos.get(g.id)! } : g));
}

/** Aplica una operación con las reglas de 0203. `ownCatalogs` = ids de los
 *  catálogos del dueño (asignar uno ajeno o inexistente es 'forbidden'). */
export function applyGroupOp(
  state: GroupsState,
  op: GroupOp,
  ownCatalogs: Set<string>,
): { ok: true; state: GroupsState; preview?: DeletePreview } | { ok: false; error: GroupError } {
  const groups = state.groups;
  switch (op.op) {
    case "create": {
      const n = normalizeGroupName(op.name);
      if (!n.ok) return { ok: false, error: "invalid_name" };
      if (op.parentId !== null) {
        const p = groupById(groups, op.parentId);
        if (!p) return { ok: false, error: "forbidden" };
        if (p.parentId !== null) return { ok: false, error: "too_deep" };
      }
      if (groups.length >= GROUP_LIMIT) return { ok: false, error: "too_many_groups" };
      if (nameTaken(groups, op.parentId, n.value)) return { ok: false, error: "duplicate_name" };
      const position = groups.filter((g) => g.parentId === op.parentId).reduce((m, g) => Math.max(m, g.position + 1), 0);
      return { ok: true, state: { ...state, groups: [...groups, { id: op.id, parentId: op.parentId, name: n.value, position }] } };
    }
    case "rename": {
      const g = groupById(groups, op.id);
      if (!g) return { ok: false, error: "forbidden" };
      const n = normalizeGroupName(op.name);
      if (!n.ok) return { ok: false, error: "invalid_name" };
      if (n.value === g.name) return { ok: true, state };
      if (nameTaken(groups, g.parentId, n.value, g.id)) return { ok: false, error: "duplicate_name" };
      return { ok: true, state: { ...state, groups: groups.map((x) => (x.id === g.id ? { ...x, name: n.value } : x)) } };
    }
    case "reorder": {
      if (op.parentId !== null && !groupById(groups, op.parentId)) return { ok: false, error: "forbidden" };
      const sib = groups.filter((g) => g.parentId === op.parentId);
      const ids = op.ids ?? [];
      if (ids.length !== sib.length || new Set(ids).size !== sib.length || ids.some((id) => !sib.some((g) => g.id === id))) {
        return { ok: false, error: "invalid_order" };
      }
      const pos = new Map(ids.map((id, i) => [id, i]));
      return { ok: true, state: { ...state, groups: groups.map((g) => (pos.has(g.id) ? { ...g, position: pos.get(g.id)! } : g)) } };
    }
    case "move": {
      const g = groupById(groups, op.id);
      if (!g) return { ok: false, error: "forbidden" };
      if (op.parentId === null) return { ok: false, error: "invalid_move" };
      const dest = groupById(groups, op.parentId);
      if (!dest) return { ok: false, error: "forbidden" };
      if (g.parentId === null || dest.id === g.id) return { ok: false, error: "invalid_move" };
      if (dest.parentId !== null) return { ok: false, error: "too_deep" };
      if (g.parentId === dest.id) return { ok: true, state };
      if (nameTaken(groups, dest.id, g.name, g.id)) return { ok: false, error: "duplicate_name" };
      const position = groups.filter((x) => x.parentId === dest.id).reduce((m, x) => Math.max(m, x.position + 1), 0);
      const moved = groups.map((x) => (x.id === g.id ? { ...x, parentId: dest.id, position } : x));
      return { ok: true, state: { ...state, groups: renumber(moved, g.parentId) } };
    }
    case "delete": {
      const g = groupById(groups, op.id);
      if (!g) return { ok: false, error: "forbidden" };
      const preview = previewDelete(state, op.id)!;
      const tree = subtreeIds(groups, op.id);
      return {
        ok: true,
        preview,
        state: {
          ...state,
          groups: renumber(groups.filter((x) => !tree.has(x.id)), g.parentId),
          members: state.members.filter((m) => !tree.has(m.groupId)),
        },
      };
    }
    case "member": {
      if (!groupById(groups, op.groupId) || !ownCatalogs.has(op.catalogId)) return { ok: false, error: "forbidden" };
      const has = state.members.some((m) => m.groupId === op.groupId && m.catalogId === op.catalogId);
      if (op.member && !has) return { ok: true, state: { ...state, members: [...state.members, { groupId: op.groupId, catalogId: op.catalogId }] } };
      if (!op.member && has) return { ok: true, state: { ...state, members: state.members.filter((m) => !(m.groupId === op.groupId && m.catalogId === op.catalogId)) } };
      return { ok: true, state };
    }
  }
}

/** Destinos de «Mover a…» para un subgrupo: los demás grupos de primer
 *  nivel, sin uno donde ya haya un hermano con el mismo nombre. */
export function moveTargets(groups: CatalogGroup[], id: string): CatalogGroup[] {
  const g = groupById(groups, id);
  if (!g || g.parentId === null) return [];
  return rootGroups(groups).filter((r) => r.id !== g.parentId && !nameTaken(groups, r.id, g.name, g.id));
}
