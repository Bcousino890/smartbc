import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];

// POST { slugs: string[], add?: tagId[], remove?: tagId[] }
// Añade y/o quita etiquetas a una o varias propiedades (ficha y lote).
export async function POST(req: Request) {
  try {
    const gate = await requirePermission("properties", "edit");
    if (!gate.ok) return gate.response;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const slugs = Array.isArray(body.slugs)
      ? (body.slugs.filter((s) => typeof s === "string") as string[]).slice(0, 2000)
      : [];
    const add = ids(body.add);
    const remove = ids(body.remove);
    if (slugs.length === 0 || (add.length === 0 && remove.length === 0))
      return Response.json({ error: "Faltan propiedades o etiquetas." }, { status: 400 });

    const props: { id: string; slug: string }[] = [];
    for (let i = 0; i < slugs.length; i += 200) {
      const { data, error } = await db()
        .from("properties")
        .select("id, slug")
        .in("slug", slugs.slice(i, i + 200));
      if (error) throw error;
      props.push(...(data ?? []));
    }
    if (props.length === 0)
      return Response.json({ error: "Propiedades no encontradas." }, { status: 404 });
    const propIds = props.map((p) => p.id);

    if (remove.length > 0) {
      for (let i = 0; i < propIds.length; i += 200) {
        const { error } = await db()
          .from("property_tag_links")
          .delete()
          .in("property_id", propIds.slice(i, i + 200))
          .in("tag_id", remove);
        if (error) throw error;
      }
    }
    if (add.length > 0) {
      const rows = propIds.flatMap((property_id) =>
        add.filter((t) => !remove.includes(t)).map((tag_id) => ({ property_id, tag_id })),
      );
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db()
          .from("property_tag_links")
          .upsert(rows.slice(i, i + 500), { onConflict: "property_id,tag_id", ignoreDuplicates: true });
        if (error) throw error;
      }
    }
    return Response.json({ ok: true, updated: props.length });
  } catch (err) {
    console.error("[property-tags] assign", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
