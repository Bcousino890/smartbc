import Link from "next/link";
import { CopyLibraryPage } from "@/components/admin/catalogs/copy-library-page";
import { copyLibraryPageData } from "@/lib/catalogs/copy-library";
import { requireHomeOwnerPage } from "@/lib/catalogs/owner";
import { approveCopyCandidatesAction, loadCopyLibraryPageAction, withdrawCatalogCopyAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * HOME · Textos aprobados (0219, PR1). Solo el dueño de la HOME (404 para
 * cualquier otro; sin sesión, /login). Biblioteca de textos de las viviendas
 * y siembra desde lo publicado en sus catálogos, sin IA.
 */
export default async function TextosAprobadosPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  const profile = await requireHomeOwnerPage(country);
  let data: Awaited<ReturnType<typeof copyLibraryPageData>> = { candidates: [], library: [] };
  let unavailable = false;
  try {
    data = await copyLibraryPageData(profile.id);
  } catch (err) {
    console.warn("[catalogos] textos aprobados:", err instanceof Error ? err.message : err);
    unavailable = true;
  }
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-12 lg:px-8">
      <header className="pt-7">
        <Link href={`/${country}/admin/mi-espacio`} className="text-xs text-ink/55 hover:text-ink">
          ← Mi espacio
        </Link>
        <h1 className="crm-page-title mt-2 text-ink">Textos aprobados</h1>
      </header>
      <div className="mt-6">
        {unavailable ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">No se ha podido leer la biblioteca de textos ahora mismo.</p>
        ) : (
          <CopyLibraryPage
            initial={data}
            actions={{ reload: loadCopyLibraryPageAction, approve: approveCopyCandidatesAction, withdraw: (i) => withdrawCatalogCopyAction(i) }}
          />
        )}
      </div>
    </div>
  );
}
