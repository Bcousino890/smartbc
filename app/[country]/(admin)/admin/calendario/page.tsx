import { getCalendarSelectors } from "@/lib/db/queries/calendar";
import type { Country } from "@/lib/country-config";
import { CalendarioClient } from "./calendario-client";

export const dynamic = "force-dynamic";

export default async function CalendarioPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
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
