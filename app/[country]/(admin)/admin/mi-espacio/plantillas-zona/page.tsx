import Link from "next/link";
import { AreaTextsPage } from "@/components/admin/catalogs/area-texts-page";
import { areaTextsPageData, type AreaTextsPageData } from "@/lib/catalogs/area-text-data";
import { requireHomeOwnerPage } from "@/lib/catalogs/owner";
import {
  approveAreaTextAction,
  discardAreaTextDraftAction,
  draftAreaTextAiAction,
  loadAreaTextsPageAction,
  retireAreaTextAction,
  saveAreaTextDraftAction,
  seedAreaTextsAction,
} from "../actions";

export const dynamic = "force-dynamic";

/**
 * HOME · Plantillas de zona (0222, PR3). Solo el dueño de la HOME (404 para
 * cualquier otro; sin sesión, /login). Descripciones generales de cada zona
 * para «Vivir en…», versionadas; sin IA salvo al pulsar «Borrador con IA».
 */
export default async function PlantillasZonaPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  const profile = await requireHomeOwnerPage(country);
  let data: AreaTextsPageData = { entries: [], seed: { items: [], existing: [], unmapped: [] } };
  let unavailable = false;
  try {
    data = await areaTextsPageData(profile.id);
  } catch (err) {
    console.warn("[catalogos] plantillas de zona:", err instanceof Error ? err.message : err);
    unavailable = true;
  }
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-12 lg:px-8">
      <header className="pt-7">
        <Link href={`/${country}/admin/mi-espacio`} className="text-xs text-ink/55 hover:text-ink">
          ← Mi espacio
        </Link>
        <h1 className="crm-page-title mt-2 text-ink">Plantillas de zona</h1>
      </header>
      <div className="mt-6">
        {unavailable ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">No se han podido leer las plantillas de zona ahora mismo.</p>
        ) : (
          <AreaTextsPage
            initial={data}
            actions={{
              reload: loadAreaTextsPageAction,
              saveDraft: saveAreaTextDraftAction,
              approve: approveAreaTextAction,
              retire: retireAreaTextAction,
              discard: discardAreaTextDraftAction,
              seed: seedAreaTextsAction,
              aiDraft: draftAreaTextAiAction,
            }}
          />
        )}
      </div>
    </div>
  );
}
