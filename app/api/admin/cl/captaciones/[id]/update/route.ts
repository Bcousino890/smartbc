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
      return NextResponse.json({ error: "Solo captadoras pueden actualizar" }, { status: 403 });
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    // Verify ownership and get created_by for notification
    const { data: captacion } = await db
      .from("captaciones")
      .select("assigned_to, created_by, title, owner_confirmed")
      .eq("id", id)
      .single();

    if (!captacion || captacion.assigned_to !== profile.id) {
      return NextResponse.json({ error: "No asignada a ti" }, { status: 403 });
    }

    const wasConfirmed = captacion.owner_confirmed;
    const nowConfirmed = body.owner_confirmed || false;

    const { data, error } = await db
      .from("captaciones")
      .update({
        owner_phone: body.owner_phone || null,
        owner_name: body.owner_name || null,
        owner_contact: body.owner_contact || null,
        address_real: body.address_real || null,
        owner_confirmed: nowConfirmed,
        notes: body.notes || null,
        status: nowConfirmed ? "completed" : "pending",
        completed_at: nowConfirmed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Notify agent when captadora confirms owner for the first time
    if (nowConfirmed && !wasConfirmed && captacion.created_by) {
      const propertyTitle = captacion.title || "Captación";
      await db.from("crm_notifications").insert({
        user_id: captacion.created_by,
        type: "captacion_completed",
        title: "Captación lista para contactar",
        body: `${profile.full_name || "La captadora"} confirmó que el dueño quiere vender: ${propertyTitle}`,
        link: `/cl/admin/captaciones/${id}`,
        data: { captacion_id: id },
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[captaciones update]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar" },
      { status: 500 }
    );
  }
}
