import { NextRequest, NextResponse } from "next/server";
import { getSuggestedParticulares } from "@/lib/db/queries/suggested-particulares";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { canActOnClient } from "@/lib/db/queries/view-scope";

export const dynamic = "force-dynamic";

/**
 * Anuncios de portales (tabla `particulares`) que encajan con el encargo del
 * cliente. Exige poder ver clientes Y particulares: esos anuncios llevan
 * teléfono del propietario y no son para cualquier rol.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const gate = await requirePermission("clientes", "view");
    if (!gate.ok) return gate.response;
    const gate2 = await requirePermission("particulares", "view");
    if (!gate2.ok) return gate2.response;

    const { clientId } = await params;
    if (!(await canActOnClient(clientId, "clientes", "view"))) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Los anuncios scrapeados son solo de España: a un cliente de otro país
    // no se le cruzan (vacío explícito, no un error).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: client } = await admin.from("profiles").select("role, country").eq("id", clientId).maybeSingle();
    if (!client || client.role !== "client") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    if (client.country && client.country !== "es") {
      return NextResponse.json({ ok: true, suggestions: [], total: 0, excluded: [], reason: "not_available" });
    }

    // La ficha del cliente enseña las 12 mejores (por defecto). El mapa de
    // captaciones necesita la puntuación de TODOS los candidatos de la zona
    // para pintar los pines: pide `?limit=` (con tope en el techo de candidatos).
    const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : undefined;
    const result = await getSuggestedParticulares(clientId, limit ? { limit } : undefined);

    if (!result.ok) {
      if (result.reason === "insufficient_brief") {
        return NextResponse.json({ ok: true, suggestions: [], total: 0, excluded: [], reason: "insufficient_brief", missing: result.missing, brief: result.brief });
      }
      if (result.reason === "no_preferences") {
        return NextResponse.json({ ok: true, suggestions: [], excluded: [], reason: "no_preferences" });
      }
      return NextResponse.json({ error: result.message, reason: "error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, suggestions: result.suggestions, total: result.total, excluded: result.excluded, brief: result.brief });
  } catch (error) {
    console.error("Error in suggested particulares endpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
