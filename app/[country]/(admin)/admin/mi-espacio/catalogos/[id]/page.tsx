import { notFound } from "next/navigation";
import { CatalogManager } from "@/components/admin/catalogs/catalog-manager";
import { StudioRoot } from "@/components/admin/catalogs/studio/studio-root";
import { requireHomeOwnerPage } from "@/lib/catalogs/owner";
import { getCatalogShare } from "@/lib/catalogs/public-data";
import { getCatalogDetail, listOwnerCatalogs } from "@/lib/catalogs/queries";
import { listOwnerGroups } from "@/lib/catalogs/group-data";
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
  setCatalogPhotoFinishAction,
  setCatalogPhotoNoFinishAction,
  setCatalogCoverAction,
  addPropertyByIdAction,
  addPropertyToCatalogAction,
  previewAutoSelectionAction,
  previewModeAction,
  removeCatalogAdAction,
  searchCatalogPropertiesAction,
  searchCatalogV2Action,
  catalogSearchOptionsAction,
  setCatalogOperationAction,
  previewConversionAction,
  convertCatalogAction,
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
  createClientLinkAction,
  listClientLinksAction,
  renewClientLinkAction,
  revokeClientLinkAction,
  searchClientsForCatalogAction,
  approveCatalogCopyAction,
  withdrawCatalogCopyAction,
  confirmAreaAction,
  clearAreaAction,
  applyAreaTextAction,
  removeAreaTextAction,
  loadTranslationsAction,
  prepareTranslationsNowAction,
  saveTranslationAction,
  markTranslationReviewedAction,
  setCatalogLangAction,
  setLinkLangAction,
} from "../../actions";
import { activeLanguageGaps } from "@/lib/catalogs/translation-service";
import { sqlTranslations } from "@/lib/catalogs/translation-data";
import {
  createGroupAction,
  deleteGroupAction,
  listGroupsAction,
  moveGroupAction,
  previewDeleteGroupAction,
  renameGroupAction,
  reorderGroupsAction,
  setCatalogGroupAction,
} from "../../group-actions";

export const dynamic = "force-dynamic";

/** Gestión de un catálogo (BCP-01 T4/T7/T10). Misma guarda que la HOME;
 *  además el catálogo tiene que ser del dueño (si no, 404 sin revelar que
 *  existe). Con ?medir=1, modo medición de D13. Rediseño 2026-10-23: un
 *  solo título, el de la cabecera compacta del gestor (D4). */
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
  const groups = await listOwnerGroups(profile.id);
  // N5: idiomas activos con viviendas que el cliente ve aún sin traducir (se
  // traducen solas en la próxima visita). Si 0226 no está aplicada, el gestor
  // funciona igual, sin el aviso.
  let translationGaps: Array<{ lang: string; pending: string[] }> = [];
  try {
    translationGaps = await activeLanguageGaps(sqlTranslations(profile.id), id);
  } catch (err) {
    console.warn("[catalogos] traducciones:", err instanceof Error ? err.message : err);
  }
  return (
    <StudioRoot className="mx-auto max-w-[1600px] px-4 lg:px-8">
      <CatalogManager
        catalog={catalog}
        basePath="/es/admin/mi-espacio"
        numberLabel={numberLabel}
        share={share}
        measureMode={medir === "1"}
        texts={texts}
        translationGaps={translationGaps}
        translationActions={{
          load: loadTranslationsAction,
          prepareNow: prepareTranslationsNowAction,
          save: saveTranslationAction,
          markReviewed: markTranslationReviewedAction,
          setCatalogLang: setCatalogLangAction,
          setLinkLang: setLinkLangAction,
        }}
        groups={{
          initial: groups,
          actions: {
            list: listGroupsAction,
            create: createGroupAction,
            rename: renameGroupAction,
            reorder: reorderGroupsAction,
            move: moveGroupAction,
            previewDelete: previewDeleteGroupAction,
            remove: deleteGroupAction,
            setMember: setCatalogGroupAction,
          },
        }}
        shareActions={{ create: createShareAction, renew: renewShareAction, revoke: revokeShareAction }}
        clientLinkActions={{
          list: listClientLinksAction,
          search: searchClientsForCatalogAction,
          create: createClientLinkAction,
          renew: renewClientLinkAction,
          revoke: revokeClientLinkAction,
        }}
        actions={{
          updateMeta: updateCatalogMetaAction,
          addProperty: addPropertyToCatalogAction,
          removeProperty: removePropertyFromCatalogAction,
          reorder: reorderCatalogAction,
          setStatus: setCatalogStatusAction,
          setContact: setCatalogContactAction,
          addPropertyById: addPropertyByIdAction,
          search: searchCatalogPropertiesAction,
          catalogSearch: { search: searchCatalogV2Action, options: catalogSearchOptionsAction },
          setOperation: setCatalogOperationAction,
          conversion: { preview: previewConversionAction, convert: convertCatalogAction },
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
          photos: { list: listCatalogPhotosAction, setExcluded: setCatalogPhotoExcludedAction, setOpening: setCatalogPhotoOpeningAction, setNoFinish: setCatalogPhotoNoFinishAction },
          setPhotoFinish: setCatalogPhotoFinishAction,
          texts: {
            prepare: prepareCatalogTextAction,
            draft: draftCatalogTextAction,
            save: saveCatalogTextDraftAction,
            publish: publishCatalogTextAction,
            withdraw: withdrawCatalogTextAction,
            remove: deleteCatalogTextAction,
            preview: previewCatalogTextAction,
            approveCopy: approveCatalogCopyAction,
            withdrawCopy: withdrawCatalogCopyAction,
            confirmArea: confirmAreaAction,
            clearArea: clearAreaAction,
            applyAreaText: applyAreaTextAction,
            removeAreaText: removeAreaTextAction,
          },
        }}
      />
    </StudioRoot>
  );
}
