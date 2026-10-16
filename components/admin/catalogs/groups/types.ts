import type { ActionResult } from "@/lib/catalogs/access";
import type { DeletePreview, GroupsState } from "@/lib/catalogs/groups";

// Acciones de los grupos, inyectadas: en la página real, las acciones de
// servidor de group-actions.ts; en las fixtures, llamadas al almacén sintético.

export type GroupsRes = ActionResult<{ groups: GroupsState }>;

export interface GroupActions {
  list: () => Promise<GroupsRes>;
  create: (i: { parentId: string | null; name: string }) => Promise<GroupsRes>;
  rename: (i: { groupId: string; name: string }) => Promise<GroupsRes>;
  reorder: (i: { parentId: string | null; ids: string[] }) => Promise<GroupsRes>;
  move: (i: { groupId: string; parentId: string }) => Promise<GroupsRes>;
  previewDelete: (i: { groupId: string }) => Promise<ActionResult<{ preview: DeletePreview }>>;
  remove: (i: { groupId: string }) => Promise<ActionResult<{ groups: GroupsState; preview: DeletePreview }>>;
  setMember: (i: { groupId: string; catalogId: string; member: boolean }) => Promise<GroupsRes>;
}
