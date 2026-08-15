import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";

export async function GET(req: Request) {
  try {
    // Antes había un array de roles en línea que omitía `captadora` y no
    // consultaba la matriz de permisos ni los overrides por usuario.
    const gate = await requirePermission("properties", "view");
    if (!gate.ok) return gate.response;

    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const countryParam = url.searchParams.get("country");
    const country =
      countryParam === "es" || countryParam === "cl" ? countryParam : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (createAdminClient() as any)
      .from("properties")
      .select(
        "id, slug, title, address, bc_reference, cover_photo_url, price, operation",
      )
      // Una propiedad archivada no debe poder añadirse a nada.
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (country) query = query.eq("country", country);

    if (q.trim()) {
      query = query.or(
        `title.ilike.%${q}%,address.ilike.%${q}%,bc_reference.ilike.%${q}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ data: data ?? [] });
  } catch (err) {
    console.error("[properties-search] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
