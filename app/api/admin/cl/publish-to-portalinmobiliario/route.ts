import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { publishPropertyToML } from "@/lib/sync/portalinmobiliario/ml-publisher";
import { getCurrentProfile } from "@/lib/db/queries/session";
import type { MlPropertyInput } from "@/lib/sync/portalinmobiliario/ml-publisher";
import { watermarkPhotosForPortal } from "@/lib/services/portalinmobiliario/watermark-photos";

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Usuarios de Chile o admins multi-país (el layout deja a los admin
    // cambiar de país libremente; este gate los bloqueaba igual).
    const userCountry = (profile as any).country ?? "es";
    const isMultiCountryAdmin = profile.role === "admin" || (profile.role as string) === "owner";
    if (userCountry !== "cl" && !isMultiCountryAdmin) {
      return NextResponse.json(
        { error: "Solo usuarios de Chile pueden publicar en Portal Inmobiliario" },
        { status: 403 }
      );
    }

    const { propertyId } = await request.json();
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const db = createAdminClient() as any;

    const { data: property, error } = await db
      .from("properties")
      .select("id, title, description, price, address, bedrooms, bathrooms, square_meters, covered_area_m2, parking_lots, operation, country, commune, region, property_type, currency")
      .eq("id", propertyId)
      .eq("country", "cl")
      .maybeSingle();

    if (error || !property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const { data: photos } = await db
      .from("property_photos")
      .select("url")
      .eq("property_id", propertyId)
      .order("position", { ascending: true });

    const imageUrls: string[] = (photos || []).map((p: any) => p.url);

    if (imageUrls.length < 4) {
      return NextResponse.json(
        { error: `Se necesitan al menos 4 fotos (tienes ${imageUrls.length})` },
        { status: 400 }
      );
    }

    // Publicar las fotos con el logo de la agencia (Benjamín Cousiño
    // Propiedades). MercadoLibre las descarga desde su URL, así que servimos
    // versiones ya marcadas. Tolerante a fallos: si alguna no se puede marcar,
    // cae a la original.
    const brandedImageUrls = await watermarkPhotosForPortal(db, propertyId, imageUrls);

    const mlCurrency = (property.currency === "clp" ? "CLP" : property.currency === "usd" ? "USD" : "UF") as "CLP" | "UF" | "USD";
    const input: MlPropertyInput = {
      title: property.title,
      description: property.description ?? "",
      price: property.price,
      currency: mlCurrency,
      operation: property.operation === "rent" ? "rent" : "sale",
      propertyType: property.property_type ?? "apartment",
      address: property.address ?? "",
      commune: property.commune ?? "",
      region: property.region ?? "",
      bedrooms: property.bedrooms ?? 0,
      bathrooms: property.bathrooms ?? 0,
      totalAreaM2: property.square_meters ?? undefined,
      coveredAreaM2: property.covered_area_m2 ?? undefined,
      parkingLots: property.parking_lots ?? undefined,
      imageUrls: brandedImageUrls,
      listingType: "gold_special",
    };

    const result = await publishPropertyToML(input);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Save ML item ID for tracking
    await db
      .from("properties")
      .update({
        portalinmobiliario_id: result.itemId,
        portalinmobiliario_published_at: new Date().toISOString(),
        portalinmobiliario_sync_status: "synced",
      })
      .eq("id", propertyId);

    return NextResponse.json({
      success: true,
      itemId: result.itemId,
      url: result.permalink,
    });
  } catch (err) {
    console.error("[publish-to-portalinmobiliario]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
