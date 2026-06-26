import { NextResponse } from "next/server";
import { getSuggestedProperties } from "@/lib/db/queries/suggested-properties";
import { createClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Get suggested properties
    const properties = await getSuggestedProperties(user.id);

    return NextResponse.json({
      ok: true,
      properties: properties.map(p => ({
        ...p,
        stayType: "corta", // Add stayType for client display
      })),
    });
  } catch (error) {
    console.error("Error fetching suggested properties:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
