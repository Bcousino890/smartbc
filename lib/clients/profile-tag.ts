import "server-only";

// ============================================================================
// El perfil del cliente (estudiante, trabajador, familia…) no tiene columna:
// es una etiqueta de `client_tags` (ver lib/clients/display.ts). Hasta
// 2026-10-01 solo se ponía al CREAR el cliente, y nunca se quitaba: cambiarlo
// a mano desde etiquetas dejaba dos perfiles a la vez y la ficha enseñaba el
// primero que encontrara.
//
// Aquí se fija el perfil: se asigna el nuevo y se retiran los demás perfiles.
// El resto de etiquetas del cliente no se tocan.
// ============================================================================

import { PROFILE_TAG, type BriefProfile } from "./brief";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function setClientProfileTag(
  db: Db,
  clientId: string,
  profile: BriefProfile,
  assignedBy: string | null = null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = PROFILE_TAG[profile];
  if (!name) return { ok: false, error: "Perfil no válido." };

  const { data: existing } = await db
    .from("client_tags")
    .select("id, name")
    .in("name", Object.values(PROFILE_TAG));

  const tags = (existing ?? []) as Array<{ id: string; name: string }>;
  let tagId = tags.find((t) => t.name === name)?.id ?? null;

  if (!tagId) {
    const { data: created, error } = await db
      .from("client_tags")
      .insert({ name })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "No se pudo crear el perfil." };
    tagId = created.id as string;
  }

  const others = tags.filter((t) => t.name !== name).map((t) => t.id);
  if (others.length) {
    const { error } = await db
      .from("client_tag_assignments")
      .delete()
      .eq("client_id", clientId)
      .in("tag_id", others);
    if (error) return { ok: false, error: error.message };
  }

  const { error } = await db
    .from("client_tag_assignments")
    .upsert(
      { client_id: clientId, tag_id: tagId, assigned_by: assignedBy },
      { onConflict: "client_id,tag_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
