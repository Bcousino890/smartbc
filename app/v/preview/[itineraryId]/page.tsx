import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPreviewCollection } from "@/lib/db/queries/viewing-collections";
import { ViewingCollectionView } from "../../[token]/viewing-collection-view";

/**
 * Previsualización para el AGENTE, antes de publicar.
 *
 * Renderiza exactamente lo que verá el cliente: misma query pública, misma
 * proyección, mismo componente. Lo único distinto es cómo se autoriza — aquí
 * por sesión de staff en vez de por token — y que funciona con el itinerario
 * en borrador.
 *
 * Está bajo /v/... pero NO es pública: `getPreviewCollection` exige permiso
 * viewing_collections.view y que el cliente esté dentro del scope del agente.
 * `middleware.ts` deja pasar /v porque la ruta con token debe ser anónima, así
 * que la autorización de esta ruta vive entera en la query.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Previsualización · Viewing Collection",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function ViewingCollectionPreviewPage({
  params,
}: {
  params: Promise<{ itineraryId: string }>;
}) {
  const { itineraryId } = await params;
  const result = await getPreviewCollection(itineraryId);
  if (!result.ok) notFound();

  return (
    <>
      {/* Aviso solo para el agente: deja claro que está viendo un ensayo y no
          el enlace real, y que la analítica no se registra. */}
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 border border-ink/20 bg-cream-50/95 px-5 py-2.5 text-center shadow-[0_10px_40px_-20px_rgba(40,28,10,0.5)] backdrop-blur">
        <p className="font-display text-[9.5px] font-medium uppercase tracking-[0.18em] text-ink/60">
          Previsualización · así lo verá el cliente
        </p>
      </div>
      <ViewingCollectionView collection={result.collection} shareId="" />
    </>
  );
}
