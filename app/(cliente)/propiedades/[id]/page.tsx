import { notFound } from "next/navigation";
import { PropertyDetail } from "./property-detail";
import { getPropertyById, mockProperties } from "@/lib/mock-properties";

export function generateStaticParams() {
  return mockProperties.map((p) => ({ id: p.id }));
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = getPropertyById(id);
  if (!property) notFound();
  return <PropertyDetail property={property} />;
}
