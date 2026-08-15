import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  getPublicCollectionByToken,
  recordCollectionOpen,
} from "@/lib/db/queries/viewing-collections";
import { CollectionUnavailableView } from "./collection-unavailable-view";
import { ViewingCollectionView } from "./viewing-collection-view";

export const dynamic = "force-dynamic";

/**
 * Metadatos deliberadamente GENÉRICOS: no revelan el cliente, ni la fecha, ni
 * cuántas propiedades hay, ni siquiera si el token existe. Sin imagen OG.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Colección privada · Benjamín Cousiño Propiedades",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

export default async function ViewingCollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getPublicCollectionByToken(token);

  // Caducado, revocado, inexistente, cancelado y módulo desactivado devuelven
  // exactamente la misma vista: un atacante que pruebe tokens no aprende nada.
  // Se responde 200, no 404: un 404 ya distinguiría "no existe" de "no puedes".
  if (!result.ok) return <CollectionUnavailableView />;

  const reqHeaders = await headers();
  const ip =
    reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    reqHeaders.get("x-real-ip") ??
    null;
  const userAgent = reqHeaders.get("user-agent") ?? null;

  // Fire-and-forget: el visitante es prioritario, el tracking no bloquea.
  recordCollectionOpen({ shareId: result.shareId, ip, userAgent }).catch(() => {
    /* tracking opt-out silently */
  });

  return (
    <ViewingCollectionView
      collection={result.collection}
      shareId={result.shareId}
    />
  );
}
