import { getReportsStats } from "@/lib/db/queries/reports";
import { ReportesClient } from "./reportes-client";

export default async function AdminReportesPage() {
  const stats = await getReportsStats("cl");
  return <ReportesClient stats={stats} />;
}
