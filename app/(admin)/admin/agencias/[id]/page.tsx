import { notFound } from "next/navigation";
import { AgencyDetailView } from "./agency-detail-view";
import { getAgencyDetail, mockAgencyDetails } from "@/lib/mock-agency-details";

export function generateStaticParams() {
  return Object.keys(mockAgencyDetails).map((id) => ({ id }));
}

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agency = getAgencyDetail(id);
  if (!agency) notFound();
  return <AgencyDetailView agency={agency} />;
}
