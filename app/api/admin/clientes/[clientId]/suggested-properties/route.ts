import { NextRequest, NextResponse } from "next/server";
import { getSuggestedProperties } from "@/lib/db/queries/suggested-properties";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ clientId: string }>;
  },
) {
  try {
    const supabase = await createClient();
    const auth = await requireStaff(supabase);

    if (!auth.ok) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { clientId } = await params;

    // Validate that the client exists and belongs to this staff
    const { data: client, error: clientError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError || !client || client.role !== "client") {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 },
      );
    }

    // Get suggested properties
    const suggestions = await getSuggestedProperties(clientId);

    return NextResponse.json({
      ok: true,
      suggestions,
    });
  } catch (error) {
    console.error("Error in suggested properties endpoint:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 },
    );
  }
}
