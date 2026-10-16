// ============================================================================
// SOLO DESARROLLO LOCAL (HOME · grupos). Almacén SINTÉTICO en memoria de los
// grupos de la HOME de fixtures y de los catálogos que se crean ahí. Aplica
// las MISMAS reglas que 0203 (applyGroupOp de groups.ts). Nunca avisa al
// vigilante de los lectores ni toca el almacén de los enlaces (fixture-store):
// organizar no cambia ningún catálogo. Solo se importa desde páginas y rutas
// protegidas por isCatalogFixtureMode().
// ============================================================================

import { randomUUID } from "node:crypto";
import { DEFAULT_CRITERIA } from "./criteria";
import { fixtureCatalogs } from "./fixtures";
import { applyGroupOp, groupById, previewDelete, type DeletePreview, type GroupOp, type GroupsState } from "./groups";
import type { CatalogSummary } from "./types";

const ID = {
  sal: "5a100000-0000-4000-8000-000000000001",
  rec: "5a100000-0000-4000-8000-000000000002",
  cas: "5a100000-0000-4000-8000-000000000003",
  lis: "5a100000-0000-4000-8000-000000000004",
  goy: "5a100000-0000-4000-8000-000000000005",
  cha: "5a100000-0000-4000-8000-000000000006",
  ret: "5a100000-0000-4000-8000-000000000007",
} as const;
export const FIXTURE_GROUP_IDS = ID;

const CAT = fixtureCatalogs.map((c) => c.id);

interface Store {
  groups: GroupsState;
  catalogs: CatalogSummary[];
  /** Catálogos creados (las pruebas cuentan los envíos repetidos). */
  created: number;
}

function seed(kind: "normal" | "empty" | "none" = "normal"): Store {
  const G = (id: string, parentId: string | null, name: string, position: number) => ({ id, parentId, name, position });
  const groups: GroupsState =
    kind === "normal"
      ? {
          available: true,
          groups: [
            G(ID.sal, null, "Salamanca", 0), G(ID.rec, ID.sal, "Recoletos", 0), G(ID.cas, ID.sal, "Castellana", 1), G(ID.lis, ID.sal, "Lista", 2), G(ID.goy, ID.sal, "Goya", 3),
            G(ID.cha, null, "Chamberí", 1), G(ID.ret, null, "Retiro", 2),
          ],
          // nº 01 en Salamanca y Chamberí · nº 02 en Recoletos y Castellana ·
          // nº 03 sin organizar · nº 04 (archivado) en Retiro.
          members: [
            { groupId: ID.sal, catalogId: CAT[0] }, { groupId: ID.cha, catalogId: CAT[0] },
            { groupId: ID.rec, catalogId: CAT[1] }, { groupId: ID.cas, catalogId: CAT[1] },
            { groupId: ID.ret, catalogId: CAT[3] },
          ],
        }
      : { available: kind !== "none", groups: [], members: [] };
  return { groups, catalogs: fixtureCatalogs.map((c) => ({ ...c })), created: 0 };
}

const KEY = "__bcpHomeGroupsFixtureStore";
type GG = typeof globalThis & { [KEY]?: Store };

function store(): Store {
  const g = globalThis as GG;
  if (!g[KEY]) g[KEY] = seed();
  return g[KEY]!;
}

export function fixtureHomeState(): { groups: GroupsState; catalogs: CatalogSummary[] } {
  const s = store();
  return { groups: s.groups, catalogs: s.catalogs };
}

export type FixtureGroupsOp =
  | { op: "reset"; kind?: "normal" | "empty" | "none" }
  | { op: "state" }
  | { op: "many"; n?: number }
  | { op: "group"; change: GroupOp | (Omit<Extract<GroupOp, { op: "create" }>, "id"> & { id?: string }) }
  | { op: "preview"; id: string }
  | { op: "create"; title: string; groupId?: string | null; delayMs?: number }
  // Simula otra pestaña: borra un grupo por su nombre.
  | { op: "drop"; name: string };

export type FixtureGroupsResult =
  | { ok: true; groups: GroupsState; catalogs: CatalogSummary[]; created: number; preview?: DeletePreview | null; id?: string }
  | { ok: false; error: string };

export async function fixtureGroupsMutate(op: FixtureGroupsOp): Promise<FixtureGroupsResult> {
  if (op.op === "reset") {
    (globalThis as GG)[KEY] = seed(op.kind ?? "normal");
  }
  const s = store();
  const done = (extra: Partial<Extract<FixtureGroupsResult, { ok: true }>> = {}): FixtureGroupsResult => ({ ok: true, groups: s.groups, catalogs: s.catalogs, created: s.created, ...extra });
  const own = new Set(s.catalogs.map((c) => c.id));
  switch (op.op) {
    case "reset":
    case "state":
      return done();
    case "many": {
      for (let i = 1; i <= (op.n ?? 30); i++) {
        const r = applyGroupOp(s.groups, { op: "create", parentId: null, name: `Zona de prueba ${String(i).padStart(2, "0")}`, id: randomUUID() }, own);
        if (r.ok) s.groups = r.state;
      }
      return done();
    }
    case "group": {
      const change = op.change.op === "create" ? { ...op.change, id: op.change.id ?? randomUUID() } : op.change;
      const r = applyGroupOp(s.groups, change as GroupOp, own);
      if (!r.ok) return { ok: false, error: r.error };
      s.groups = r.state;
      return done({ preview: r.preview ?? null });
    }
    case "preview": {
      const p = previewDelete(s.groups, op.id);
      return p ? done({ preview: p }) : { ok: false, error: "forbidden" };
    }
    case "drop": {
      const g = s.groups.groups.find((x) => x.name === op.name);
      if (g) {
        const r = applyGroupOp(s.groups, { op: "delete", id: g.id }, own);
        if (r.ok) s.groups = r.state;
      }
      return done();
    }
    case "create": {
      if (op.delayMs) await new Promise((res) => setTimeout(res, Math.min(op.delayMs!, 5000)));
      const title = (op.title ?? "").trim();
      if (!title || title.length > 160) return { ok: false, error: "title_invalid" };
      // Como catalog_create_in_group: si el grupo no existe, no se crea nada.
      if (op.groupId && !groupById(s.groups.groups, op.groupId)) return { ok: false, error: "forbidden" };
      const id = randomUUID();
      const now = new Date().toISOString();
      s.catalogs = [
        { id, title, intro: null, status: "active", version: 1, createdAt: now, updatedAt: now, itemCount: 0, numberLabel: null, edition: "Otoño 2026", coverPhotoUrl: null, contactName: "Fabricio Andree", mode: "manual", criteria: { ...DEFAULT_CRITERIA }, ads: [] },
        ...s.catalogs,
      ];
      s.created += 1;
      if (op.groupId) s.groups = { ...s.groups, members: [...s.groups.members, { groupId: op.groupId, catalogId: id }] };
      return done({ id });
    }
  }
}
