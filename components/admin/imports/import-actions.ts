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
import type { Country } from "@/lib/country-config";
import type { DraftPhoto } from "@/lib/imports/draft-model";

// Las acciones del importador llegan por props (como en el buscador del
// catálogo) para poder probar la interfaz con datos sintéticos
// (/dev-fixtures/importar) sin base de datos.

/** Dónde se ve una foto del borrador: la remota por su URL; la subida, por la ruta privada. */
export function draftPhotoSrc(draftId: string, country: Country, p: DraftPhoto): string {
  return p.kind === "remote" ? p.url : `/api/admin/import-drafts/${draftId}/photos/${encodeURIComponent(p.id)}?country=${country}`;
}

/** Sube una foto (ya reducida en el navegador) al borrador de PDF. Ruta con su propia barrera (P5). */
async function uploadDraftPhoto(country: Country, draftId: string, file: Blob, page: number | null): Promise<{ ok: true; photo: DraftPhoto } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("file", file, "foto.jpg");
  if (page) form.append("page", String(page));
  try {
    const res = await fetch(`/api/admin/import-drafts/${draftId}/photos?country=${country}`, { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; photo?: DraftPhoto; error?: string } | null;
    if (res.ok && body?.ok && body.photo) return { ok: true, photo: body.photo };
    return { ok: false, error: body?.error ?? (res.status === 413 ? "La foto pesa demasiado." : `Error ${res.status} al subir la foto.`) };
  } catch {
    return { ok: false, error: "Se cortó la conexión al subir la foto." };
  }
}

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
  uploadPhoto: uploadDraftPhoto,
  photoSrc: draftPhotoSrc,
};

export type ImportDraftActions = typeof REAL_IMPORT_ACTIONS;
