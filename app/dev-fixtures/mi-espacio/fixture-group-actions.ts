"use client";

import { CREATE_IN_GROUP_FAILED, groupErrorMessage } from "@/lib/catalogs/errors";
import type { ActionResult } from "@/lib/catalogs/access";
import type { GroupActions } from "@/components/admin/catalogs/groups/types";
import type { CreateCatalogInput } from "@/components/admin/catalogs/new-catalog-form";
import type { FixtureGroupsOp, FixtureGroupsResult } from "@/lib/catalogs/fixture-groups";

// SOLO DESARROLLO LOCAL (HOME · grupos): las acciones de grupos y de crear un
// catálogo contra el almacén sintético (/dev-fixtures/api/grupos). Mismas
// respuestas y mensajes que las acciones de servidor. Las pruebas pueden
// retrasar la creación con window.__fxCreateDelay (ms) para probar el doble envío.

async function call(op: FixtureGroupsOp): Promise<FixtureGroupsResult> {
  const r = await fetch("/dev-fixtures/api/grupos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
  return (await r.json()) as FixtureGroupsResult;
}

const toGroups = (r: FixtureGroupsResult) => (r.ok ? { ok: true as const, groups: r.groups } : { ok: false as const, error: groupErrorMessage(r.error) });

export function fixtureGroupActions(): GroupActions {
  return {
    list: async () => toGroups(await call({ op: "state" })),
    create: async ({ parentId, name }) => toGroups(await call({ op: "group", change: { op: "create", parentId, name } })),
    rename: async ({ groupId, name }) => toGroups(await call({ op: "group", change: { op: "rename", id: groupId, name } })),
    reorder: async ({ parentId, ids }) => toGroups(await call({ op: "group", change: { op: "reorder", parentId, ids } })),
    move: async ({ groupId, parentId }) => toGroups(await call({ op: "group", change: { op: "move", id: groupId, parentId } })),
    previewDelete: async ({ groupId }) => {
      const r = await call({ op: "preview", id: groupId });
      return r.ok && r.preview ? { ok: true as const, preview: r.preview } : { ok: false as const, error: groupErrorMessage(r.ok ? "forbidden" : r.error) };
    },
    remove: async ({ groupId }) => {
      const r = await call({ op: "group", change: { op: "delete", id: groupId } });
      return r.ok && r.preview ? { ok: true as const, groups: r.groups, preview: r.preview } : { ok: false as const, error: groupErrorMessage(r.ok ? "forbidden" : r.error) };
    },
    setMember: async ({ groupId, catalogId, member }) => toGroups(await call({ op: "group", change: { op: "member", groupId, catalogId, member } })),
  };
}

export async function fixtureCreateCatalog(i: CreateCatalogInput): Promise<ActionResult<{ id: string }>> {
  const delay = (window as unknown as { __fxCreateDelay?: number }).__fxCreateDelay;
  const r = await call({ op: "create", title: i.title, groupId: i.groupId ?? null, delayMs: delay });
  if (r.ok && r.id) return { ok: true, id: r.id };
  if (!r.ok && r.error === "forbidden" && i.groupId) return { ok: false, error: CREATE_IN_GROUP_FAILED };
  return { ok: false, error: groupErrorMessage(r.ok ? "forbidden" : r.error) };
}
