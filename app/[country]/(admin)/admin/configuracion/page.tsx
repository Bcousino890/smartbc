import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import ConfiguracionClient from "./configuracion-client";

export default async function AdminConfiguracionPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "configuracion", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

  return <ConfiguracionClient />;
}
