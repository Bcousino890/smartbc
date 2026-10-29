import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FurnishingViewer } from "@/components/furnishing/furnishing-viewer";
import { propertyRowToClientProperty } from "@/lib/db/adapters";
import { getFurnishingPublic } from "@/lib/db/queries/furnishing";
import { getPropertyBySlugPublic, resolveLegacySlug } from "@/lib/db/queries/properties";
import { buildFurnishingFacts } from "@/lib/furnishing/facts";
import { furnishingContactHref } from "@/lib/furnishing/proposal";

// Visor de la propuesta de mobiliario desde el enlace compartido estable.
// MISMAS reglas que /compartir/[slug]: la propiedad se resuelve con
// getPropertyBySlugPublic (no archivada) y solo se enseña SU propuesta, si
// está publicada. Sin cuenta del CRM.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Propuesta de mobiliario · Benjamín Cousiño Propiedades",
  robots: { index: false, follow: false },
};

export default async function FurnishingSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ op?: string }>;
}) {
  const { slug } = await params;
  const { op } = await searchParams;
  const opQuery = op === "rent" || op === "sale" ? `?op=${op}` : "";

  const row = (await getPropertyBySlugPublic(slug)) as
    | (Parameters<typeof propertyRowToClientProperty>[0] & { id: string })
    | null;
  if (!row) {
    const newSlug = await resolveLegacySlug(slug);
    if (newSlug && newSlug !== slug) redirect(`/compartir/${newSlug}/propuesta${opQuery}`);
    notFound();
  }

  const furnishing = await getFurnishingPublic(row.id);
  if (!furnishing) notFound();

  const property = propertyRowToClientProperty(row, op === "rent" ? "rent" : op === "sale" ? "sale" : undefined);

  return (
    <FurnishingViewer
      images={furnishing.images}
      texts={furnishing.texts}
      reference={property.bcReference ?? null}
      facts={buildFurnishingFacts(property)}
      contactHref={furnishingContactHref(property.bcReference)}
      backHref={`/compartir/${slug}${opQuery}`}
    />
  );
}
