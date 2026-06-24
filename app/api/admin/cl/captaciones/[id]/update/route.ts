import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "captadora") {
      return NextResponse.json({ error: "Only captadoras can update" }, { status: 403 });
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    // Verify ownership
    const { data: captacion } = await db
      .from("captaciones")
      .select("assigned_to")
      .eq("id", id)
      .single();

    if (!captacion || captacion.assigned_to !== profile.id) {
      return NextResponse.json({ error: "Not assigned to you" }, { status: 403 });
    }

    const { data, error } = await db
      .from("captaciones")
      .update({
        owner_phone: body.owner_phone || null,
        owner_name: body.owner_name || null,
        owner_contact: body.owner_contact || null,
        address_real: body.address_real || null,
        owner_confirmed: body.owner_confirmed || false,
        notes: body.notes || null,
        status: body.owner_confirmed ? "completed" : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[captaciones update]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error updating" },
      { status: 500 }
    );
  }
}
