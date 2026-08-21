import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEffectivePermissions } from "@/lib/db/queries/permissions";
import { canAccess } from "@/lib/permissions";
import { isCountry } from "@/lib/country-config";
import { getEnrichmentQueue } from "@/lib/db/queries/story-review";
import { QueueClient } from "./queue-client";

// SmartLink 2.0 · Cola de enriquecimiento del catálogo.
// Contadores y filas SIEMPRE derivados de producción evaluando el quality gate
// compartido. Sin backlog cacheado ni cifras hardcodeadas.

export const dynamic = "force-dynamic";

export default async function StoryReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>;
  searchParams: Promise<{ bucket?: string }>;
}) {
  const { country } = await params;
  const { bucket } = await searchParams;
  if (!isCountry(country)) redirect("/es/admin");

  // Mismo contrato de permisos que el resto del módulo de propiedades.
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const permissions = await getEffectivePermissions(profile.id, profile.role, country);
  const allowed = permissions?.properties?.edit ?? canAccess(profile.role, "properties", "edit");
  if (!allowed) redirect(`/${country}/admin/propiedades`);

  const { rows, counters } = await getEnrichmentQueue();

  return (
    <QueueClient
      country={country}
      rows={rows}
      counters={counters}
      initialBucket={bucket ?? "short"}
    />
  );
}
