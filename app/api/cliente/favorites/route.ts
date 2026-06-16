import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from("favorites")
      .select("property_id")
      .eq("client_id", user.id);

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    const typedData = (data as any) || [];
    return NextResponse.json({
      favorites: typedData.map((f: any) => f.property_id) || [],
    });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { propertyId } = await req.json();

    if (!propertyId) {
      return NextResponse.json(
        { error: "Property ID is required" },
        { status: 400 },
      );
    }

    // Check if already favorited
    const { data: existing } = await supabase
      .from("favorites")
      .select("property_id")
      .eq("client_id", user.id)
      .eq("property_id", propertyId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Already in favorites" },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("favorites").insert({
      client_id: user.id,
      property_id: propertyId,
    } as any);

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Added to favorites",
    });
  } catch (error) {
    console.error("Error adding to favorites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { propertyId } = await req.json();

    if (!propertyId) {
      return NextResponse.json(
        { error: "Property ID is required" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("client_id", user.id)
      .eq("property_id", propertyId);

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Removed from favorites",
    });
  } catch (error) {
    console.error("Error removing from favorites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
