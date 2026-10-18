import {
  confirmImportDraftAction,
  createLinkDraftAction,
  createPdfDraftAction,
  discardImportDraftAction,
  findImportDuplicatesAction,
  getImportDraftAction,
  listImportDraftsAction,
  runImportCatalogAction,
  runImportClientLinkAction,
  runImportPhotosAction,
  updateImportDraftAction,
} from "@/app/(admin)/admin/propiedades/importar/draft-actions";

// Las acciones del importador llegan por props (como en el buscador del
// catálogo) para poder probar la interfaz con datos sintéticos
// (/dev-fixtures/importar) sin base de datos.

export const REAL_IMPORT_ACTIONS = {
  list: listImportDraftsAction,
  get: getImportDraftAction,
  createLink: createLinkDraftAction,
  createPdf: createPdfDraftAction,
  update: updateImportDraftAction,
  discard: discardImportDraftAction,
  duplicates: findImportDuplicatesAction,
  confirm: confirmImportDraftAction,
  photos: runImportPhotosAction,
  catalog: runImportCatalogAction,
  clientLink: runImportClientLinkAction,
};

export type ImportDraftActions = typeof REAL_IMPORT_ACTIONS;
