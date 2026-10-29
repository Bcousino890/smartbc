import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FurnishingViewer } from "@/components/furnishing/furnishing-viewer";
import { propertyRowToClientProperty } from "@/lib/db/adapters";
import { getFurnishingPublic } from "@/lib/db/queries/furnishing";
import { getPropertyByShareToken } from "@/lib/db/queries/shares";
import { buildFurnishingFacts } from "@/lib/furnishing/facts";
import { furnishingContactHref } from "@/lib/furnishing/proposal";

// Visor de la propuesta de mobiliario desde un SmartLink con tracking.
// MISMAS reglas que /c/[token]: token existente y sin caducar, propiedad no
// archivada; solo se enseña la propuesta publicada de ESA propiedad. La
// apertura ya se registra en /c/[token], de donde se llega aquí.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Propuesta de mobiliario · Benjamín Cousiño Propiedades",
  robots: { index: false, follow: false },
};

export default async function FurnishingTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await getPropertyByShareToken(token);
  if (!resolved) notFound();

  const row = resolved.property as Parameters<typeof propertyRowToClientProperty>[0] & { id: string };
  const furnishing = await getFurnishingPublic(row.id);
  if (!furnishing) notFound();

  const property = propertyRowToClientProperty(row);

  return (
    <FurnishingViewer
      images={furnishing.images}
      texts={furnishing.texts}
      reference={property.bcReference ?? null}
      facts={buildFurnishingFacts(property)}
      contactHref={furnishingContactHref(property.bcReference)}
      backHref={`/c/${encodeURIComponent(token)}`}
    />
  );
}
