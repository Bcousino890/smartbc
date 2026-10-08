import { redirect } from "next/navigation";
import {
  getActiveShortlistTokenById,
  getShortlistPreview,
} from "@/lib/db/queries/client-shortlists";
import { ShortlistView } from "../../[token]/shortlist-view";
import { ShortlistUnavailableView } from "../../[token]/shortlist-unavailable-view";

/**
 * Previsualización del agente: exactamente lo que verá el cliente.
 *
 * Token vacío ⇒ ni instrumenta analítica ni permite escribir. Mismo patrón que
 * la previsualización del Private Book.
 *
 * Quien la abre SIN sesión de equipo (o sin permiso) no ve un 404: es casi
 * siempre el cliente, al que le han pegado esta URL en vez de la suya. Si la
 * selección tiene el enlace activo se le redirige a `/s/{token}`; si no,
 * ve la misma vista de "no disponible" que `/s/{token}`.
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
    // `redirect` lanza: fuera de cualquier try/catch a propósito.
    const token = await getActiveShortlistTokenById(shortlistId);
    if (token) redirect(`/s/${token}`);
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
