import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import { NextRequest, NextResponse } from "next/server";

// Leads del inbox de Idealista matcheados a una ficha concreta (ver
// matched_listing_id en app/api/extension/idealista-leads/route.ts), para el
// popup que se abre al pinchar el badge "N leads" en /es/admin/idealista.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "publicacion", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: listingId } = await params;
  if (!listingId) {
    return NextResponse.json({ error: "listingId es requerido" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data, error } = await db
    .from("idealista_leads")
    .select("id, name, phone, phone_country, is_international, message, contact_status, status, created_at, message_date")
    .eq("matched_listing_id", listingId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
