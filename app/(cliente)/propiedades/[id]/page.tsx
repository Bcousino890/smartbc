import { notFound } from "next/navigation";
import { PropertyDetail } from "./property-detail";
import { propertyRowToClientProperty } from "@/lib/db/adapters";
import { getFavoriteSlugs } from "@/lib/db/queries/favorites";
import { getPropertyBySlug } from "@/lib/db/queries/properties";
import { getCurrentUser } from "@/lib/db/queries/session";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [row, user] = await Promise.all([
    getPropertyBySlug(id),
    getCurrentUser(),
  ]);
  if (!row) notFound();
  const property = propertyRowToClientProperty(row);
  const favoriteSlugs = user ? await getFavoriteSlugs(user.id) : [];
  const isFavorite = favoriteSlugs.includes(property.id);
  return <PropertyDetail property={property} isFavorite={isFavorite} />;
}
