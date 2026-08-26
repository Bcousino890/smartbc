import { redirect } from "next/navigation";
import { getCalendarSelectors } from "@/lib/db/queries/calendar";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { CalendarioClient } from "./calendario-client";

export const dynamic = "force-dynamic";

export default async function CalendarioPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "calendario", "view")) {
    redirect(getCountryConfig(country).prefix);
  }
  const { properties, clients, staff } = await getCalendarSelectors(country);

  return (
    <CalendarioClient
      properties={properties}
      clients={clients}
      staff={staff}
      country={country}
    />
  );
}
