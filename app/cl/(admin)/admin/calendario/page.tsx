import { getCalendarSelectors } from "@/lib/db/queries/calendar";
import { CalendarioClient } from "./calendario-client";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const { properties, clients, staff } = await getCalendarSelectors("cl");

  return (
    <CalendarioClient
      properties={properties}
      clients={clients}
      staff={staff}
    />
  );
}
