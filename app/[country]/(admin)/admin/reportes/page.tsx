import { getReportsStats } from "@/lib/db/queries/reports";
import type { Country } from "@/lib/country-config";
import { ReportesClient } from "./reportes-client";

export default async function AdminReportesPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const stats = await getReportsStats(country);
  return <ReportesClient stats={stats} />;
}
