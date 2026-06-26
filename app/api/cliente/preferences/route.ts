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
      ? await (supabase
          .from("client_preferences") as any)
          .update(payload)
          .eq("client_id", user.id)
      : await (supabase
          .from("client_preferences") as any)
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

    const typedData = data as any;
    return NextResponse.json({
      preferences: {
        operation: typedData.operation === "sale" ? "venta" : "alquiler",
        stayType: typedData.stay === "long" ? "larga" : "corta",
        preferredZone: typedData.zones?.[0] || "",
        budgetMin: typedData.min_price || 0,
        budgetMax: typedData.max_price || 0,
        universities: typedData.universities || "",
        occupants: typedData.occupants || 1,
        students: typedData.students || 0,
        workers: typedData.workers || 0,
        pets: typedData.pets || false,
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
