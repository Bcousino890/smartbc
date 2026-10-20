import type { Metadata } from "next";
import { CatalogReader } from "@/components/catalogs/reader/catalog-reader";
import { StatePage } from "@/components/catalogs/reader/pages";
import styles from "@/components/catalogs/reader/reader.module.css";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { getPersonalFeedback } from "@/lib/catalogs/feedback";
import type { PersonalFeedbackView } from "@/lib/catalogs/feedback-rules";
import { getPublicCatalogState } from "@/lib/catalogs/public-data";
import { pageLimiter } from "@/lib/catalogs/rate-limit";
import { isShareToken } from "@/lib/catalogs/share";

// Lector público de un catálogo (BCP-01 T8). Entra quien tenga el enlace; no
// hay sesión. Un enlace inexistente, revocado, caducado o de un catálogo
// archivado ve la MISMA vista de «no disponible» (no se dice cuál pasa).
// No toca /v ni /s: es una superficie nueva.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Selección privada",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

function Unavailable() {
  return (
    <div className={`${styles.root} ${styles.standalone} min-h-screen bg-cream-50 font-sans text-ink`} data-testid="reader-unavailable">
      <StatePage kicker="Enlace" title="Este enlace ya no está disponible">
        <p>Si necesitas volver a ver la selección, pide un enlace nuevo a tu asesor.</p>
      </StatePage>
    </div>
  );
}

export default async function SeleccionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ medir?: string }>;
}) {
  const { token } = await params;
  const { medir } = await searchParams;
  if (!isShareToken(token) || !pageLimiter.allow(token)) return <Unavailable />;
  let state;
  try {
    state = await getPublicCatalogState(token);
  } catch (err) {
    console.error("[catalogos] lector:", err instanceof Error ? err.message : err);
    state = null;
  }
  if (!state) return <Unavailable />;
  // 0218: con un enlace personal, sus opiniones (el general no tiene). Si no
  // se pueden leer, el catálogo se ve igual, sin «Tu opinión».
  let feedback: PersonalFeedbackView | null = null;
  try {
    feedback = await getPersonalFeedback(token);
  } catch (err) {
    console.error("[catalogos] opiniones (lector):", err instanceof Error ? err.message : err);
  }
  return (
    <CatalogReader
      token={token}
      initial={state}
      measure={medir === "1"}
      photoBase={isCatalogFixtureMode() ? "/dev-fixtures/foto/" : "/p/"}
      feedback={feedback?.personal ? feedback : null}
    />
  );
}
