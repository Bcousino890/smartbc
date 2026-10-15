import { notFound } from "next/navigation";
import { CatalogManager } from "@/components/admin/catalogs/catalog-manager";
import { requireHomeOwnerPage } from "@/lib/catalogs/owner";
import { getCatalogShare } from "@/lib/catalogs/public-data";
import { getCatalogDetail, listOwnerCatalogs } from "@/lib/catalogs/queries";
import { listCatalogTexts } from "@/lib/catalogs/texts";
import { isUuid } from "@/lib/catalogs/validate";
import {
  deleteCatalogTextAction,
  draftCatalogTextAction,
  prepareCatalogTextAction,
  previewCatalogTextAction,
  publishCatalogTextAction,
  saveCatalogTextDraftAction,
  withdrawCatalogTextAction,
  addCatalogAdAction,
  adjustCatalogAction,
  clearCatalogAdjustmentAction,
  listCatalogPhotosAction,
  listCoverPhotosAction,
  setCatalogPhotoExcludedAction,
  setCatalogPhotoOpeningAction,
  setCatalogCoverAction,
  addPropertyByIdAction,
  addPropertyToCatalogAction,
  previewAutoSelectionAction,
  previewModeAction,
  removeCatalogAdAction,
  searchCatalogPropertiesAction,
  searchSavedListingsAction,
  setCatalogCriteriaAction,
  setCatalogModeAction,
  createShareAction,
  renewShareAction,
  revokeShareAction,
  removePropertyFromCatalogAction,
  reorderCatalogAction,
  setCatalogContactAction,
  setCatalogStatusAction,
  updateCatalogMetaAction,
} from "../../actions";

export const dynamic = "force-dynamic";

/** Gestión de un catálogo (BCP-01 T4/T7/T10). Misma guarda que la HOME;
 *  además el catálogo tiene que ser del dueño (si no, 404 sin revelar que
 *  existe). Con ?medir=1, modo medición de D13. */
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; id: string }>;
  searchParams: Promise<{ medir?: string }>;
}) {
  const { country, id } = await params;
  const { medir } = await searchParams;
  const profile = await requireHomeOwnerPage(country);
  if (!isUuid(id)) notFound();
  const catalog = await getCatalogDetail(profile.id, id);
  if (!catalog) notFound();
  const numberLabel = (await listOwnerCatalogs(profile.id)).find((c) => c.id === id)?.numberLabel ?? null;
  const share = await getCatalogShare(profile.id, id);
  const texts = await listCatalogTexts(profile.id, id);
  return (
    <div className="mx-auto max-w-[1600px] px-4 lg:px-8">
      <header className="pt-7 md:pt-9">
        <p className="crm-label-sm text-gold">Catálogo</p>
        <h1 className="crm-page-title mt-1 line-clamp-2 text-ink">{catalog.title}</h1>
      </header>
      <CatalogManager
        catalog={catalog}
        basePath="/es/admin/mi-espacio"
        numberLabel={numberLabel}
        share={share}
        measureMode={medir === "1"}
        texts={texts}
        shareActions={{ create: createShareAction, renew: renewShareAction, revoke: revokeShareAction }}
        actions={{
          updateMeta: updateCatalogMetaAction,
          addProperty: addPropertyToCatalogAction,
          removeProperty: removePropertyFromCatalogAction,
          reorder: reorderCatalogAction,
          setStatus: setCatalogStatusAction,
          setContact: setCatalogContactAction,
          addPropertyById: addPropertyByIdAction,
          search: searchCatalogPropertiesAction,
          selection: {
            setCriteria: setCatalogCriteriaAction,
            previewAuto: previewAutoSelectionAction,
            previewMode: previewModeAction,
            setMode: setCatalogModeAction,
          },
          ads: {
            add: addCatalogAdAction,
            remove: removeCatalogAdAction,
            searchListings: searchSavedListingsAction,
          },
          adjust: adjustCatalogAction,
          clearAdjustment: clearCatalogAdjustmentAction,
          cover: { set: setCatalogCoverAction, photos: listCoverPhotosAction },
          photos: { list: listCatalogPhotosAction, setExcluded: setCatalogPhotoExcludedAction, setOpening: setCatalogPhotoOpeningAction },
          texts: {
            prepare: prepareCatalogTextAction,
            draft: draftCatalogTextAction,
            save: saveCatalogTextDraftAction,
            publish: publishCatalogTextAction,
            withdraw: withdrawCatalogTextAction,
            remove: deleteCatalogTextAction,
            preview: previewCatalogTextAction,
          },
        }}
      />
    </div>
  );
}
