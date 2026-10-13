// ============================================================================
// Estado del lector del catálogo (BCP-01 T8/T9, D12). Puro: se prueba sin
// navegador en scripts/test-catalogs-public.mts.
//
// Páginas lógicas: portada · índice (con la introducción) · una por vivienda ·
// cierre. En pantallas grandes cada vivienda se pinta como doble página; la
// lógica es la misma.
//
// D12 al llegar una versión nueva:
//   · la vivienda que se lee sigue → se queda en ella (aunque cambie de sitio);
//   · desaparece → pasa a la SIGUIENTE que seguía en el orden anterior y
//     sigue existiendo, con un aviso;
//   · no queda ninguna siguiente → vuelve al índice;
//   · no queda ninguna vivienda → índice con el estado vacío.
// La galería abierta se actualiza al momento; si su vivienda desaparece, se
// cierra y se aplica D12.
// ============================================================================

import type { PublicCatalog, PublicCatalogState } from "./public-contract";

export type PageRef = { kind: "cover" } | { kind: "index" } | { kind: "item"; key: string } | { kind: "closing" };

export interface GalleryRef {
  key: string;
  photo: number;
}

export interface ReaderState {
  catalog: PublicCatalog;
  fingerprint: string;
  expiresAt: string;
  page: PageRef;
  gallery: GalleryRef | null;
  notice: string | null;
}

/** Duración del paso de página; con «reducir movimiento», 0. */
export const PAGE_TURN_MS = 380;

export const REMOVED_NOTICE = "La vivienda que estabas viendo ya no forma parte de la selección.";
export const REMOVED_LAST_NOTICE = "La vivienda que estabas viendo ya no forma parte de la selección. Vuelves al índice.";

export function pagesOf(catalog: PublicCatalog): PageRef[] {
  return [
    { kind: "cover" },
    { kind: "index" },
    ...catalog.items.map((it) => ({ kind: "item" as const, key: it.key })),
    { kind: "closing" },
  ];
}

export function samePage(a: PageRef, b: PageRef): boolean {
  return a.kind === b.kind && (a.kind !== "item" || (b.kind === "item" && a.key === b.key));
}

export function pageIndex(catalog: PublicCatalog, page: PageRef): number {
  const i = pagesOf(catalog).findIndex((p) => samePage(p, page));
  return i < 0 ? 0 : i;
}

export function initialState(s: PublicCatalogState, start: PageRef = { kind: "cover" }): ReaderState {
  const exists = start.kind !== "item" || s.catalog.items.some((it) => it.key === start.key);
  return {
    catalog: s.catalog,
    fingerprint: s.fingerprint,
    expiresAt: s.expiresAt,
    page: exists ? start : { kind: "cover" },
    gallery: null,
    notice: null,
  };
}

export function goTo(state: ReaderState, page: PageRef): ReaderState {
  return { ...state, page, gallery: null, notice: null };
}

export function step(state: ReaderState, delta: 1 | -1): ReaderState {
  const pages = pagesOf(state.catalog);
  const i = pageIndex(state.catalog, state.page);
  const j = Math.min(pages.length - 1, Math.max(0, i + delta));
  return j === i ? state : goTo(state, pages[j]);
}

export function openGallery(state: ReaderState, key: string, photo = 0): ReaderState {
  const it = state.catalog.items.find((x) => x.key === key);
  if (!it || it.photos.length === 0) return state;
  return { ...state, gallery: { key, photo: Math.min(Math.max(0, photo), it.photos.length - 1) } };
}

export function closeGallery(state: ReaderState): ReaderState {
  return { ...state, gallery: null };
}

export function galleryStep(state: ReaderState, delta: 1 | -1): ReaderState {
  if (!state.gallery) return state;
  const it = state.catalog.items.find((x) => x.key === state.gallery!.key);
  if (!it || it.photos.length === 0) return closeGallery(state);
  const n = it.photos.length;
  return { ...state, gallery: { key: it.key, photo: (state.gallery.photo + delta + n) % n } };
}

/** Aplica una versión nueva del servidor (D12). */
export function applyUpdate(state: ReaderState, next: PublicCatalogState): ReaderState {
  if (next.fingerprint === state.fingerprint) {
    return state.expiresAt === next.expiresAt ? state : { ...state, expiresAt: next.expiresAt };
  }
  const newKeys = new Set(next.catalog.items.map((it) => it.key));
  let page = state.page;
  let notice: string | null = null;
  if (page.kind === "item" && !newKeys.has(page.key)) {
    const oldItems = state.catalog.items;
    const at = oldItems.findIndex((it) => it.key === (page as { key: string }).key);
    const following = oldItems.slice(at + 1).find((it) => newKeys.has(it.key));
    if (following) {
      page = { kind: "item", key: following.key };
      notice = REMOVED_NOTICE;
    } else {
      page = { kind: "index" };
      notice = REMOVED_LAST_NOTICE;
    }
  }
  let gallery = state.gallery;
  if (gallery) {
    const it = next.catalog.items.find((x) => x.key === gallery!.key);
    if (!it || it.photos.length === 0) gallery = null;
    else if (gallery.photo >= it.photos.length) gallery = { key: it.key, photo: it.photos.length - 1 };
  }
  return { catalog: next.catalog, fingerprint: next.fingerprint, expiresAt: next.expiresAt, page, gallery, notice };
}

/**
 * Cuánto esperar antes de aplicar una versión que llega ahora (E4). Solo se
 * espera a que termine un paso de página en curso, como mucho PAGE_TURN_MS
 * (0 con «reducir movimiento»). Con la galería abierta se aplica al momento.
 */
export function updateDelay(opts: {
  now: number;
  turnStartedAt: number | null;
  reducedMotion: boolean;
  galleryOpen: boolean;
}): number {
  if (opts.galleryOpen || opts.reducedMotion || opts.turnStartedAt === null) return 0;
  const left = opts.turnStartedAt + PAGE_TURN_MS - opts.now;
  return Math.max(0, Math.min(PAGE_TURN_MS, left));
}
