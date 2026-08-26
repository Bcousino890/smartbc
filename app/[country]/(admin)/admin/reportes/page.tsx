import { redirect } from "next/navigation";
import { getReportsStats } from "@/lib/db/queries/reports";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { ReportesClient } from "./reportes-client";

export default async function AdminReportesPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "reportes", "view")) {
    redirect(getCountryConfig(country).prefix);
  }
  const stats = await getReportsStats(country);
  return <ReportesClient stats={stats} />;
}
