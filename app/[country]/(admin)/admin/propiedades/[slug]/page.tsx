import { notFound } from "next/navigation";
import {
  getPropertyMediaForAdmin,
  getPropertyRowBySlugForAdmin,
} from "@/lib/db/queries/properties";
import { getSharesForProperty } from "@/lib/db/queries/shares";
import { getPropertyTags, getTagIdsForProperty } from "@/lib/db/queries/property-tags";
import { tagIdsInCatalog } from "@/lib/properties/tags";
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
  // El acceso se decide antes de leer ningún dato de la ficha.
  await guardPage("properties", country);
  // La propiedad y el catálogo de etiquetas del país no dependen entre sí.
  const [row, allTags] = await Promise.all([
    getPropertyRowBySlugForAdmin(slug),
    getPropertyTags(country),
  ]);
  // Cast: supabase-js no infiere bien filas tipo `properties` con joins,
  // así que la respuesta llega como `never`. Forzamos el shape concreto.
  const property = row as
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
        external_id: string | null;
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
              source_width: number | null;
              source_height: number | null;
            }>
          | null;
      })
    | null;
  if (!property) notFound();

  // Con el id ya conocido: medios, SmartLinks (con stats de aperturas) y las
  // etiquetas de ESTA propiedad, en paralelo. Mismos errores que antes: los
  // SmartLinks lanzan; medios y etiquetas fallan en vacío.
  const [allMedia, shares, linkedTagIds] = await Promise.all([
    getPropertyMediaForAdmin(property.id) as Promise<
      Array<{
        id: string;
        url: string;
        file_name: string;
        type: "video" | "plan";
        storage_path: string;
      }>
    >,
    getSharesForProperty(property.id),
    allTags.length > 0 ? getTagIdsForProperty(property.id) : Promise.resolve([]),
  ]);

  const agency = Array.isArray(property.agencies)
    ? property.agencies[0] ?? null
    : property.agencies;

  const photos = (property.property_photos ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  const videos = allMedia.filter((m) => m.type === "video");
  const plans = allMedia.filter((m) => m.type === "plan");

  return (
    <PropertyEditView
      shares={shares}
      allTags={allTags}
      tagIds={tagIdsInCatalog(linkedTagIds, allTags)}
      country={country}
      videos={videos}
      plans={plans}
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
        external_id: property.external_id ?? null,
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
