import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || !["admin", "agent"].includes(profile.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from("captaciones")
      .insert({
        country: "cl",
        created_by: profile.id,
        source_url: body.source_url,
        source_site: body.source_site || null,
        title: body.title || null,
        price: body.price || null,
        bedrooms: body.bedrooms || null,
        bathrooms: body.bathrooms || null,
        square_meters: body.square_meters || null,
        cover_photo_url: body.cover_photo_url || null,
        region: body.region || null,
        commune: body.commune || null,
        zone: body.zone || null,
        notes: body.notes || null,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[captaciones create]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creating captacion" },
      { status: 500 }
    );
  }
}
