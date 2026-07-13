import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { requirePermission } from "@/lib/auth/guard";

export async function POST(req: Request) {
  try {
    // Gate de autorización: guardar una publicación de Idealista requiere publicacion/edit.
    const gate = await requirePermission("publicacion", "edit");
    if (!gate.ok) return gate.response;

    const body = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const isInspo = body.isInspo === true;

    const { data: existing } =
      isInspo && body.listingId
        ? await db.from("idealista_listings").select("id").eq("id", body.listingId).limit(1).single()
        : !isInspo && body.propertyId
        ? await db.from("idealista_listings").select("id").eq("property_id", body.propertyId).limit(1).single()
        : { data: null };

    const record = {
      is_inspo: isInspo,
      inspo_title: body.inspoTitle ?? null,
      ...(!isInspo && body.propertyId ? { property_id: body.propertyId } : {}),
      // NULL (no "") cuando está vacío: reference_code tiene un UNIQUE, y varias
      // inspo sin código guardarían "" repetido y chocarían. Varios NULL sí valen.
      reference_code: body.referenceCode || null,
      property_type: body.propertyType ?? "flat",
      cadastral_reference: body.cadastralReference ?? "",
      address_street: body.addressStreet ?? "",
      address_number: body.addressNumber ?? "",
      has_no_number: body.hasNoNumber ?? false,
      address_postal_code: body.addressPostalCode ?? "",
      address_city: body.addressCity ?? "",
      address_block: body.addressBlock ?? "",
      address_door: body.addressDoor ?? "",
      building_name: body.buildingName ?? "",
      is_last_floor: body.isLastFloor ?? false,
      address_visibility: body.addressVisibility ?? "exact",
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      square_meters: body.squareMeters || null,
      built_square_meters: body.builtSquareMeters || null,
      floor: body.floor ?? "",
      bedrooms: body.bedrooms ?? 0,
      bathrooms: body.bathrooms ?? 0,
      condition: body.condition ?? "good",
      operation: body.operation ?? "rent",
      price: body.price || null,
      community_fees: body.communityFees || null,
      sale_exception: body.saleException ?? "none",
      total_rental_price: body.totalRentalPrice || null,
      rental_type: body.rentalType ?? "residential",
      max_tenants: body.maxTenants || null,
      pets_allowed: body.petsAllowed ?? false,
      children_recommended: body.childrenRecommended ?? false,
      equipment_type: body.equipmentType ?? "unknown",
      windows_location: body.windowsLocation ?? "exterior",
      has_elevator: body.hasElevator ?? false,
      is_bank_property: body.isBankProperty ?? false,
      heating_type: body.heatingType ?? "unknown",
      construction_year: body.constructionYear || null,
      has_adapted_access: body.hasAdaptedAccess ?? false,
      has_wheelchair_access: body.hasWheelchairAccess ?? false,
      orientation_north: body.orientationNorth ?? false,
      orientation_south: body.orientationSouth ?? false,
      orientation_east: body.orientationEast ?? false,
      orientation_west: body.orientationWest ?? false,
      has_terrace: body.hasTerrace ?? false,
      has_balcony: body.hasBalcony ?? false,
      has_parking: body.hasParking ?? false,
      has_storage: body.hasStorage ?? false,
      has_pool: body.hasPool ?? false,
      has_garden: body.hasGarden ?? false,
      has_wardrobes: body.hasWardrobes ?? false,
      has_ac: body.hasAC ?? false,
      is_penthouse: body.isPenthouse ?? false,
      is_studio: body.isStudio ?? false,
      is_duplex: body.isDuplex ?? false,
      energy_class: body.energyClass ?? "",
      energy_performance: body.energyPerformance || null,
      emission_rating: body.emissionRating ?? "",
      emission_value: body.emissionValue || null,
      description: body.description ?? "",
      external_link: body.externalLink ?? "",
      contact_id: body.contactId ?? "",
      notes: body.notes ?? "",
      photo_ids: body.photos ?? [],
      video_ids: body.videos ?? [],
      plan_ids: body.plans ?? [],
      scheduled_publish_at: body.scheduledPublishAt ?? null,
      updated_at: new Date().toISOString(),
    };

    let id: string | undefined = existing?.id;
    if (existing) {
      const { error: updateErr } = await db
        .from("idealista_listings")
        .update(record)
        .eq("id", existing.id);
      if (updateErr) {
        console.error("Save idealista listing update error:", updateErr);
        return Response.json({ error: updateErr.message ?? "Error al actualizar" }, { status: 500 });
      }
    } else {
      const { data: inserted, error: insertErr } = await db
        .from("idealista_listings")
        .insert(record)
        .select("id")
        .single();
      if (insertErr) {
        console.error("Save idealista listing insert error:", insertErr);
        return Response.json({ error: insertErr.message ?? "Error al guardar" }, { status: 500 });
      }
      id = inserted?.id;
    }

    // Revalidar la lista de fichas para que la nueva/actualizada aparezca sin
    // tener que recargar la página a mano.
    revalidatePath("/es/admin/idealista");
    revalidatePath("/cl/admin/idealista");

    return Response.json({ ok: true, id });
  } catch (error) {
    console.error("Save idealista listing error:", error);
    return Response.json({ error: "Error al guardar el listado" }, { status: 500 });
  }
}
