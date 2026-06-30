import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";

/**
 * Geocodificación usando Nominatim (OpenStreetMap)
 * Soporta:
 * - Geocoding: dirección → latitud/longitud
 * - Reverse geocoding: latitud/longitud → dirección
 */

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();

    // Caso 1: Geocodificación (dirección → lat/lng)
    if (body.address) {
      const address = encodeURIComponent(body.address);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${address}&limit=1`,
        {
          headers: {
            "User-Agent": "SmartBC/1.0",
          },
        }
      );

      if (!response.ok) {
        return NextResponse.json(
          { error: "Error al consultar Nominatim" },
          { status: 500 }
        );
      }

      const data = await response.json();
      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: "Dirección no encontrada" },
          { status: 404 }
        );
      }

      const result = data[0];
      return NextResponse.json({
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        formatted_address: result.display_name,
      });
    }

    // Caso 2: Reverse geocodificación (lat/lng → dirección)
    if (body.latitude !== undefined && body.longitude !== undefined) {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${body.latitude}&lon=${body.longitude}`,
        {
          headers: {
            "User-Agent": "SmartBC/1.0",
          },
        }
      );

      if (!response.ok) {
        return NextResponse.json(
          { error: "Error al consultar Nominatim" },
          { status: 500 }
        );
      }

      const data = await response.json();
      if (!data || !data.address) {
        return NextResponse.json(
          { error: "Ubicación no encontrada" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        address: data.display_name,
        latitude: parseFloat(data.lat),
        longitude: parseFloat(data.lon),
      });
    }

    return NextResponse.json(
      { error: "Parámetros inválidos. Envía 'address' o 'latitude'+'longitude'" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[geocode]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en geocodificación" },
      { status: 500 }
    );
  }
}
