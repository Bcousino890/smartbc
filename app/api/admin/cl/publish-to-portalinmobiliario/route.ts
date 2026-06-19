import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { publishPropertyToPortalinmobiliario } from "@/lib/sync/portalinmobiliario/publisher";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userCountry = (profile as any).country ?? "es";
    if (userCountry !== "cl") {
      return NextResponse.json(
        { error: "This endpoint is only for Chile users" },
        { status: 403 }
      );
    }

    const { propertyId } = await request.json();
    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );
    }

    const db = createAdminClient() as any;

    // Fetch property from database
    const { data: property, error } = await db
      .from("properties")
      .select("id, title, description, price, address, bedrooms, bathrooms, square_meters")
      .eq("id", propertyId)
      .eq("country", "cl")
      .maybeSingle();

    if (error || !property) {
      return NextResponse.json(
        { error: "Property not found or not accessible" },
        { status: 404 }
      );
    }

    // Fetch property photos
    const { data: photos } = await db
      .from("property_photos")
      .select("url")
      .eq("property_id", propertyId)
      .order("position", { ascending: true });

    const imageUrls = (photos || []).map((p: any) => p.url);

    // Publish to Portalinmobiliario
    const result = await publishPropertyToPortalinmobiliario({
      title: property.title,
      description: property.description || "",
      price: property.price,
      address: property.address || "",
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      squareMeters: property.square_meters,
      propertyType: "apartment",
      imageUrls,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // TODO: Save Portalinmobiliario ID to properties table for tracking
    // once the API integration is complete

    return NextResponse.json({
      success: true,
      portaliId: result.portaliId,
      url: result.url,
    });
  } catch (err) {
    console.error("[publish-portalinmobiliario]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
