import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { GroupsState } from "./groups";

// ============================================================================
// HOME · grupos: lectura de los grupos y asignaciones del dueño (0203). Solo
// lee, y siempre filtrado por owner_id. Si la lectura falla (por ejemplo,
// código nuevo con la migración sin aplicar: 42P01/PGRST205) devuelve
// available: false y la HOME se pinta como antes, sin grupos; lo avisa una vez
// en el registro del servidor.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;
let warned = false;

function unavailable(err: any): GroupsState {
  if (!warned) {
    warned = true;
    console.warn("[catalogos] grupos no disponibles:", err?.code ?? "", err?.message ?? err);
  }
  return { available: false, groups: [], members: [] };
}

export async function listOwnerGroups(ownerId: string): Promise<GroupsState> {
  const { data: groups, error } = await db()
    .from("catalog_groups")
    .select("id, parent_id, name, position")
    .eq("owner_id", ownerId)
    .order("position", { ascending: true });
  if (error) return unavailable(error);
  const ids = (groups ?? []).map((g: any) => g.id);
  let members: any[] = [];
  if (ids.length) {
    const res = await db().from("catalog_group_members").select("group_id, catalog_id").in("group_id", ids);
    if (res.error) return unavailable(res.error);
    members = res.data ?? [];
  }
  return {
    available: true,
    groups: (groups ?? []).map((g: any) => ({ id: String(g.id), parentId: g.parent_id ? String(g.parent_id) : null, name: String(g.name), position: Number(g.position) })),
    members: members.map((m: any) => ({ groupId: String(m.group_id), catalogId: String(m.catalog_id) })),
  };
}
