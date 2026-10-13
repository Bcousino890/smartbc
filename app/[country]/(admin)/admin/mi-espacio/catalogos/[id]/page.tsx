import { notFound } from "next/navigation";
import { CatalogManager } from "@/components/admin/catalogs/catalog-manager";
import { requireHomeOwnerPage } from "@/lib/catalogs/owner";
import { getCatalogDetail, listOwnerCatalogs } from "@/lib/catalogs/queries";
import { isUuid } from "@/lib/catalogs/validate";
import {
  addPropertyToCatalogAction,
  removePropertyFromCatalogAction,
  reorderCatalogAction,
  setCatalogStatusAction,
  updateCatalogMetaAction,
} from "../../actions";

export const dynamic = "force-dynamic";

/** Gestión de un catálogo (BCP-01 T4). Misma guarda que la HOME; además el
 *  catálogo tiene que ser del dueño (si no, 404 sin revelar que existe). */
export default async function CatalogPage({ params }: { params: Promise<{ country: string; id: string }> }) {
  const { country, id } = await params;
  const profile = await requireHomeOwnerPage(country);
  if (!isUuid(id)) notFound();
  const catalog = await getCatalogDetail(profile.id, id);
  if (!catalog) notFound();
  const numberLabel = (await listOwnerCatalogs(profile.id)).find((c) => c.id === id)?.numberLabel ?? null;
  return (
    <div className="mx-auto max-w-[1600px] px-4 lg:px-8">
      <header className="pt-7 md:pt-9">
        <p className="crm-label-sm text-gold">Catálogo</p>
        <h1 className="crm-page-title mt-1 line-clamp-2 text-ink">{catalog.title}</h1>
      </header>
      <CatalogManager
        catalog={catalog}
        preparedBy={profile.full_name?.trim() || "Fabricio Andree"}
        basePath="/es/admin/mi-espacio"
        numberLabel={numberLabel}
        actions={{
          updateMeta: updateCatalogMetaAction,
          addProperty: addPropertyToCatalogAction,
          removeProperty: removePropertyFromCatalogAction,
          reorder: reorderCatalogAction,
          setStatus: setCatalogStatusAction,
        }}
      />
    </div>
  );
}
