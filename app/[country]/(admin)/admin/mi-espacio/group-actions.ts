"use server";

// ============================================================================
// HOME · grupos de catálogos (0207). Cada acción:
//   1. pasa por la guarda del dueño (withHomeAccess);
//   2. llama a una función SQL de 0207 con p_actor = id del dueño, que vuelve a
//      comprobar que el grupo y el catálogo son suyos;
//   3. devuelve el estado nuevo de los grupos (la HOME y el gestor se
//      actualizan sin recargar la página).
// Organizar NO cambia ningún catálogo (ni su versión, ni su huella): por eso
// este archivo, a propósito, NO importa el vigilante de los lectores
// (sync-hub-instance) ni guardados del catálogo, y no revalida rutas. Lo
// vigila scripts/test-catalogs-manager.mts.
// ============================================================================

import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { withHomeAccess, type ActionResult } from "@/lib/catalogs/access";
import { groupErrorMessage } from "@/lib/catalogs/errors";
import { listOwnerGroups } from "@/lib/catalogs/group-data";
import { normalizeGroupName, type DeletePreview, type GroupsState } from "@/lib/catalogs/groups";
import { isHomeOwner } from "@/lib/catalogs/owner";
import { isUuid } from "@/lib/catalogs/validate";

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;
const ownerDeps = { getProfile: getCurrentProfile, isOwner: isHomeOwner };

type GroupsResult = ActionResult<{ groups: GroupsState }>;

function fail(err: Parameters<typeof groupErrorMessage>[0]): { ok: false; error: string } {
  return { ok: false, error: groupErrorMessage(err) };
}

function finish<T extends object>(res: ActionResult<T>): ActionResult<T> {
  if (!res.ok && (res.error === "forbidden" || res.error === "unauthenticated")) return fail(res.error);
  return res;
}

const id = (v: unknown): string | null => (typeof v === "string" && isUuid(v) ? v : null);

async function rpcThenState(ownerId: string, fn: string, args: Record<string, unknown>): Promise<GroupsResult> {
  const { error } = await db().rpc(fn, { p_actor: ownerId, ...args });
  if (error) return fail(error);
  return { ok: true as const, groups: await listOwnerGroups(ownerId) };
}

/** Estado actual (el diálogo del gestor lo vuelve a leer al abrirse). */
export async function listGroupsAction(): Promise<GroupsResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => ({ ok: true as const, groups: await listOwnerGroups(profile.id) })));
}

export async function createGroupAction(input: { parentId?: string | null; name: string }): Promise<GroupsResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const name = normalizeGroupName(input?.name);
    if (!name.ok) return fail(name.error);
    const parent = input?.parentId == null ? null : id(input.parentId);
    if (input?.parentId != null && !parent) return fail("forbidden");
    return rpcThenState(profile.id, "catalog_group_create", { p_parent: parent, p_name: name.value });
  }));
}

export async function renameGroupAction(input: { groupId: string; name: string }): Promise<GroupsResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const g = id(input?.groupId);
    if (!g) return fail("forbidden");
    const name = normalizeGroupName(input?.name);
    if (!name.ok) return fail(name.error);
    return rpcThenState(profile.id, "catalog_group_rename", { p_group: g, p_name: name.value });
  }));
}

export async function reorderGroupsAction(input: { parentId?: string | null; ids: string[] }): Promise<GroupsResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const parent = input?.parentId == null ? null : id(input.parentId);
    if (input?.parentId != null && !parent) return fail("forbidden");
    const ids = Array.isArray(input?.ids) ? input.ids.map(id) : [];
    if (ids.some((x) => !x) || ids.length > 100) return fail("invalid_order");
    return rpcThenState(profile.id, "catalog_group_reorder", { p_parent: parent, p_ids: ids });
  }));
}

export async function moveGroupAction(input: { groupId: string; parentId: string }): Promise<GroupsResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const g = id(input?.groupId);
    const p = id(input?.parentId);
    if (!g || !p) return fail("forbidden");
    return rpcThenState(profile.id, "catalog_group_move", { p_group: g, p_parent: p });
  }));
}

export async function previewDeleteGroupAction(input: { groupId: string }): Promise<ActionResult<{ preview: DeletePreview }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const g = id(input?.groupId);
    if (!g) return fail("forbidden");
    const { data, error } = await db().rpc("catalog_group_preview_delete", { p_actor: profile.id, p_group: g });
    if (error || !data) return fail(error);
    return { ok: true as const, preview: data as DeletePreview };
  }));
}

export async function deleteGroupAction(input: { groupId: string }): Promise<ActionResult<{ groups: GroupsState; preview: DeletePreview }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const g = id(input?.groupId);
    if (!g) return fail("forbidden");
    const { data, error } = await db().rpc("catalog_group_delete", { p_actor: profile.id, p_group: g });
    if (error || !data) return fail(error);
    return { ok: true as const, preview: data as DeletePreview, groups: await listOwnerGroups(profile.id) };
  }));
}

export async function setCatalogGroupAction(input: { groupId: string; catalogId: string; member: boolean }): Promise<GroupsResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const g = id(input?.groupId);
    const c = id(input?.catalogId);
    if (!g || !c) return fail("forbidden");
    return rpcThenState(profile.id, "catalog_group_set_member", { p_group: g, p_catalog: c, p_member: input?.member === true });
  }));
}
