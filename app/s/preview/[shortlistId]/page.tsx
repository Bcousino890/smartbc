import { getShortlistPreview } from "@/lib/db/queries/client-shortlists";
import { ShortlistView } from "../../[token]/shortlist-view";
import { ShortlistUnavailableView } from "../../[token]/shortlist-unavailable-view";

/**
 * Previsualización del agente: exactamente lo que verá el cliente.
 *
 * Token vacío ⇒ ni instrumenta analítica ni permite escribir. Mismo patrón que
 * la previsualización del Private Book.
 *
 * Quien la abre SIN sesión de equipo (o sin permiso) ve la vista de "no
 * disponible", igual que un enlace caducado. NO se le redirige a `/s/{token}`:
 * antes, conocer el id de la selección bastaba para llegar al enlace real del
 * cliente saltándose el permiso y el alcance. El enlace que se manda al
 * cliente es el de `/s/{token}`, no el de la previsualización.
 */
export const dynamic = "force-dynamic";

export default async function ShortlistPreviewPage({
  params,
}: {
  params: Promise<{ shortlistId: string }>;
}) {
  const { shortlistId } = await params;
  const result = await getShortlistPreview(shortlistId);
  if (!result.ok) {
    return <ShortlistUnavailableView />;
  }

  return (
    <>
      <div className="bg-ink px-4 py-2 text-center font-display text-[10px] font-medium uppercase vc-tracked text-cream-50/80">
        Previsualización · así lo verá el cliente
      </div>
      <ShortlistView shortlist={result.shortlist} token="" previewShortlistId={shortlistId} />
    </>
  );
}
