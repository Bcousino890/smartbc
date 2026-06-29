import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

function formatPrice(price: number, country: string): string {
  if (country === "cl") {
    return `USD ${Number(price).toLocaleString("en-US")}`;
  }
  return `€ ${Number(price).toLocaleString("es-ES")}`;
}

function ensureAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return `${supabaseUrl}${url.startsWith("/") ? url : "/" + url}`;
}

export async function GET() {
  try {
    const admin = createAdminClient();
    const selectStr = "id, slug, bc_reference, property_reference, title, zone, address, country, price, operation, bedrooms, bathrooms, square_meters, description, features, features_manual, cover_photo_url, property_photos(url, is_cover, position), property_media(url, type, file_name)";

    // Mostrar propiedades disponibles o reservadas (scrape + manual)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("properties")
      .select(selectStr)
      .in("status", ["available", "reserved"])
      .is("archived_at", null)
      .order("id", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("Portal API error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const properties = ((data as unknown[]) ?? []).map((raw) => {
      const p = raw as Record<string, unknown>;
      const photos = ((p.property_photos as Array<{ url: string; is_cover: boolean; position: number }>) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position);

      const coverFromPhotos =
        photos.find((ph) => ph.is_cover)?.url ?? photos[0]?.url ?? "";
      const cover =
        ((p.cover_photo_url as string | null) ??
          coverFromPhotos) ||
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop";

      const absoluteCover = ensureAbsoluteUrl(cover);
      const galleryPhotos = photos.filter((ph) => ph.url !== cover);
      const gallery = galleryPhotos.map((ph) => ensureAbsoluteUrl(ph.url));

      const countryCode = p.country as string;
      const countryLabel = countryCode === "es" ? "España" : "Chile";
      const city = countryCode === "es" ? "Madrid" : "Santiago";
      const office = countryCode === "es" ? "Madrid" : "Santiago";
      const phone = countryCode === "es" ? "+34 694 209 763" : "+56 9 61791938";

      const media = ((p.property_media as Array<{ url: string; type: string; file_name: string }>) ?? [])
        .filter((m) => m.type === "video" && m.url);
      const videos = media.map((m) => ({
        url: ensureAbsoluteUrl(m.url),
        title: m.file_name || "Video",
      }));

      return {
        id: p.slug as string,
        ref: (p.bc_reference as string | null) ?? (p.property_reference as string),
        title: p.title as string,
        zone: p.zone as string,
        city,
        country: countryLabel,
        price: formatPrice(Number(p.price), countryCode),
        priceNum: Number(p.price),
        operation: (p.operation as string) === "sale" ? "Venta" : "Alquiler",
        type: "Apartamento",
        beds: Number(p.bedrooms),
        baths: Number(p.bathrooms),
        sqm: Number(p.square_meters ?? 0),
        cover: absoluteCover,
        gallery,
        description: (p.description as string | null) ?? "",
        features: [
          ...((p.features as string[]) ?? []),
          ...((p.features_manual as string[]) ?? []),
        ],
        address: (p.address as string | null) ?? (p.zone as string),
        office,
        phone,
        videos,
      };
    });

    return NextResponse.json(properties);
  } catch (err) {
    console.error("portal/properties error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
