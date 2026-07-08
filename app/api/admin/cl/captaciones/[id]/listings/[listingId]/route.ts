import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

const ALLOWED_ROLES = [
  "admin",
  "agent",
  "agent_junior",
  "agent_senior",
  "agent_admin",
  "captadora",
];

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const db = createAdminClient() as any;
    const { error } = await db
      .from("captacion_listings")
      .delete()
      .eq("id", listingId)
      .eq("captacion_id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[captacion listings DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar aviso" },
      { status: 500 }
    );
  }
}
