import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { getPipelinesForCountry, getStagesForPipeline } from "@/lib/captaciones/pipeline";
import { PipelinesManagerClient } from "./pipelines-manager-client";

export const dynamic = "force-dynamic";

const CONFIG_ROLES = ["admin", "owner", "agent_admin"];

export default async function PipelinesPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  if (country !== "cl") redirect(getCountryConfig(country).prefix);

  const profile = await getCurrentProfile();
  if (!profile || !CONFIG_ROLES.includes(profile.role)) {
    return (
      <div className="p-10 text-center">
        <p className="text-ink/55">No tienes acceso a configurar pipelines.</p>
      </div>
    );
  }

  const rawPipelines = await getPipelinesForCountry("cl");
  const pipelines = await Promise.all(
    rawPipelines.map(async (p) => ({ ...p, stages: await getStagesForPipeline(p.id) }))
  );

  return <PipelinesManagerClient initialPipelines={pipelines} />;
}
