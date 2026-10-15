import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import {
  DEFAULT_TAG_COLOR,
  findTagByName,
  isValidColor,
  validateTagName,
} from "@/lib/properties/tags";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;
const parseCountry = (v: unknown) => (v === "cl" ? "cl" : "es");

// GET /api/admin/property-tags?country=es → catálogo de etiquetas.
export async function GET(req: Request) {
  try {
    const gate = await requirePermission("properties", "view");
    if (!gate.ok) return gate.response;
    const country = parseCountry(new URL(req.url).searchParams.get("country"));
    const { data, error } = await db()
      .from("property_tags")
      .select("id, name, color, country")
      .eq("country", country)
      .order("name", { ascending: true });
    if (error) throw error;
    return Response.json({ data: data ?? [] });
  } catch (err) {
    console.error("[property-tags] GET", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST { name, color?, country } → crea la etiqueta (o devuelve la que ya
// existe con ese nombre, para el "crear al vuelo" sin duplicados).
export async function POST(req: Request) {
  try {
    const gate = await requirePermission("properties", "edit");
    if (!gate.ok) return gate.response;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const v = validateTagName(body.name);
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
    const country = parseCountry(body.country);
    const color = isValidColor(body.color) ? body.color : DEFAULT_TAG_COLOR;

    const { data: existing } = await db()
      .from("property_tags")
      .select("id, name, color, country")
      .eq("country", country);
    const dup = findTagByName((existing ?? []) as { name: string }[], v.name);
    if (dup) return Response.json({ data: dup, existed: true });

    const { data, error } = await db()
      .from("property_tags")
      .insert({ country, name: v.name, color, created_by: gate.profile.id })
      .select("id, name, color, country")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505")
        return Response.json({ error: "Ya existe una etiqueta con ese nombre." }, { status: 409 });
      throw error;
    }
    return Response.json({ data });
  } catch (err) {
    console.error("[property-tags] POST", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
