import { notFound } from "next/navigation";
import { getShortlistPreview } from "@/lib/db/queries/client-shortlists";
import { ShortlistView } from "../../[token]/shortlist-view";

/**
 * Previsualización del agente: exactamente lo que verá el cliente.
 *
 * Token vacío ⇒ ni instrumenta analítica ni permite escribir. Mismo patrón que
 * la previsualización del Private Book.
 */
export const dynamic = "force-dynamic";

export default async function ShortlistPreviewPage({
  params,
}: {
  params: Promise<{ shortlistId: string }>;
}) {
  const { shortlistId } = await params;
  const result = await getShortlistPreview(shortlistId);
  if (!result.ok) notFound();

  return (
    <>
      <div className="bg-ink px-4 py-2 text-center font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/80">
        Previsualización · así lo verá el cliente
      </div>
      <ShortlistView shortlist={result.shortlist} token="" />
    </>
  );
}
