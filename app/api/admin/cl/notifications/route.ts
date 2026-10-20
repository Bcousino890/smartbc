import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("crm_notifications")
      .select("*")
      .eq("user_id", profile.id)
      // 0218: los avisos de opiniones de catálogos van en la campana del CRM.
      .neq("type", "catalog_feedback")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const db = createAdminClient() as any;

    if (body.action === "mark_read") {
      const ids = body.ids as string[];
      await db
        .from("crm_notifications")
        .update({ read: true })
        .in("id", ids)
        .eq("user_id", profile.id);
    } else if (body.action === "mark_all_read") {
      await db
        .from("crm_notifications")
        .update({ read: true })
        .eq("user_id", profile.id)
        .eq("read", false)
        .neq("type", "catalog_feedback");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
