import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { isValidColor, validateTagName } from "@/lib/properties/tags";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH { name?, color? } → renombrar / recolorear.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requirePermission("properties", "edit");
    if (!gate.ok) return gate.response;
    const { id } = await params;
    if (!UUID.test(id)) return Response.json({ error: "Id no válido" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, string> = {};
    if (body.name !== undefined) {
      const v = validateTagName(body.name);
      if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
      patch.name = v.name;
    }
    if (body.color !== undefined) {
      if (!isValidColor(body.color))
        return Response.json({ error: "Color no válido (#RRGGBB)." }, { status: 400 });
      patch.color = body.color;
    }
    if (Object.keys(patch).length === 0)
      return Response.json({ error: "Nada que cambiar." }, { status: 400 });
    const { data, error } = await db()
      .from("property_tags")
      .update(patch)
      .eq("id", id)
      .select("id, name, color, country")
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "23505")
        return Response.json({ error: "Ya existe una etiqueta con ese nombre." }, { status: 409 });
      throw error;
    }
    if (!data) return Response.json({ error: "No existe" }, { status: 404 });
    return Response.json({ data });
  } catch (err) {
    console.error("[property-tags] PATCH", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE → borra la etiqueta y, en cascada, sus asignaciones.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requirePermission("properties", "delete");
    if (!gate.ok) return gate.response;
    const { id } = await params;
    if (!UUID.test(id)) return Response.json({ error: "Id no válido" }, { status: 400 });
    const { error } = await db().from("property_tags").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[property-tags] DELETE", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
