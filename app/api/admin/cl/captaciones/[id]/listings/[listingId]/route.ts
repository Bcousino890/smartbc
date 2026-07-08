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

// PATCH { broker_website_url }: guarda la URL de la misma propiedad en la web
// interna de la corredora, para trackearla aparte del aviso del portal.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const raw = typeof body.broker_website_url === "string" ? body.broker_website_url.trim() : "";
    if (raw && !/^https?:\/\//i.test(raw)) {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("captacion_listings")
      .update({
        broker_website_url: raw || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId)
      .eq("captacion_id", id)
      .select("*, prices:captacion_listing_prices(price, currency, source, scraped_at)")
      .single();

    if (error) throw error;

    data.prices = (data.prices || []).sort(
      (a: any, b: any) =>
        new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
    );

    return NextResponse.json(data);
  } catch (err) {
    console.error("[captacion listing PATCH]", err);
    const msg = err instanceof Error ? err.message : (err as any)?.message || "Error al guardar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
    const msg = err instanceof Error ? err.message : (err as any)?.message || "Error al eliminar aviso";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
