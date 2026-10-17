import { createAdminClient } from "@/lib/db/admin";
import { requirePermission } from "@/lib/auth/guard";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Antes no comprobaba ni sesión: cualquiera podía leer el historial de
  // estados y motivos de un anuncio con solo conocer su id (lectura con
  // service role y sin guard; el middleware no protege /api).
  const gate = await requirePermission("publicacion", "view");
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const listingId = searchParams.get("listingId");

  if (!listingId) {
    return NextResponse.json(
      { error: "listingId is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("idealista_listing_status_history")
    .select("id, old_state, new_state, changed_at, reason")
    .eq("listing_id", listingId)
    .order("changed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
