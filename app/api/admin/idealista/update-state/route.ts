import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { listingId, newState } = await req.json();

  if (!listingId || !newState) {
    return NextResponse.json(
      { error: "listingId y newState son requeridos" },
      { status: 400 }
    );
  }

  const validStates = ["draft", "published", "failed"];
  if (!validStates.includes(newState)) {
    return NextResponse.json(
      { error: `Estado inválido. Debe ser uno de: ${validStates.join(", ")}` },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Actualizar el estado
  const { data, error } = await db
    .from("idealista_listings")
    .update({ idealista_state: newState })
    .eq("id", listingId)
    .select("idealista_state")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    newState: data.idealista_state,
  });
}
