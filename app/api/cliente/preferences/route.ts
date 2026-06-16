import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import type { Operation, StayType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const {
      operation,
      stayType,
      preferredZone,
      budgetMin,
      budgetMax,
      universities,
      occupants,
      students,
      workers,
      pets,
    } = body;

    // Validate required fields
    if (!preferredZone) {
      return NextResponse.json(
        { error: "Zona preferida es requerida" },
        { status: 400 },
      );
    }

    // Convert to database format
    const payload = {
      client_id: user.id,
      operation: operation === "alquiler" ? "rent" : "sale",
      stay: stayType === "corta" ? "short" : "long",
      zones: preferredZone ? [preferredZone] : [],
      min_price: budgetMin,
      max_price: budgetMax,
      occupants,
      students,
      workers,
      pets,
      universities: universities || null,
    };

    // Check if preferences exist
    const { data: existing } = await supabase
      .from("client_preferences")
      .select("client_id")
      .eq("client_id", user.id)
      .maybeSingle();

    // Insert or update
    const { error } = existing
      ? await supabase
          .from("client_preferences")
          .update(payload)
          .eq("client_id", user.id)
      : await supabase
          .from("client_preferences")
          .insert(payload);

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Preferencias guardadas",
    });
  } catch (error) {
    console.error("Error saving preferences:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

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
      .from("client_preferences")
      .select("*")
      .eq("client_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({
        preferences: null,
      });
    }

    return NextResponse.json({
      preferences: {
        operation: data.operation === "sale" ? "venta" : "alquiler",
        stayType: data.stay === "long" ? "larga" : "corta",
        preferredZone: data.zones?.[0] || "",
        budgetMin: data.min_price || 0,
        budgetMax: data.max_price || 0,
        universities: data.universities || "",
        occupants: data.occupants || 1,
        students: data.students || 0,
        workers: data.workers || 0,
        pets: data.pets || false,
      },
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
