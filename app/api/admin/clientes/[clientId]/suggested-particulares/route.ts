import { NextRequest, NextResponse } from "next/server";
import { getSuggestedParticulares } from "@/lib/db/queries/suggested-particulares";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Anuncios de portales (tabla `particulares`) que encajan con el encargo del
 * cliente. Exige poder ver clientes Y particulares: esos anuncios llevan
 * teléfono del propietario y no son para cualquier rol.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const gate = await requirePermission("clientes", "view");
    if (!gate.ok) return gate.response;
    const gate2 = await requirePermission("particulares", "view");
    if (!gate2.ok) return gate2.response;

    const { clientId } = await params;
    const result = await getSuggestedParticulares(clientId);

    if (!result.ok) {
      if (result.reason === "no_preferences") {
        return NextResponse.json({ ok: true, suggestions: [], excluded: [], reason: "no_preferences" });
      }
      return NextResponse.json({ error: result.message, reason: "error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, suggestions: result.suggestions, excluded: result.excluded });
  } catch (error) {
    console.error("Error in suggested particulares endpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
