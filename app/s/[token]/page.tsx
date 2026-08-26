import type { Metadata } from "next";
import {
  getPublicShortlistByToken,
  markShortlistOpened,
} from "@/lib/db/queries/client-shortlists";
import { ShortlistView } from "./shortlist-view";
import { ShortlistUnavailableView } from "./shortlist-unavailable-view";

// ============================================================================
// /s/{token} · la selección privada del cliente.
//
// Mismas reglas que /v/{token}: sin indexar, sin previsualización social, y
// caducada / revocada / inexistente se ven EXACTAMENTE igual. Quien pruebe
// tokens no aprende si existió, si expiró o si se revocó.
//
// La diferencia con el Private Book es que aquí el cliente escribe. Toda esa
// autorización vive en actions.ts y se resuelve desde el token, nunca desde
// nada que mande el navegador.
// ============================================================================

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private Client Services",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getPublicShortlistByToken(token);

  if (!result.ok) return <ShortlistUnavailableView />;

  // Primera apertura: dato de apoyo para el agente. Best-effort.
  void markShortlistOpened(token);

  return <ShortlistView shortlist={result.shortlist} token={token} />;
}
