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
      return NextResponse.json({ error: "Only captadoras can log attempts" }, { status: 403 });
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
      .from("captacion_logs")
      .insert({
        captacion_id: id,
        created_by: profile.id,
        attempt_type: body.attempt_type,
        result: body.result,
        owner_phone: body.owner_phone || null,
        owner_name: body.owner_name || null,
        owner_contact: body.owner_contact || null,
        address_real: body.address_real || null,
        notes: body.notes || null,
        photo_url: body.photo_url || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[captaciones log]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error logging attempt" },
      { status: 500 }
    );
  }
}
