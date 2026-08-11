import { notFound } from "next/navigation";
import { getPropertyBySlugForAdmin } from "@/lib/db/queries/properties";
import { getSharesForProperty } from "@/lib/db/queries/shares";
import { guardPage } from "@/lib/auth/guard";
import type { Country } from "@/lib/country-config";
import { PropertyEditView } from "./property-edit-view";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ slug: string; country: Country }>;
}) {
  const { slug, country } = await params;
  const currentProfile = await guardPage("properties", country);
  const isAdmin = ["owner", "admin"].includes(currentProfile.role);
  // Cast: supabase-js no infiere bien filas tipo `properties` con joins,
  // así que la respuesta llega como `never`. Forzamos el shape concreto.
  const property = (await getPropertyBySlugForAdmin(slug)) as
    | (Record<string, unknown> & {
        id: string;
        slug: string;
        title: string;
        title_rent: string | null;
        description: string | null;
        operation: "rent" | "sale";
        operations: string[] | null;
        rent_price: number | null;
        stay: "short" | "long" | null;
        status: "available" | "reserved" | "sold" | "archived";
        price: number;
        bedrooms: number;
        bathrooms: number;
        square_meters: number | null;
        covered_area_m2: number | null;
        parking_lots: number | null;
        floors: number | null;
        is_condominium: boolean | null;
        construction_year: number | null;
        sector: string | null;
        available_from: string | null;
        zone: string;
        address: string | null;
        features: string[] | null;
        features_manual: string[] | null;
        latitude: number | null;
        longitude: number | null;
        bc_reference: string | null;
        property_reference: string;
        source: "manual" | "scrape" | "api";
        source_url: string | null;
        archived_at: string | null;
        cover_photo_url: string | null;
        owner_name: string | null;
        owner_phone: string | null;
        owner_email: string | null;
        internal_notes: string | null;
        published_web: boolean;
        agencies:
          | { id: string; name: string; slug: string }
          | Array<{ id: string; name: string; slug: string }>
          | null;
        property_photos:
          | Array<{
              url: string;
              alt: string | null;
              position: number;
              is_cover: boolean;
            }>
          | null;
        property_media:
          | Array<{
              id: string;
              url: string;
              file_name: string;
              type: "video" | "plan";
              storage_path: string;
            }>
          | null;
      })
    | null;
  if (!property) notFound();

  const agency = Array.isArray(property.agencies)
    ? property.agencies[0] ?? null
    : property.agencies;

  const photos = (property.property_photos ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  const allMedia = property.property_media ?? [];
  const videos = allMedia.filter((m) => m.type === "video");
  const plans = allMedia.filter((m) => m.type === "plan");

  // SmartLinks de esta propiedad (con stats de aperturas).
  const shares = await getSharesForProperty(property.id);

  return (
    <PropertyEditView
      shares={shares}
      videos={videos}
      plans={plans}
      isAdmin={isAdmin}
      property={{
        id: property.id,
        slug: property.slug,
        title: property.title,
        title_rent: property.title_rent,
        description: property.description,
        operation: property.operation,
        operations:
          property.operations && property.operations.length > 0
            ? property.operations
            : [property.operation],
        rent_price:
          property.rent_price !== null && property.rent_price !== undefined
            ? Number(property.rent_price)
            : null,
        stay: property.stay,
        status: property.status,
        price: Number(property.price),
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        square_meters: property.square_meters,
        covered_area_m2: property.covered_area_m2,
        parking_lots: property.parking_lots,
        floors: property.floors,
        is_condominium: property.is_condominium,
        construction_year: property.construction_year,
        sector: property.sector,
        available_from: property.available_from,
        zone: property.zone,
        address: property.address,
        features: property.features ?? [],
        features_manual: property.features_manual ?? [],
        latitude: property.latitude,
        longitude: property.longitude,
        bc_reference: property.bc_reference,
        property_reference: property.property_reference,
        source: property.source,
        source_url: property.source_url,
        archived_at: property.archived_at,
        cover_photo_url: property.cover_photo_url,
        owner_name: property.owner_name,
        owner_phone: property.owner_phone,
        owner_email: property.owner_email,
        internal_notes: property.internal_notes,
        published_web: property.published_web ?? false,
        agency: agency
          ? { id: agency.id, name: agency.name, slug: agency.slug }
          : null,
        photos,
      }}
    />
  );
}
