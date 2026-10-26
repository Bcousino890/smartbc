"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import {
  createCollabLink,
  listCollabLinks,
  revokeCollabLink,
  type CollabLinkRow,
} from "@/lib/db/queries/collab-links";

// Enlaces "en blanco" para empresas colaboradoras (migración 0231). Mismo
// permiso que los SmartLinks: editar propiedades.

type Resolved =
  | { ok: true; propertyId: string; userId: string }
  | { ok: false; error: string };

async function resolve(slug: string): Promise<Resolved> {
  const gate = await checkPermission("properties", "edit");
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data } = await supabase.from("properties").select("id").eq("slug", slug).maybeSingle();
  const prop = data as { id: string } | null;
  if (!prop) return { ok: false, error: "property_not_found" };
  return { ok: true, propertyId: prop.id, userId: auth.userId };
}

export async function createCollabLinkAction(
  slug: string,
): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  const r = await resolve(slug);
  if (!r.ok) return r;
  try {
    const { token, expiresAt } = await createCollabLink({ propertyId: r.propertyId, createdBy: r.userId });
    revalidatePath(`/admin/propiedades/${slug}`);
    return { ok: true, token, expiresAt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown_error" };
  }
}

export async function listCollabLinksAction(
  slug: string,
): Promise<{ ok: true; links: CollabLinkRow[] } | { ok: false; error: string }> {
  const r = await resolve(slug);
  if (!r.ok) return r;
  try {
    return { ok: true, links: await listCollabLinks(r.propertyId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown_error" };
  }
}

export async function revokeCollabLinkAction(
  slug: string,
  linkId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await resolve(slug);
  if (!r.ok) return r;
  // El enlace debe ser de ESTA propiedad: sin esto, un id ajeno bastaría.
  const links = await listCollabLinks(r.propertyId).catch(() => [] as CollabLinkRow[]);
  if (!links.some((l) => l.id === linkId)) return { ok: false, error: "link_not_found" };
  try {
    await revokeCollabLink(linkId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown_error" };
  }
}
