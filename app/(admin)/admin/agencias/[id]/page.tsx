import { notFound } from "next/navigation";
import { AgencyDetailView } from "./agency-detail-view";
import { getAgencyBySlug } from "@/lib/db/queries/agencies";
import { getAgencyDetail } from "@/lib/mock-agency-details";

export const dynamic = "force-dynamic";

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dbAgency = await getAgencyBySlug(id);
  if (!dbAgency) notFound();

  // TODO: cuando el schema modele contacts/conditions/properties por agencia,
  //       construir AgencyDetail desde BD. Por ahora reusamos el mock como
  //       fallback de presentación, sustituyendo los campos que sí tenemos.
  const fallback = getAgencyDetail(id) ?? getAgencyDetail("barnes");
  if (!fallback) notFound();

  const agency = {
    ...fallback,
    id: dbAgency.slug,
    name: dbAgency.name,
  };

  return <AgencyDetailView agency={agency} />;
}
