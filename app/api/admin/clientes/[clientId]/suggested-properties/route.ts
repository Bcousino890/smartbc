import { NextRequest, NextResponse } from "next/server";
import { getSuggestedProperties } from "@/lib/db/queries/suggested-properties";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { canActOnClient } from "@/lib/db/queries/view-scope";
import { parseSuggestionQuery } from "@/lib/encargos/pin";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const gate = await requirePermission("clientes", "view");
    if (!gate.ok) return gate.response;

    const { clientId } = await params;
    if (!(await canActOnClient(clientId, "clientes", "view"))) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // El país del cliente aísla el catálogo: sin esto un cliente de España
    // recibía sugerencias de Chile y viceversa.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: client } = await admin
      .from("profiles")
      .select("id, role, country")
      .eq("id", clientId)
      .maybeSingle();

    if (!client || client.role !== "client") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const { data: prefs } = await admin
      .from("client_preferences")
      .select("new_listing_alerts_enabled")
      .eq("client_id", clientId)
      .eq("is_primary", true)
      .maybeSingle();
    const alertsEnabled = Boolean(prefs?.new_listing_alerts_enabled);

    // `?encargo=` elige uno de los encargos del cliente (España) e `?incluir=`
    // la propiedad de un aviso, evaluada contra ese encargo aunque no esté entre
    // las mejores. Solo uuid (basura → se ignora); la consulta filtra por
    // client_id Y id, así que un encargo de otro cliente no devuelve nada.
    const { encargoId, includeId } = parseSuggestionQuery(req.nextUrl.searchParams);
    const result = await getSuggestedProperties(clientId, {
      country: client.country ?? undefined,
      ...(encargoId ? { encargoId } : {}),
      ...(includeId ? { includeId } : {}),
    });

    if (!result.ok) {
      // "Sin preferencias" no es un error: es un estado normal del cliente y
      // la UI lo distingue para poder invitar a configurarlas.
      if (result.reason === "insufficient_brief") {
        return NextResponse.json({
          ok: true,
          suggestions: [],
          total: 0,
          reason: "insufficient_brief",
          missing: result.missing,
          alertsEnabled,
        });
      }
      if (result.reason === "no_preferences") {
        return NextResponse.json({
          ok: true,
          suggestions: [],
          reason: "no_preferences",
          alertsEnabled,
        });
      }
      return NextResponse.json(
        { error: result.message, reason: "error" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      suggestions: result.suggestions,
      total: result.total ?? result.suggestions.length,
      excluded: result.excluded ?? [],
      ...(result.highlight ? { highlight: result.highlight } : {}),
      alertsEnabled,
    });
  } catch (error) {
    console.error("Error in suggested properties endpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
