import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { propertyId, ...listingData } = data;

    if (!propertyId) {
      return Response.json(
        { error: "Property ID requerido" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Guardar en tabla idealista_listings
    const { error } = await (supabase
      .from("idealista_listings")
      .upsert(
        {
          property_id: propertyId,
          square_meters: listingData.squareMeters,
          built_square_meters: listingData.builtSquareMeters,
          price: listingData.price,
          total_rental_price: listingData.totalRentalPrice,
          has_elevator: listingData.hasElevator,
          rental_type: listingData.rentalType,
          floor: listingData.floor,
          condition: listingData.condition,
          energy_class: listingData.energyClass,
          equipment: listingData.equipment,
          photo_ids: listingData.photos?.map((p: any) => p.id) || [],
          video_ids: listingData.videos?.map((v: any) => v.id) || [],
          plan_ids: listingData.plans?.map((pl: any) => pl.id) || [],
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "property_id" }
      ) as any);

    if (error) {
      console.error("DB error:", error);
      return Response.json(
        { error: "Error al guardar en base de datos" },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Save error:", error);
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
